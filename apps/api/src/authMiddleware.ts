import { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "./authCrypto";
import { findAuthUserById, WorkspaceRole } from "./repositories/userRepository";
import { DEFAULT_WORKSPACE_ID, getCurrentUserId, getCurrentWorkspaceId, runWithWorkspaceContext } from "./workspaceContext";

export function authContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  var token = readBearerToken(req.headers.authorization) || readCookieToken(req.headers.cookie);
  var payload = token ? verifyAuthToken(token) : null;

  runWithWorkspaceContext(
    {
      workspaceId: payload?.workspaceId || DEFAULT_WORKSPACE_ID,
      userId: payload?.sub
    },
    next
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  var token = readBearerToken(req.headers.authorization) || readCookieToken(req.headers.cookie);
  var payload = token ? verifyAuthToken(token) : null;

  if (!payload) {
    res.status(401).json({ message: "Autenticação necessária." });
    return;
  }

  runWithWorkspaceContext(
    {
      workspaceId: payload.workspaceId,
      userId: payload.sub
    },
    next
  );
}

export function requireRole(allowedRoles: WorkspaceRole[]) {
  return async function (_req: Request, res: Response, next: NextFunction) {
    var userId = getCurrentUserId();
    var workspaceId = getCurrentWorkspaceId();

    if (!userId) {
      res.status(401).json({ message: "Autenticacao necessaria." });
      return;
    }

    try {
      var user = await findAuthUserById(userId, workspaceId);
      if (!user) {
        res.status(401).json({ message: "Autenticacao necessaria." });
        return;
      }

      if (!user.isActive) {
        res.status(403).json({ message: "Usuario inativo." });
        return;
      }

      if (allowedRoles.indexOf(user.role) < 0) {
        res.status(403).json({ message: "Acesso negado." });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function requireAppMaster(_req: Request, res: Response, next: NextFunction) {
  var userId = getCurrentUserId();
  var workspaceId = getCurrentWorkspaceId();

  if (!userId) {
    res.status(401).json({ message: "Autenticacao necessaria." });
    return;
  }

  try {
    var user = await findAuthUserById(userId, workspaceId);
    if (!user) {
      res.status(401).json({ message: "Autenticacao necessaria." });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ message: "Usuario inativo." });
      return;
    }

    if (!user.isAppMaster) {
      res.status(403).json({ message: "Acesso negado." });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

function readBearerToken(value?: string) {
  if (!value) {
    return "";
  }

  var parts = value.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return "";
  }

  return parts[1];
}

function readCookieToken(value?: string) {
  if (!value) {
    return "";
  }

  var cookies = value.split(";");
  for (var index = 0; index < cookies.length; index += 1) {
    var cookie = cookies[index].trim();
    if (cookie.indexOf("louvorflow_session=") === 0) {
      return decodeURIComponent(cookie.slice("louvorflow_session=".length));
    }
  }

  return "";
}
