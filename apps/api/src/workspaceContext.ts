import { AsyncLocalStorage } from "async_hooks";

export var DEFAULT_WORKSPACE_ID = "default";

type WorkspaceContext = {
  workspaceId: string;
  userId?: string;
};

var workspaceStorage = new AsyncLocalStorage<WorkspaceContext>();

export function getCurrentWorkspaceId() {
  var context = workspaceStorage.getStore();
  return context?.workspaceId || DEFAULT_WORKSPACE_ID;
}

export function getCurrentUserId() {
  var context = workspaceStorage.getStore();
  return context?.userId || "";
}

export function runWithWorkspaceContext<T>(context: WorkspaceContext, callback: () => T): T {
  return workspaceStorage.run(context, callback);
}
