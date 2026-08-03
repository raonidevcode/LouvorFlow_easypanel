import crypto from "crypto";
import { config } from "./config";

var HASH_ALGORITHM = "sha256";
var HASH_ITERATIONS = 120000;
var HASH_KEY_LENGTH = 32;
var TOKEN_TTL_SECONDS = 60 * 60 * 8;

export type AuthTokenPayload = {
  sub: string;
  workspaceId: string;
  exp: number;
};

export function hashPassword(password: string): Promise<string> {
  var salt = crypto.randomBytes(16).toString("base64url");

  return new Promise(function (resolve, reject) {
    crypto.pbkdf2(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM, function (error, key) {
      if (error) {
        reject(error);
        return;
      }

      resolve(["pbkdf2", HASH_ALGORITHM, HASH_ITERATIONS, salt, key.toString("base64url")].join("$"));
    });
  });
}

export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash) {
    return false;
  }

  var parts = storedHash.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") {
    return false;
  }

  var algorithm = parts[1];
  var iterations = Number(parts[2]);
  var salt = parts[3];
  var expected = Buffer.from(parts[4], "base64url");

  if (!iterations || !salt || !expected.length) {
    return false;
  }

  return new Promise(function (resolve, reject) {
    crypto.pbkdf2(password, salt, iterations, expected.length, algorithm, function (error, key) {
      if (error) {
        reject(error);
        return;
      }

      resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

export function createAuthToken(userId: string, workspaceId: string) {
  assertTokenSecret();

  var expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  var payload: AuthTokenPayload = {
    sub: userId,
    workspaceId: workspaceId,
    exp: expiresAt
  };
  var token = signToken(payload);

  return {
    token: token,
    expiresAt: new Date(expiresAt * 1000).toISOString()
  };
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  if (!config.auth.tokenSecret) {
    return null;
  }

  var parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  var signature = sign(parts[0] + "." + parts[1]);
  if (!safeEqual(signature, parts[2])) {
    return null;
  }

  try {
    var payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as AuthTokenPayload;
    if (!payload.sub || !payload.workspaceId || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

export function hasAuthTokenSecret() {
  return Boolean(config.auth.tokenSecret);
}

function signToken(payload: AuthTokenPayload) {
  var header = encodeJson({
    alg: "HS256",
    typ: "JWT"
  });
  var body = encodeJson(payload);
  return header + "." + body + "." + sign(header + "." + body);
}

function encodeJson(value: object) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(value: string) {
  return crypto.createHmac("sha256", config.auth.tokenSecret).update(value).digest("base64url");
}

function assertTokenSecret() {
  if (!config.auth.tokenSecret) {
    throw new Error("AUTH_TOKEN_SECRET não configurado.");
  }
}

function safeEqual(left: string, right: string) {
  var leftBuffer = Buffer.from(left);
  var rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
