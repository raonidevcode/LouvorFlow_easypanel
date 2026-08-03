import sql from "mssql";
import { config } from "./config";

var poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = sql.connect(config.sql);
  }

  return poolPromise as Promise<sql.ConnectionPool>;
}

export { sql };
