import crypto from "crypto";
import { getPool, sql } from "../db";

export type WorkspaceRole = "master" | "member" | "viewer";

export type AuthUserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  isAppMaster: boolean;
  isActive: boolean;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
};

export type PublicSessionUser = {
  id: string;
  email: string;
  displayName: string;
  isAppMaster: boolean;
};

export type PublicWorkspace = {
  id: string;
  name: string;
  role: WorkspaceRole;
};

export type WorkspaceUserSummary = {
  id: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  isAppMaster: boolean;
  isActive: boolean;
};

export type CreateWorkspaceUserInput = {
  email: string;
  displayName: string;
  passwordHash: string;
  role: WorkspaceRole;
  workspaceId: string;
};

export type RegisterViewerInput = {
  email: string;
  displayName: string;
  passwordHash: string;
};

export async function findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
  var pool = await getPool();
  var result = await pool
    .request()
    .input("email", sql.NVarChar(320), email)
    .query(
      "select top 1 u.Id, u.Email, u.DisplayName, u.PasswordHash, u.IsAppMaster, u.IsActive, w.Id as WorkspaceId, w.Name as WorkspaceName, wu.Role " +
        "from Users u " +
        "inner join WorkspaceUsers wu on wu.UserId = u.Id " +
        "inner join Workspaces w on w.Id = wu.WorkspaceId " +
        "where lower(u.Email) = lower(@email) " +
        "order by wu.Id"
    );

  if (!result.recordset.length) {
    return null;
  }

  return mapAuthUserRecord(result.recordset[0]);
}

export async function findAuthUserById(userId: string, workspaceId: string): Promise<AuthUserRecord | null> {
  var pool = await getPool();
  var result = await pool
    .request()
    .input("userId", sql.NVarChar(80), userId)
    .input("workspaceId", sql.NVarChar(80), workspaceId)
    .query(
      "select top 1 u.Id, u.Email, u.DisplayName, u.PasswordHash, u.IsAppMaster, u.IsActive, w.Id as WorkspaceId, w.Name as WorkspaceName, wu.Role " +
        "from Users u " +
        "inner join WorkspaceUsers wu on wu.UserId = u.Id " +
        "inner join Workspaces w on w.Id = wu.WorkspaceId " +
        "where u.Id = @userId and w.Id = @workspaceId"
    );

  if (!result.recordset.length) {
    return null;
  }

  return mapAuthUserRecord(result.recordset[0]);
}

export async function listWorkspaceUsers(workspaceId: string): Promise<WorkspaceUserSummary[]> {
  var pool = await getPool();
  var result = await pool
    .request()
    .input("workspaceId", sql.NVarChar(80), workspaceId)
    .query(
      "select u.Id, u.Email, u.DisplayName, u.IsAppMaster, u.IsActive, wu.Role " +
        "from WorkspaceUsers wu " +
        "inner join Users u on u.Id = wu.UserId " +
        "where wu.WorkspaceId = @workspaceId " +
        "order by u.DisplayName, u.Email"
    );

  return result.recordset.map(mapWorkspaceUserSummary);
}

export async function listApplicationUsers(): Promise<WorkspaceUserSummary[]> {
  var pool = await getPool();
  var result = await pool
    .request()
    .query(
      "select u.Id, u.Email, u.DisplayName, u.IsAppMaster, u.IsActive, coalesce(wu.Role, 'viewer') as Role " +
        "from Users u " +
        "outer apply (" +
        "select top 1 WorkspaceUsers.Role from WorkspaceUsers " +
        "where WorkspaceUsers.UserId = u.Id " +
        "order by WorkspaceUsers.Id" +
        ") wu " +
        "order by u.IsAppMaster desc, u.DisplayName, u.Email"
    );

  return result.recordset.map(mapWorkspaceUserSummary);
}

export async function createWorkspaceUser(input: CreateWorkspaceUserInput): Promise<WorkspaceUserSummary | null> {
  var pool = await getPool();
  var existing = await pool
    .request()
    .input("email", sql.NVarChar(320), input.email)
    .query("select top 1 Id from Users where lower(Email) = lower(@email)");

  if (existing.recordset.length) {
    return null;
  }

  var userId = "user-" + crypto.randomUUID();
  var transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction)
      .input("id", sql.NVarChar(80), userId)
      .input("email", sql.NVarChar(320), input.email)
      .input("displayName", sql.NVarChar(200), input.displayName)
      .input("passwordHash", sql.NVarChar(500), input.passwordHash)
      .query(
        "insert into Users (Id, Email, DisplayName, PasswordHash) " +
          "values (@id, @email, @displayName, @passwordHash)"
      );

    await new sql.Request(transaction)
      .input("workspaceId", sql.NVarChar(80), input.workspaceId)
      .input("userId", sql.NVarChar(80), userId)
      .input("role", sql.NVarChar(40), input.role)
      .query(
        "insert into WorkspaceUsers (WorkspaceId, UserId, Role) " +
          "values (@workspaceId, @userId, @role)"
      );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return {
    id: userId,
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    isAppMaster: false,
    isActive: true
  };
}

export async function registerViewerUser(input: RegisterViewerInput): Promise<AuthUserRecord | null> {
  var pool = await getPool();
  var existing = await pool
    .request()
    .input("email", sql.NVarChar(320), input.email)
    .query("select top 1 Id from Users where lower(Email) = lower(@email)");

  if (existing.recordset.length) {
    return null;
  }

  var userId = "user-" + crypto.randomUUID();
  var workspaceId = "workspace-" + crypto.randomUUID();
  var workspaceName = input.displayName || input.email;
  var transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction)
      .input("id", sql.NVarChar(80), workspaceId)
      .input("name", sql.NVarChar(200), workspaceName)
      .query("insert into Workspaces (Id, Name) values (@id, @name)");

    await new sql.Request(transaction)
      .input("id", sql.NVarChar(80), userId)
      .input("email", sql.NVarChar(320), input.email)
      .input("displayName", sql.NVarChar(200), input.displayName)
      .input("passwordHash", sql.NVarChar(500), input.passwordHash)
      .query(
        "insert into Users (Id, Email, DisplayName, PasswordHash, IsAppMaster) " +
          "values (@id, @email, @displayName, @passwordHash, 0)"
      );

    await new sql.Request(transaction)
      .input("workspaceId", sql.NVarChar(80), workspaceId)
      .input("userId", sql.NVarChar(80), userId)
      .query(
        "insert into WorkspaceUsers (WorkspaceId, UserId, Role) " +
          "values (@workspaceId, @userId, 'viewer')"
      );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return {
    id: userId,
    email: input.email,
    displayName: input.displayName,
    passwordHash: input.passwordHash,
    isAppMaster: false,
    isActive: true,
    workspaceId: workspaceId,
    workspaceName: workspaceName,
    role: "viewer"
  };
}

export async function updateWorkspaceUserRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceUserSummary | null> {
  var pool = await getPool();
  var result = await pool
    .request()
    .input("workspaceId", sql.NVarChar(80), workspaceId)
    .input("userId", sql.NVarChar(80), userId)
    .input("role", sql.NVarChar(40), role)
    .query(
      "update WorkspaceUsers set Role = @role " +
        "where WorkspaceId = @workspaceId and UserId = @userId; " +
        "select top 1 u.Id, u.Email, u.DisplayName, u.IsAppMaster, u.IsActive, wu.Role " +
        "from WorkspaceUsers wu inner join Users u on u.Id = wu.UserId " +
        "where wu.WorkspaceId = @workspaceId and wu.UserId = @userId"
    );

  if (!result.recordset.length) {
    return null;
  }

  return mapWorkspaceUserSummary(result.recordset[0]);
}

export async function updateApplicationUserRole(userId: string, role: WorkspaceRole): Promise<WorkspaceUserSummary | null> {
  var pool = await getPool();
  var result = await pool
    .request()
    .input("userId", sql.NVarChar(80), userId)
    .input("role", sql.NVarChar(40), role)
    .query(
      "update WorkspaceUsers set Role = @role " +
        "where UserId = @userId; " +
        "select top 1 u.Id, u.Email, u.DisplayName, u.IsAppMaster, u.IsActive, coalesce(wu.Role, 'viewer') as Role " +
        "from Users u " +
        "outer apply (" +
        "select top 1 WorkspaceUsers.Role from WorkspaceUsers " +
        "where WorkspaceUsers.UserId = u.Id " +
        "order by WorkspaceUsers.Id" +
        ") wu " +
        "where u.Id = @userId"
    );

  if (!result.recordset.length) {
    return null;
  }

  return mapWorkspaceUserSummary(result.recordset[0]);
}

export async function updateWorkspaceUserStatus(workspaceId: string, userId: string, isActive: boolean): Promise<WorkspaceUserSummary | null> {
  var pool = await getPool();
  var result = await pool
    .request()
    .input("workspaceId", sql.NVarChar(80), workspaceId)
    .input("userId", sql.NVarChar(80), userId)
    .input("isActive", sql.Bit, isActive)
    .query(
      "update u set IsActive = @isActive, UpdatedAt = sysdatetime() " +
        "from Users u inner join WorkspaceUsers wu on wu.UserId = u.Id " +
        "where wu.WorkspaceId = @workspaceId and u.Id = @userId; " +
        "select top 1 u.Id, u.Email, u.DisplayName, u.IsAppMaster, u.IsActive, wu.Role " +
        "from WorkspaceUsers wu inner join Users u on u.Id = wu.UserId " +
        "where wu.WorkspaceId = @workspaceId and wu.UserId = @userId"
    );

  if (!result.recordset.length) {
    return null;
  }

  return mapWorkspaceUserSummary(result.recordset[0]);
}

export async function countWorkspaceMasters(workspaceId: string): Promise<number> {
  var pool = await getPool();
  var result = await pool
    .request()
    .input("workspaceId", sql.NVarChar(80), workspaceId)
    .query(
      "select count(1) as Total from WorkspaceUsers " +
        "where WorkspaceId = @workspaceId and Role in ('master', 'owner', 'admin')"
    );

  return Number(result.recordset[0]?.Total || 0);
}

export function toPublicSession(record: AuthUserRecord) {
  return {
    user: {
      id: record.id,
      email: record.email,
      displayName: record.displayName,
      isAppMaster: record.isAppMaster
    } as PublicSessionUser,
    workspace: {
      id: record.workspaceId,
      name: record.workspaceName,
      role: record.role
    } as PublicWorkspace
  };
}

function mapAuthUserRecord(record: any): AuthUserRecord {
  return {
    id: record.Id,
    email: record.Email,
    displayName: record.DisplayName,
    passwordHash: record.PasswordHash || null,
    isAppMaster: Boolean(record.IsAppMaster),
    isActive: record.IsActive !== false,
    workspaceId: record.WorkspaceId,
    workspaceName: record.WorkspaceName,
    role: normalizeWorkspaceRole(record.Role)
  };
}

function mapWorkspaceUserSummary(record: any): WorkspaceUserSummary {
  return {
    id: record.Id,
    email: record.Email,
    displayName: record.DisplayName,
    role: normalizeWorkspaceRole(record.Role),
    isAppMaster: Boolean(record.IsAppMaster),
    isActive: record.IsActive !== false
  };
}

export function normalizeWorkspaceRole(role: string | null | undefined): WorkspaceRole {
  var normalized = String(role || "").toLowerCase();
  if (normalized === "master" || normalized === "owner" || normalized === "admin") {
    return "master";
  }

  if (normalized === "viewer" || normalized === "view") {
    return "viewer";
  }

  return "member";
}
