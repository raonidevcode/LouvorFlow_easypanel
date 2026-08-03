import cors from "cors";
import express from "express";
import http from "http";
import { authContextMiddleware } from "./authMiddleware";
import { config } from "./config";
import { attachSyncSocket } from "./realtime";
import { authRouter } from "./routes/auth";
import { parserRouter } from "./routes/parser";
import { repertoiresRouter } from "./routes/repertoires";
import { songsRouter } from "./routes/songs";
import { syncRouter } from "./routes/sync";
import { usersRouter } from "./routes/users";

var app = express();

app.use(cors({
  credentials: true,
  origin: function (origin, callback) {
    if (!origin || config.cors.allowedOrigins.indexOf(origin) >= 0) {
      callback(null, true);
      return;
    }

    callback(new Error("Origem nao permitida pelo CORS."));
  }
}));
app.use(express.json({ limit: "2mb" }));
app.use(authContextMiddleware);

app.get("/health", function (_req, res) {
  res.json({ ok: true, name: "LouvorFlow API" });
});

app.use("/songs", songsRouter);
app.use("/repertoires", repertoiresRouter);
app.use("/parser", parserRouter);
app.use("/sync", syncRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter);

app.use(function (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) {
  console.error(error);
  res.status(500).json({ message: "Erro interno da API." });
});

var server = http.createServer(app);
attachSyncSocket(server);

server.listen(config.port, function () {
  console.log("LouvorFlow API listening on port " + config.port);
});
