import { NoteName, Repertoire, RepertoireSong } from "@louvorflow/shared";
import { getPool, sql } from "../db";
import { getCurrentWorkspaceId } from "../workspaceContext";

export type RepertoireListPeriod = "upcoming" | "past";

export type RepertoirePage = {
  items: Repertoire[];
  nextCursor: string | null;
};

export type RepertoireListPageOptions = {
  cursor?: string;
  limit: number;
  period: RepertoireListPeriod;
  query?: string;
};

export async function listRepertoires(): Promise<Repertoire[]> {
  try {
    var pool = await getPool();
    var workspaceId = getCurrentWorkspaceId();
    var result = await pool
      .request()
      .input("workspaceId", sql.NVarChar(80), workspaceId)
      .query(
        "select Id, Name, EventDate, EventTime, Description from Repertoires " +
          "where WorkspaceId = @workspaceId order by EventDate desc, Name"
      );
    var repertoires = result.recordset.map(mapRepertoireRecord);

    return attachSongs(repertoires);
  } catch (error) {
    return [];
  }
}

export async function listRepertoiresPage(options: RepertoireListPageOptions): Promise<RepertoirePage> {
  try {
    var pool = await getPool();
    var workspaceId = getCurrentWorkspaceId();
    var limit = Math.max(1, Math.min(options.limit || 15, 50));
    var cursor = decodeRepertoireCursor(options.cursor || "");
    var isPast = options.period === "past";
    var today = formatDateInput(new Date());
    var query = (options.query || "").trim();
    var whereClauses = ["WorkspaceId = @workspaceId"];
    var request = pool
      .request()
      .input("workspaceId", sql.NVarChar(80), workspaceId)
      .input("today", sql.Date, parseDateInput(today))
      .input("limit", sql.Int, limit + 1);

    if (isPast) {
      whereClauses.push("EventDate < @today");
    } else {
      whereClauses.push("EventDate >= @today");
    }

    if (query) {
      request.input("query", sql.NVarChar(220), "%" + query.replace(/[%_[\]]/g, "[$&]") + "%");
      whereClauses.push("Name like @query");
    }

    if (cursor) {
      request
        .input("cursorDate", sql.Date, parseDateInput(cursor.date))
        .input("cursorId", sql.NVarChar(80), cursor.id);
      whereClauses.push(isPast
        ? "(EventDate < @cursorDate or (EventDate = @cursorDate and Id > @cursorId))"
        : "(EventDate > @cursorDate or (EventDate = @cursorDate and Id > @cursorId))"
      );
    }

    var orderBy = isPast ? "EventDate desc, Id asc" : "EventDate asc, Id asc";
    var result = await request.query(
      "select top (@limit) Id, Name, EventDate, EventTime, Description from Repertoires " +
        "where " + whereClauses.join(" and ") + " order by " + orderBy
    );
    var records = result.recordset.slice(0, limit);
    var repertoires = await attachSongs(records.map(mapRepertoireRecord));
    var nextCursor = result.recordset.length > limit && repertoires.length
      ? encodeRepertoireCursor(repertoires[repertoires.length - 1])
      : null;

    return {
      items: repertoires,
      nextCursor: nextCursor
    };
  } catch (error) {
    return {
      items: [],
      nextCursor: null
    };
  }
}

export async function getRepertoireById(id: string): Promise<Repertoire | null> {
  try {
    var pool = await getPool();
    var workspaceId = getCurrentWorkspaceId();
    var result = await pool
      .request()
      .input("id", sql.NVarChar(80), id)
      .input("workspaceId", sql.NVarChar(80), workspaceId)
      .query("select top 1 Id, Name, EventDate, EventTime, Description from Repertoires where Id = @id and WorkspaceId = @workspaceId");

    if (!result.recordset.length) {
      return null;
    }

    var repertoires = await attachSongs([mapRepertoireRecord(result.recordset[0])]);
    return repertoires[0] || null;
  } catch (error) {
    return null;
  }
}

export async function saveRepertoire(repertoire: Repertoire): Promise<Repertoire> {
  var normalizedRepertoire = normalizeRepertoire(repertoire);
  var pool = await getPool();
  var workspaceId = getCurrentWorkspaceId();
  var transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    await new sql.Request(transaction)
      .input("id", sql.NVarChar(80), normalizedRepertoire.id)
      .input("workspaceId", sql.NVarChar(80), workspaceId)
      .input("name", sql.NVarChar(200), normalizedRepertoire.name)
      .input("eventDate", sql.Date, parseDateInput(normalizedRepertoire.date))
      .input("eventTime", sql.Time(0), parseTimeInput(normalizedRepertoire.eventTime))
      .input("description", sql.NVarChar(1000), normalizedRepertoire.description || "")
      .query(
        "merge Repertoires as target " +
          "using (select @id as Id, @workspaceId as WorkspaceId) as source on target.Id = source.Id and target.WorkspaceId = source.WorkspaceId " +
          "when matched then update set Name = @name, EventDate = @eventDate, EventTime = @eventTime, Description = @description, UpdatedAt = sysdatetime() " +
          "when not matched then insert (Id, WorkspaceId, Name, EventDate, EventTime, Description) values (@id, @workspaceId, @name, @eventDate, @eventTime, @description);"
      );

    await new sql.Request(transaction)
      .input("id", sql.NVarChar(80), normalizedRepertoire.id)
      .input("workspaceId", sql.NVarChar(80), workspaceId)
      .query(
        "delete rs from RepertoireSongs rs " +
          "inner join Repertoires r on r.Id = rs.RepertoireId " +
          "where rs.RepertoireId = @id and r.WorkspaceId = @workspaceId"
      );

    for (var index = 0; index < normalizedRepertoire.songs.length; index += 1) {
      var item = normalizedRepertoire.songs[index];
      var insertResult = await new sql.Request(transaction)
        .input("repertoireId", sql.NVarChar(80), normalizedRepertoire.id)
        .input("workspaceId", sql.NVarChar(80), workspaceId)
        .input("songId", sql.NVarChar(80), item.songId)
        .input("songOrder", sql.Int, item.order || index + 1)
        .input("songKey", sql.NVarChar(8), item.key)
        .input("capo", sql.Int, item.capo || 0)
        .input("notes", sql.NVarChar(600), item.note || "")
        .query(
          "insert into RepertoireSongs (RepertoireId, SongId, SongOrder, SongKey, Capo, Notes) " +
            "select @repertoireId, s.Id, @songOrder, @songKey, @capo, @notes " +
            "from Songs s " +
            "inner join Repertoires r on r.Id = @repertoireId and r.WorkspaceId = @workspaceId " +
            "where s.Id = @songId"
        );

      if (!insertResult.rowsAffected[0]) {
        throw new Error("Musica do repertorio nao encontrada no workspace atual.");
      }
    }

    await transaction.commit();
    return normalizedRepertoire;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteRepertoire(id: string): Promise<boolean> {
  var pool = await getPool();
  var workspaceId = getCurrentWorkspaceId();
  var result = await pool
    .request()
    .input("id", sql.NVarChar(80), id)
    .input("workspaceId", sql.NVarChar(80), workspaceId)
    .query(
      "delete rs from RepertoireSongs rs inner join Repertoires r on r.Id = rs.RepertoireId " +
        "where rs.RepertoireId = @id and r.WorkspaceId = @workspaceId; " +
        "delete from Repertoires where Id = @id and WorkspaceId = @workspaceId;"
    );

  return Boolean(result.rowsAffected[result.rowsAffected.length - 1]);
}

async function attachSongs(repertoires: Repertoire[]): Promise<Repertoire[]> {
  if (!repertoires.length) {
    return repertoires;
  }

  var pool = await getPool();
  var workspaceId = getCurrentWorkspaceId();
  var ids = repertoires.map(function (repertoire) {
    return "'" + repertoire.id.replace(/'/g, "''") + "'";
  });
  var result = await pool
    .request()
    .input("workspaceId", sql.NVarChar(80), workspaceId)
    .query(
    "select RepertoireId, SongId, SongOrder, SongKey, Capo, Notes " +
      "from RepertoireSongs rs " +
      "inner join Repertoires r on r.Id = rs.RepertoireId " +
      "where rs.RepertoireId in (" + ids.join(",") + ") " +
      "and r.WorkspaceId = @workspaceId " +
      "order by RepertoireId, SongOrder"
    );
  var songsByRepertoire: Record<string, RepertoireSong[]> = {};

  result.recordset.forEach(function (record: any) {
    var repertoireId = record.RepertoireId;
    if (!songsByRepertoire[repertoireId]) {
      songsByRepertoire[repertoireId] = [];
    }

    songsByRepertoire[repertoireId].push({
      songId: record.SongId,
      order: record.SongOrder,
      key: record.SongKey,
      capo: record.Capo,
      note: record.Notes || ""
    });
  });

  return repertoires.map(function (repertoire) {
    return {
      ...repertoire,
      songs: songsByRepertoire[repertoire.id] || []
    };
  });
}

function normalizeRepertoire(repertoire: Repertoire): Repertoire {
  var name = (repertoire.name || "").trim() || "Novo repertorio";

  return {
    id: repertoire.id || slugify(name),
    name: name,
    date: repertoire.date || formatDateInput(new Date()),
    eventTime: normalizeTime(repertoire.eventTime),
    description: (repertoire.description || "").trim(),
    songs: (repertoire.songs || []).map(function (item, index) {
      return {
        songId: item.songId,
        order: item.order || index + 1,
        key: item.key || "C" as NoteName,
        capo: item.capo || 0,
        note: item.note || ""
      };
    })
  };
}

function mapRepertoireRecord(record: any): Repertoire {
  return {
    id: record.Id,
    name: record.Name,
    date: formatDateRecord(record.EventDate),
    eventTime: formatTimeRecord(record.EventTime),
    description: record.Description || "",
    songs: []
  };
}

function parseDateInput(value: string) {
  var parts = value.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function parseTimeInput(value?: string) {
  if (!value) {
    return null;
  }

  var parts = value.split(":");
  return new Date(Date.UTC(1970, 0, 1, Number(parts[0]), Number(parts[1] || 0), Number(parts[2] || 0)));
}

function formatDateRecord(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return formatDateInputUtc(value);
}

function formatDateInput(date: Date) {
  var month = String(date.getMonth() + 1);
  var day = String(date.getDate());
  if (month.length === 1) {
    month = "0" + month;
  }
  if (day.length === 1) {
    day = "0" + day;
  }
  return date.getFullYear() + "-" + month + "-" + day;
}

function formatDateInputUtc(date: Date) {
  var month = String(date.getUTCMonth() + 1);
  var day = String(date.getUTCDate());
  if (month.length === 1) {
    month = "0" + month;
  }
  if (day.length === 1) {
    day = "0" + day;
  }
  return date.getUTCFullYear() + "-" + month + "-" + day;
}

function formatTimeRecord(value: Date | string | null) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 5);
  }

  var hours = String(value.getUTCHours());
  var minutes = String(value.getUTCMinutes());
  if (hours.length === 1) {
    hours = "0" + hours;
  }
  if (minutes.length === 1) {
    minutes = "0" + minutes;
  }
  return hours + ":" + minutes;
}

function normalizeTime(value?: string) {
  if (!value) {
    return "";
  }

  return value.slice(0, 5);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "repertorio";
}

function encodeRepertoireCursor(repertoire: Repertoire) {
  return Buffer.from(JSON.stringify({ date: repertoire.date, id: repertoire.id }), "utf8").toString("base64");
}

function decodeRepertoireCursor(value: string): { date: string; id: string } | null {
  if (!value) {
    return null;
  }

  try {
    var cursor = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as { date?: string; id?: string };
    if (!cursor.date || !cursor.id) {
      return null;
    }

    return {
      date: cursor.date,
      id: cursor.id
    };
  } catch (error) {
    return null;
  }
}
