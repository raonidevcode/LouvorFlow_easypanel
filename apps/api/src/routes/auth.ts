import { Router } from "express";
import { createAuthToken, hasAuthTokenSecret, hashPassword, verifyPassword } from "../authCrypto";
import { requireAuth } from "../authMiddleware";
import { findAuthUserByEmail, findAuthUserById, registerViewerUser, toPublicSession } from "../repositories/userRepository";
import { broadcastSyncEvent } from "../realtime";
import { getCurrentUserId, getCurrentWorkspaceId } from "../workspaceContext";

export var authRouter = Router();
var duplicateAccountMessage = "Já existe uma conta com esse e-mail ou usuário.";

authRouter.post("/login", async function (req, res, next) {
  try {
    if (!hasAuthTokenSecret()) {
      res.status(503).json({ message: "Autenticação ainda não configurada no servidor." });
      return;
    }

    var email = String(req.body?.email || "").trim();
    var password = String(req.body?.password || "");

    if (!email || !password) {
      res.status(400).json({ message: "Informe e-mail e senha." });
      return;
    }

    var user = await findAuthUserByEmail(email);
    var passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
      res.status(401).json({ message: "E-mail ou senha inválidos." });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ message: "Usuário inativo." });
      return;
    }

    var token = createAuthToken(user.id, user.workspaceId);
    setSessionCookie(res, token.token, token.expiresAt);

    res.json({
      ...toPublicSession(user),
      expiresAt: token.expiresAt
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/register", async function (req, res, next) {
  try {
    if (!hasAuthTokenSecret()) {
      res.status(503).json({ message: "Autenticacao ainda nao configurada no servidor." });
      return;
    }

    var email = String(req.body?.email || "").trim().toLowerCase();
    var displayName = String(req.body?.displayName || "").trim();
    var password = String(req.body?.password || "");

    if (!email || email.indexOf("@") < 1 || email.length > 320) {
      res.status(400).json({ message: "Informe um e-mail valido." });
      return;
    }

    if (!displayName || displayName.length > 200) {
      res.status(400).json({ message: "Informe um nome valido." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ message: "A senha deve ter pelo menos 8 caracteres." });
      return;
    }

    var passwordHash = await hashPassword(password);
    var user = await registerViewerUser({
      email: email,
      displayName: displayName,
      passwordHash: passwordHash
    });

    if (!user) {
      res.status(409).json({ message: duplicateAccountMessage });
      return;
    }

    var token = createAuthToken(user.id, user.workspaceId);
    setSessionCookie(res, token.token, token.expiresAt);
    broadcastSyncEvent({ type: "users:changed" });

    res.status(201).json({
      ...toPublicSession(user),
      expiresAt: token.expiresAt
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ message: duplicateAccountMessage });
      return;
    }

    next(error);
  }
});

authRouter.post("/logout", function (_req, res) {
  res.setHeader("Set-Cookie", buildSessionCookie("", new Date(0).toISOString()));
  res.status(204).send();
});

function setSessionCookie(res: any, token: string, expiresAt: string) {
  res.setHeader("Set-Cookie", buildSessionCookie(token, expiresAt));
}

function buildSessionCookie(token: string, expiresAt: string) {
  var secure = process.env.AUTH_COOKIE_SECURE === "true" ? "; Secure" : "";
  return [
    "louvorflow_session=" + encodeURIComponent(token),
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Expires=" + new Date(expiresAt).toUTCString() + secure
  ].join("; ");
}

function isUniqueConstraintError(error: unknown) {
  var sqlError = error as { number?: number; message?: string } | null;
  if (!sqlError) {
    return false;
  }

  if (sqlError.number === 2601 || sqlError.number === 2627) {
    return true;
  }

  return String(sqlError.message || "").indexOf("UX_Users_Email") >= 0;
}

authRouter.get("/me", requireAuth, async function (_req, res, next) {
  try {
    var userId = getCurrentUserId();
    var workspaceId = getCurrentWorkspaceId();
    var user = await findAuthUserById(userId, workspaceId);

    if (!user) {
      res.status(401).json({ message: "Sessão inválida." });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ message: "Usuário inativo." });
      return;
    }

    res.json(toPublicSession(user));
  } catch (error) {
    next(error);
  }
});
