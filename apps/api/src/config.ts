import dotenv from "dotenv";

dotenv.config();

export var config = {
  port: Number(process.env.PORT || 3333),
  auth: {
    tokenSecret: process.env.AUTH_TOKEN_SECRET || ""
  },
  cors: {
    allowedOrigins: (process.env.WEB_ORIGIN || "")
      .split(",")
      .map(function (origin) {
        return origin.trim();
      })
      .filter(Boolean)
  },
  sql: {
    server: process.env.SQLSERVER_HOST || "localhost",
    port: Number(process.env.SQLSERVER_PORT || 1433),
    database: process.env.SQLSERVER_DATABASE || "LouvorFlow",
    user: process.env.SQLSERVER_USER || "sa",
    password: process.env.SQLSERVER_PASSWORD || "",
    options: {
      encrypt: process.env.SQLSERVER_ENCRYPT === "true",
      trustServerCertificate: process.env.SQLSERVER_TRUST_CERT !== "false"
    }
  }
};
