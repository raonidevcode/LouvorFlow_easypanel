import { Router } from "express";
import { parseChordSheet } from "@louvorflow/shared";

export var parserRouter = Router();

parserRouter.post("/chord-sheet", function (req, res) {
  var text = String(req.body.text || "");

  res.json({
    sections: parseChordSheet(text)
  });
});
