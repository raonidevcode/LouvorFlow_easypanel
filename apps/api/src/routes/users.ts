import { Router } from "express";
import { hashPassword } from "../authCrypto";
import { requireAppMaster, requireAuth } from "../authMiddleware";
import { createWorkspaceUser, listApplicationUsers, listWorkspaceUsers, normalizeWorkspaceRole, updateApplicationUserRole, updateWorkspaceUserStatus, WorkspaceRole } from "../repositories/userRepository";
import { broadcastSyncEvent } from "../realtime";
import { getCurrentUserId, getCurrentWorkspaceId } from "../workspaceContext";

export var usersRouter = Router();

usersRouter.get("/", requireAuth, requireAppMaster, async function (_req, res, next) {
  try {
    var users = await listApplicationUsers();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/", requireAuth, requireAppMaster, async function (req, res, next) {
  try {
    var email = String(req.body?.email || "").trim().toLowerCase();
    var displayName = String(req.body?.displayName || "").trim();
    var password = String(req.body?.password || "");
    var role = parseRole(req.body?.role || "member");

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

    if (!role) {
      res.status(400).json({ message: "Papel inválido." });
      return;
    }

    var passwordHash = await hashPassword(password);
    var user = await createWorkspaceUser({
      email: email,
      displayName: displayName,
      passwordHash: passwordHash,
      role: role,
      workspaceId: getCurrentWorkspaceId()
    });

    if (!user) {
      res.status(409).json({ message: "Este e-mail ja esta em uso." });
      return;
    }

    broadcastSyncEvent({ type: "users:changed" });
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

usersRouter.put("/:id/role", requireAuth, requireAppMaster, async function (req, res, next) {
  try {
    var role = parseRole(req.body?.role);

    if (!role) {
      res.status(400).json({ message: "Papel inválido." });
      return;
    }

    var users = await listApplicationUsers();
    var target = users.filter(function (user) {
      return user.id === req.params.id;
    })[0];

    if (!target) {
      res.status(404).json({ message: "Usuário não encontrado." });
      return;
    }

    if (target.isAppMaster) {
      res.status(400).json({ message: "O master da aplicação não pode ter a permissão alterada." });
      return;
    }

    var user = await updateApplicationUserRole(req.params.id, role);
    if (!user) {
      res.status(404).json({ message: "Usuário não encontrado." });
      return;
    }

    broadcastSyncEvent({ type: "users:changed" });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

usersRouter.put("/:id/status", requireAuth, requireAppMaster, async function (req, res, next) {
  try {
    var workspaceId = getCurrentWorkspaceId();

    if (typeof req.body?.isActive !== "boolean") {
      res.status(400).json({ message: "Informe se o usuario esta ativo." });
      return;
    }

    var users = await listWorkspaceUsers(workspaceId);
    var target = users.filter(function (user) {
      return user.id === req.params.id;
    })[0];

    if (!target) {
      res.status(404).json({ message: "Usuário não encontrado." });
      return;
    }

    if (!req.body.isActive && target.id === getCurrentUserId()) {
      res.status(400).json({ message: "Voce nao pode desativar seu proprio usuario." });
      return;
    }

    if (!req.body.isActive && target.isAppMaster) {
      res.status(400).json({ message: "O master da aplicação não pode ser desativado." });
      return;
    }

    var user = await updateWorkspaceUserStatus(workspaceId, req.params.id, req.body.isActive);
    if (!user) {
      res.status(404).json({ message: "Usuário não encontrado." });
      return;
    }

    broadcastSyncEvent({ type: "users:changed" });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

function parseRole(value: unknown): WorkspaceRole | null {
  var rawValue = String(value || "").toLowerCase();
  if (rawValue !== "master" && rawValue !== "member" && rawValue !== "viewer" && rawValue !== "owner" && rawValue !== "admin" && rawValue !== "view") {
    return null;
  }

  var normalized = normalizeWorkspaceRole(rawValue);
  if (normalized === "master" || normalized === "member" || normalized === "viewer") {
    return normalized;
  }

  return null;
}
