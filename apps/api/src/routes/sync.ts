import { Router } from "express";
import { getSyncVersion } from "../repositories/syncRepository";

export var syncRouter = Router();

syncRouter.get("/version", async function (_req, res, next) {
  try {
    res.json(await getSyncVersion());
  } catch (error) {
    next(error);
  }
});
