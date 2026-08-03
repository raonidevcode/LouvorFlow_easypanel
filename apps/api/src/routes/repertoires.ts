import { Router } from "express";
import { requireAuth, requireRole } from "../authMiddleware";
import { broadcastSyncEvent } from "../realtime";
import { deleteRepertoire, getRepertoireById, listRepertoires, listRepertoiresPage, RepertoireListPeriod, saveRepertoire } from "../repositories/repertoireRepository";

export var repertoiresRouter = Router();

function formatTodayDate() {
  var now = new Date();
  var month = String(now.getMonth() + 1);
  var day = String(now.getDate());
  if (month.length === 1) {
    month = "0" + month;
  }
  if (day.length === 1) {
    day = "0" + day;
  }
  return now.getFullYear() + "-" + month + "-" + day;
}

repertoiresRouter.get("/", async function (req, res, next) {
  try {
    if (req.query.limit) {
      var limit = Number(req.query.limit);
      var period = String(req.query.period || "upcoming") === "past" ? "past" as RepertoireListPeriod : "upcoming" as RepertoireListPeriod;

      res.json(await listRepertoiresPage({
        cursor: typeof req.query.cursor === "string" ? req.query.cursor : "",
        limit: Number.isFinite(limit) ? limit : 15,
        period: period,
        query: typeof req.query.q === "string" ? req.query.q : ""
      }));
      return;
    }

    res.json(await listRepertoires());
  } catch (error) {
    next(error);
  }
});

repertoiresRouter.get("/:id", async function (req, res, next) {
  try {
    var repertoire = await getRepertoireById(req.params.id);

    if (!repertoire) {
      res.status(404).json({ message: "Repertorio nao encontrado." });
      return;
    }

    res.json(repertoire);
  } catch (error) {
    next(error);
  }
});

repertoiresRouter.post("/", requireAuth, requireRole(["master", "member"]), async function (req, res, next) {
  try {
    var requestedDate = req.body && typeof req.body.date === "string" ? req.body.date.slice(0, 10) : "";
    if (requestedDate && requestedDate < formatTodayDate()) {
      res.status(400).json({ message: "A data do repertório não pode ser anterior a hoje." });
      return;
    }

    var repertoire = await saveRepertoire(req.body);
    broadcastSyncEvent({ type: "repertoires:changed" });
    res.status(201).json(repertoire);
  } catch (error) {
    next(error);
  }
});

repertoiresRouter.put("/:id", requireAuth, requireRole(["master", "member"]), async function (req, res, next) {
  try {
    var repertoire = {
      ...req.body,
      id: req.params.id
    };

    var savedRepertoire = await saveRepertoire(repertoire);
    broadcastSyncEvent({ type: "repertoires:changed" });
    res.json(savedRepertoire);
  } catch (error) {
    next(error);
  }
});

repertoiresRouter.delete("/:id", requireAuth, requireRole(["master", "member"]), async function (req, res, next) {
  try {
    var deleted = await deleteRepertoire(req.params.id);

    if (!deleted) {
      res.status(404).json({ message: "Repertorio nao encontrado." });
      return;
    }

    broadcastSyncEvent({ type: "repertoires:changed" });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
