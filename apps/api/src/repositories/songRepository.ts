import { Song } from "@louvorflow/shared";
import { getPool, sql } from "../db";
import { getCurrentWorkspaceId } from "../workspaceContext";

export type TopArtist = {
  name: string;
  songCount: number;
};

export type SongPage = {
  items: Song[];
  nextCursor: string | null;
};

export type SongListOptions = {
  cursor?: string;
  limit?: number;
};

type SongCursor = {
  id: string;
  title: string;
  rank?: number;
};

export async function listSongs(search?: string): Promise<Song[]> {
  try {
    var pool = await getPool();
    var normalizedSearch = normalizeSongSearch(search || "");

    if (normalizedSearch) {
      var fullTextSearch = buildFullTextSearch(normalizedSearch);

      if (fullTextSearch && shouldUseFullTextSearch(normalizedSearch)) {
        try {
          var fullTextSongs = await searchSongsByFullText(pool, fullTextSearch);
          if (fullTextSongs.length) {
            return fullTextSongs;
          }

          return await searchSongsByTerms(pool, normalizedSearch);
        } catch (error) {
          return await searchSongsByTerms(pool, normalizedSearch);
        }
      }

      return await searchSongsByLike(pool, normalizedSearch);
    }

    var result = await pool
      .request()
      .query(
        "select Id, Title, Artist, OriginalKey, CurrentKey, Bpm, TimeSignature, IsFavorite, SectionsJson, RawChart " +
          "from Songs order by Title"
      );

    return result.recordset.map(mapSongRecord);
  } catch (error) {
    return [];
  }
}

export async function listSongsPage(search?: string, options?: SongListOptions): Promise<SongPage> {
  try {
    var pool = await getPool();
    var normalizedSearch = normalizeSongSearch(search || "");
    var safeLimit = normalizeSongPageLimit(options?.limit);
    var cursor = decodeSongCursor(options?.cursor);

    if (normalizedSearch) {
      var fullTextSearch = buildFullTextSearch(normalizedSearch);

      if (fullTextSearch && shouldUseFullTextSearch(normalizedSearch)) {
        try {
          var fullTextPage = await searchSongsByFullTextPage(pool, fullTextSearch, safeLimit, cursor);
          if (fullTextPage.items.length || options?.cursor) {
            return fullTextPage;
          }

          return await searchSongsByTermsPage(pool, normalizedSearch, safeLimit, cursor);
        } catch (error) {
          return await searchSongsByTermsPage(pool, normalizedSearch, safeLimit, cursor);
        }
      }

      return await searchSongsByLikePage(pool, normalizedSearch, safeLimit, cursor);
    }

    return await listSongsByCursor(pool, safeLimit, cursor);
  } catch (error) {
    return { items: [], nextCursor: null };
  }
}

function normalizeSongSearch(search: string) {
  return search.trim().replace(/\s+/g, " ");
}

function escapeLikeSearch(search: string) {
  return search.replace(/[\\%_\[]/g, function (value) {
    return "\\" + value;
  });
}

async function searchSongsByFullText(pool: any, fullTextSearch: string): Promise<Song[]> {
  var searchResult = await pool
    .request()
    .input("fullTextSearch", sql.NVarChar(4000), fullTextSearch)
    .query(
      "select s.Id, s.Title, s.Artist, s.OriginalKey, s.CurrentKey, s.Bpm, s.TimeSignature, s.IsFavorite, s.SectionsJson, s.RawChart " +
        "from Songs s " +
        "inner join containstable(dbo.Songs, (Title, Artist, RawChart), @fullTextSearch) ft on ft.[KEY] = s.Id " +
        "order by ft.[RANK] desc, s.Title"
    );

  return searchResult.recordset.map(mapSongRecord);
}

async function searchSongsByFullTextPage(pool: any, fullTextSearch: string, limit: number, cursor: SongCursor | null): Promise<SongPage> {
  var take = limit + 1;
  var cursorRank = typeof cursor?.rank === "number" ? cursor.rank : 2147483647;
  var cursorTitle = cursor?.title || "";
  var cursorId = cursor?.id || "";
  var searchResult = await pool
    .request()
    .input("fullTextSearch", sql.NVarChar(4000), fullTextSearch)
    .input("take", sql.Int, take)
    .input("cursorRank", sql.Int, cursorRank)
    .input("cursorTitle", sql.NVarChar(200), cursorTitle)
    .input("cursorId", sql.NVarChar(80), cursorId)
    .query(
      "select top (@take) s.Id, s.Title, s.Artist, s.OriginalKey, s.CurrentKey, s.Bpm, s.TimeSignature, s.IsFavorite, s.SectionsJson, s.RawChart, ft.[RANK] as SearchRank " +
        "from Songs s " +
        "inner join containstable(dbo.Songs, (Title, Artist, RawChart), @fullTextSearch) ft on ft.[KEY] = s.Id " +
        "where @cursorId = '' or ft.[RANK] < @cursorRank or (ft.[RANK] = @cursorRank and s.Title > @cursorTitle) or (ft.[RANK] = @cursorRank and s.Title = @cursorTitle and s.Id > @cursorId) " +
        "order by ft.[RANK] desc, s.Title asc, s.Id asc"
    );

  return createSongPage(searchResult.recordset, limit, true);
}

async function searchSongsByLike(pool: any, normalizedSearch: string): Promise<Song[]> {
  var searchResult = await pool
    .request()
    .input("search", sql.NVarChar(500), "%" + escapeLikeSearch(normalizedSearch) + "%")
    .query(
      "select Id, Title, Artist, OriginalKey, CurrentKey, Bpm, TimeSignature, IsFavorite, SectionsJson, RawChart " +
        "from Songs " +
        "where Title like @search escape '\\' or Artist like @search escape '\\' or RawChart like @search escape '\\' " +
        "order by Title"
    );

  return searchResult.recordset.map(mapSongRecord);
}

async function searchSongsByLikePage(pool: any, normalizedSearch: string, limit: number, cursor: SongCursor | null): Promise<SongPage> {
  var take = limit + 1;
  var cursorTitle = cursor?.title || "";
  var cursorId = cursor?.id || "";
  var searchResult = await pool
    .request()
    .input("take", sql.Int, take)
    .input("search", sql.NVarChar(500), "%" + escapeLikeSearch(normalizedSearch) + "%")
    .input("cursorTitle", sql.NVarChar(200), cursorTitle)
    .input("cursorId", sql.NVarChar(80), cursorId)
    .query(
      "select top (@take) Id, Title, Artist, OriginalKey, CurrentKey, Bpm, TimeSignature, IsFavorite, SectionsJson, RawChart " +
        "from Songs " +
        "where (Title like @search escape '\\' or Artist like @search escape '\\' or RawChart like @search escape '\\') " +
        "and (@cursorId = '' or Title > @cursorTitle or (Title = @cursorTitle and Id > @cursorId)) " +
        "order by Title asc, Id asc"
    );

  return createSongPage(searchResult.recordset, limit);
}

async function searchSongsByTerms(pool: any, normalizedSearch: string): Promise<Song[]> {
  var terms = buildSearchTerms(normalizedSearch);

  if (!terms.length) {
    return searchSongsByLike(pool, normalizedSearch);
  }

  var request = pool.request();
  var clauses = terms.map(function (term, index) {
    var parameterName = "term" + index;
    request.input(parameterName, sql.NVarChar(500), "%" + escapeLikeSearch(term) + "%");
    return (
      "(Title like @" +
      parameterName +
      " escape '\\' or Artist like @" +
      parameterName +
      " escape '\\' or RawChart like @" +
      parameterName +
      " escape '\\')"
    );
  });

  var searchResult = await request.query(
    "select Id, Title, Artist, OriginalKey, CurrentKey, Bpm, TimeSignature, IsFavorite, SectionsJson, RawChart " +
      "from Songs " +
      "where " +
      clauses.join(" and ") +
      " order by Title"
  );

  return searchResult.recordset.map(mapSongRecord);
}

async function searchSongsByTermsPage(pool: any, normalizedSearch: string, limit: number, cursor: SongCursor | null): Promise<SongPage> {
  var terms = buildSearchTerms(normalizedSearch);

  if (!terms.length) {
    return searchSongsByLikePage(pool, normalizedSearch, limit, cursor);
  }

  var take = limit + 1;
  var cursorTitle = cursor?.title || "";
  var cursorId = cursor?.id || "";
  var request = pool.request();
  request.input("take", sql.Int, take);
  request.input("cursorTitle", sql.NVarChar(200), cursorTitle);
  request.input("cursorId", sql.NVarChar(80), cursorId);

  var clauses = terms.map(function (term, index) {
    var parameterName = "term" + index;
    request.input(parameterName, sql.NVarChar(500), "%" + escapeLikeSearch(term) + "%");
    return (
      "(Title like @" +
      parameterName +
      " escape '\\' or Artist like @" +
      parameterName +
      " escape '\\' or RawChart like @" +
      parameterName +
      " escape '\\')"
    );
  });

  var searchResult = await request.query(
    "select top (@take) Id, Title, Artist, OriginalKey, CurrentKey, Bpm, TimeSignature, IsFavorite, SectionsJson, RawChart " +
      "from Songs " +
      "where " +
      clauses.join(" and ") +
      " and (@cursorId = '' or Title > @cursorTitle or (Title = @cursorTitle and Id > @cursorId)) " +
      "order by Title asc, Id asc"
  );

  return createSongPage(searchResult.recordset, limit);
}

async function listSongsByCursor(pool: any, limit: number, cursor: SongCursor | null): Promise<SongPage> {
  var take = limit + 1;
  var cursorTitle = cursor?.title || "";
  var cursorId = cursor?.id || "";
  var result = await pool
    .request()
    .input("take", sql.Int, take)
    .input("cursorTitle", sql.NVarChar(200), cursorTitle)
    .input("cursorId", sql.NVarChar(80), cursorId)
    .query(
      "select top (@take) Id, Title, Artist, OriginalKey, CurrentKey, Bpm, TimeSignature, IsFavorite, SectionsJson, RawChart " +
        "from Songs " +
        "where @cursorId = '' or Title > @cursorTitle or (Title = @cursorTitle and Id > @cursorId) " +
        "order by Title asc, Id asc"
    );

  return createSongPage(result.recordset, limit);
}

function normalizeSongPageLimit(limit?: number) {
  return Math.max(1, Math.min(Number(limit) || 15, 100));
}

function createSongPage(records: any[], limit: number, ranked?: boolean): SongPage {
  var hasMore = records.length > limit;
  var visibleRecords = hasMore ? records.slice(0, limit) : records;
  var lastRecord = visibleRecords[visibleRecords.length - 1];

  return {
    items: visibleRecords.map(mapSongRecord),
    nextCursor: hasMore && lastRecord ? encodeSongCursor(lastRecord, ranked) : null
  };
}

function encodeSongCursor(record: any, ranked?: boolean) {
  var cursor: SongCursor = {
    id: record.Id,
    title: record.Title
  };

  if (ranked) {
    cursor.rank = Number(record.SearchRank) || 0;
  }

  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

function decodeSongCursor(cursor?: string): SongCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    var parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf8")) as SongCursor;
    if (!parsed || !parsed.id || typeof parsed.title !== "string") {
      return null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}

function buildFullTextSearch(search: string) {
  var terms = buildSearchTerms(search);

  if (!terms.length) {
    return "";
  }

  return terms
    .map(function (term) {
      return '"' + term + '*"';
    })
    .join(" AND ");
}

function buildSearchTerms(search: string) {
  return search
    .split(/\s+/)
    .map(normalizeFullTextTerm)
    .filter(function (term) {
      return term.length > 0;
    })
    .slice(0, 8);
}

function normalizeFullTextTerm(term: string) {
  return term.replace(/[^0-9A-Za-zÀ-ÖØ-öø-ÿ]+/g, "").trim();
}

function shouldUseFullTextSearch(search: string) {
  return !/[#\/()]/.test(search);
}

export async function listPopularSongs(limit: number): Promise<Song[]> {
  try {
    var safeLimit = Math.max(1, Math.min(limit || 10, 200));
    var pool = await getPool();
    var result = await pool
      .request()
      .input("limit", sql.Int, safeLimit)
      .query(
        "select top (@limit) s.Id, s.Title, s.Artist, s.OriginalKey, s.CurrentKey, s.Bpm, s.TimeSignature, s.IsFavorite, s.SectionsJson, s.RawChart " +
          "from Songs s " +
          "inner join RepertoireSongs rs on rs.SongId = s.Id " +
          "inner join Repertoires r on r.Id = rs.RepertoireId " +
          "group by s.Id, s.Title, s.Artist, s.OriginalKey, s.CurrentKey, s.Bpm, s.TimeSignature, s.IsFavorite, s.SectionsJson, s.RawChart " +
          "order by count(rs.Id) desc, max(r.UpdatedAt) desc, s.Title asc"
      );

    return result.recordset.map(mapSongRecord);
  } catch (error) {
    return [];
  }
}

export async function listTopArtists(limit: number): Promise<TopArtist[]> {
  try {
    var safeLimit = Math.max(1, Math.min(limit || 10, 200));
    var pool = await getPool();
    var result = await pool
      .request()
      .input("limit", sql.Int, safeLimit)
      .query(
        "select top (@limit) ltrim(rtrim(s.Artist)) as Artist, count(distinct s.Id) as SongCount " +
          "from Songs s " +
          "inner join RepertoireSongs rs on rs.SongId = s.Id " +
          "inner join Repertoires r on r.Id = rs.RepertoireId " +
          "where nullif(ltrim(rtrim(s.Artist)), '') is not null " +
          "group by ltrim(rtrim(s.Artist)) " +
          "order by count(rs.Id) desc, count(distinct s.Id) desc, max(r.UpdatedAt) desc, ltrim(rtrim(s.Artist)) asc"
      );

    return result.recordset.map(mapTopArtistRecord);
  } catch (error) {
    return [];
  }
}

export async function getSongById(id: string): Promise<Song | null> {
  try {
    var pool = await getPool();
    var result = await pool
      .request()
      .input("id", sql.NVarChar(80), id)
      .query(
        "select top 1 Id, Title, Artist, OriginalKey, CurrentKey, Bpm, TimeSignature, IsFavorite, SectionsJson, RawChart " +
          "from Songs where Id = @id"
      );

    if (!result.recordset.length) {
      return null;
    }

    return mapSongRecord(result.recordset[0]);
  } catch (error) {
    return null;
  }
}

export async function saveSong(song: Song): Promise<Song> {
  var pool = await getPool();
  var workspaceId = getCurrentWorkspaceId();
  await pool
    .request()
    .input("id", sql.NVarChar(80), song.id)
    .input("workspaceId", sql.NVarChar(80), workspaceId)
    .input("title", sql.NVarChar(200), song.title)
    .input("artist", sql.NVarChar(200), song.artist)
    .input("originalKey", sql.NVarChar(8), song.originalKey)
    .input("currentKey", sql.NVarChar(8), song.currentKey)
    .input("bpm", sql.Int, song.bpm)
    .input("timeSignature", sql.NVarChar(12), song.timeSignature)
    .input("isFavorite", sql.Bit, song.favorite ? 1 : 0)
    .input("sectionsJson", sql.NVarChar(sql.MAX), JSON.stringify(song.sections))
    .input("rawChart", sql.NVarChar(sql.MAX), song.rawChart || "")
    .query(
      "merge Songs as target " +
        "using (select @id as Id, @workspaceId as WorkspaceId) as source on target.Id = source.Id and target.WorkspaceId = source.WorkspaceId " +
        "when matched then update set Title = @title, Artist = @artist, OriginalKey = @originalKey, CurrentKey = @currentKey, Bpm = @bpm, TimeSignature = @timeSignature, IsFavorite = @isFavorite, SectionsJson = @sectionsJson, RawChart = @rawChart, UpdatedAt = sysdatetime() " +
        "when not matched then insert (Id, WorkspaceId, Title, Artist, OriginalKey, CurrentKey, Bpm, TimeSignature, IsFavorite, SectionsJson, RawChart) values (@id, @workspaceId, @title, @artist, @originalKey, @currentKey, @bpm, @timeSignature, @isFavorite, @sectionsJson, @rawChart);"
    );

  return song;
}

export async function deleteSong(id: string): Promise<boolean> {
  var pool = await getPool();
  var workspaceId = getCurrentWorkspaceId();
  var result = await pool
    .request()
    .input("id", sql.NVarChar(80), id)
    .input("workspaceId", sql.NVarChar(80), workspaceId)
    .query(
      "delete rs from RepertoireSongs rs " +
        "inner join Repertoires r on r.Id = rs.RepertoireId " +
        "inner join Songs s on s.Id = rs.SongId " +
        "where rs.SongId = @id and r.WorkspaceId = @workspaceId and s.WorkspaceId = @workspaceId; " +
        "delete from Songs where Id = @id and WorkspaceId = @workspaceId;"
    );

  return Boolean(result.rowsAffected[result.rowsAffected.length - 1]);
}

function mapSongRecord(record: any): Song {
  return {
    id: record.Id,
    title: record.Title,
    artist: record.Artist,
    originalKey: record.OriginalKey,
    currentKey: record.CurrentKey,
    bpm: record.Bpm,
    timeSignature: record.TimeSignature,
    favorite: Boolean(record.IsFavorite),
    rawChart: record.RawChart || "",
    sections: JSON.parse(record.SectionsJson || "[]")
  };
}

function mapTopArtistRecord(record: any): TopArtist {
  return {
    name: record.Artist,
    songCount: Number(record.SongCount) || 0
  };
}
