import { getPool, sql } from "../db";
import { getCurrentWorkspaceId } from "../workspaceContext";

export type SyncVersion = {
  version: string;
};

export async function getSyncVersion(): Promise<SyncVersion> {
  var pool = await getPool();
  var workspaceId = getCurrentWorkspaceId();
  var result = await pool
    .request()
    .input("workspaceId", sql.NVarChar(80), workspaceId)
    .query(
    "select " +
      "coalesce(convert(varchar(33), max(Songs.UpdatedAt), 126), '') as SongsUpdatedAt, " +
      "count(Songs.Id) as SongsCount, " +
      "coalesce(checksum_agg(binary_checksum(Songs.Id, Songs.WorkspaceId, Songs.Title, Songs.Artist, Songs.OriginalKey, Songs.CurrentKey, Songs.Bpm, Songs.TimeSignature, Songs.IsFavorite, convert(nvarchar(4000), Songs.SectionsJson), convert(nvarchar(4000), Songs.RawChart), Songs.UpdatedAt)), 0) as SongsChecksum " +
      "from Songs; " +
      "select " +
      "coalesce(convert(varchar(33), max(Repertoires.UpdatedAt), 126), '') as RepertoiresUpdatedAt, " +
      "count(Repertoires.Id) as RepertoiresCount, " +
      "coalesce(checksum_agg(binary_checksum(Repertoires.Id, Repertoires.WorkspaceId, Repertoires.Name, Repertoires.EventDate, Repertoires.EventTime, Repertoires.Description, Repertoires.UpdatedAt)), 0) as RepertoiresChecksum " +
      "from Repertoires where Repertoires.WorkspaceId = @workspaceId; " +
      "select " +
      "count(rs.Id) as RepertoireSongsCount, " +
      "coalesce(checksum_agg(binary_checksum(rs.Id, rs.RepertoireId, rs.SongId, rs.SongOrder, rs.SongKey, rs.Capo, rs.Notes)), 0) as RepertoireSongsChecksum " +
      "from RepertoireSongs rs inner join Repertoires r on r.Id = rs.RepertoireId where r.WorkspaceId = @workspaceId;"
  );

  var recordsets = result.recordsets as any[];
  var songs = recordsets[0][0] || {};
  var repertoires = recordsets[1][0] || {};
  var repertoireSongs = recordsets[2][0] || {};

  return {
    version: [
      songs.SongsUpdatedAt || "",
      songs.SongsCount || 0,
      songs.SongsChecksum || 0,
      repertoires.RepertoiresUpdatedAt || "",
      repertoires.RepertoiresCount || 0,
      repertoires.RepertoiresChecksum || 0,
      repertoireSongs.RepertoireSongsCount || 0,
      repertoireSongs.RepertoireSongsChecksum || 0
    ].join("|")
  };
}
