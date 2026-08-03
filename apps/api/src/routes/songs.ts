import { Router } from "express";
import { requireAuth, requireRole } from "../authMiddleware";
import { broadcastSyncEvent } from "../realtime";
import { deleteSong, getSongById, listPopularSongs, listSongs, listSongsPage, listTopArtists, saveSong } from "../repositories/songRepository";

export var songsRouter = Router();

songsRouter.get("/", async function (req, res, next) {
  try {
    var query = typeof req.query.q === "string" ? req.query.q : "";
    var limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 0;
    var cursor = typeof req.query.cursor === "string" ? req.query.cursor : "";

    if (limit > 0) {
      res.json(await listSongsPage(query, { cursor: cursor, limit: limit }));
      return;
    }

    res.json(await listSongs(query));
  } catch (error) {
    next(error);
  }
});

songsRouter.get("/popular", async function (req, res, next) {
  try {
    var limit = Number(req.query.limit) || 10;
    res.json(await listPopularSongs(limit));
  } catch (error) {
    next(error);
  }
});

songsRouter.get("/top-artists", async function (req, res, next) {
  try {
    var limit = Number(req.query.limit) || 10;
    res.json(await listTopArtists(limit));
  } catch (error) {
    next(error);
  }
});

songsRouter.get("/:id", async function (req, res, next) {
  try {
    var song = await getSongById(req.params.id);

    if (!song) {
      res.status(404).json({ message: "Musica nao encontrada." });
      return;
    }

    res.json(song);
  } catch (error) {
    next(error);
  }
});

songsRouter.post("/", requireAuth, requireRole(["master"]), async function (req, res, next) {
  try {
    var song = await saveSong(req.body);
    broadcastSyncEvent({ type: "songs:changed" });
    res.status(201).json(song);
  } catch (error) {
    next(error);
  }
});

songsRouter.put("/:id", requireAuth, requireRole(["master"]), async function (req, res, next) {
  try {
    var song = {
      ...req.body,
      id: req.params.id
    };

    var savedSong = await saveSong(song);
    broadcastSyncEvent({ type: "songs:changed" });
    res.json(savedSong);
  } catch (error) {
    next(error);
  }
});

songsRouter.delete("/:id", requireAuth, requireRole(["master"]), async function (req, res, next) {
  try {
    var deleted = await deleteSong(req.params.id);

    if (!deleted) {
      res.status(404).json({ message: "Musica nao encontrada." });
      return;
    }

    broadcastSyncEvent({ type: "songs:changed" });
    broadcastSyncEvent({ type: "repertoires:changed" });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
