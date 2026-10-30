import type { ActionResult, WorkspaceState } from "./types";

export class WorkspaceError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
const pendingRequests = new Map<string, string>();

export async function getWorkspace(signal?: AbortSignal): Promise<WorkspaceState> {
  const response = await fetch("/api/workspace", { credentials: "same-origin", cache: "no-store", signal });
  const result = await response.json() as WorkspaceState & { error?: string };
  if (!response.ok) throw new WorkspaceError(result.error || "내 공간을 불러오지 못했습니다.", response.status);
  return result;
}

export async function workspaceAction(action: string, payload: Record<string, unknown> = {}): Promise<ActionResult> {
  const key = JSON.stringify([action, payload]);
  const requestId = pendingRequests.get(key) || crypto.randomUUID();
  pendingRequests.set(key, requestId);
  const response = await fetch("/api/workspace", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload, requestId }),
  });
  const result = await response.json() as ActionResult;
  pendingRequests.delete(key);
  if (!response.ok || !result.ok) throw new WorkspaceError(result.error || "처리하지 못했습니다. 입력 조건을 확인해 주세요.", response.status);
  return result;
}
