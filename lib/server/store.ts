import { env } from "cloudflare:workers";
import { applyAction, createStore, DomainError, snapshot } from "./domain";
import type { ActionInput, PreviewStore, PreviewUser } from "./domain";
import type { ActionResult, WorkspaceState } from "../types";

type StoredRow = { state: string; version: number };
type Receipt = { payload_hash: string; result: string };
function database() {
  if (!env.DB)
    throw new DomainError(
      "미리보기 데이터 저장소가 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  return env.DB.withSession("first-primary");
}
export async function loadStore(user: PreviewUser): Promise<StoredRow> {
  const db = database();
  let row = await db
    .prepare("SELECT state, version FROM preview_workspaces WHERE user_id = ?")
    .bind(user.id)
    .first<StoredRow>();
  if (!row) {
    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO preview_workspaces (user_id, state, version, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(user_id) DO NOTHING",
      )
      .bind(user.id, JSON.stringify(createStore(user, now)), now)
      .run();
    row = await db
      .prepare(
        "SELECT state, version FROM preview_workspaces WHERE user_id = ?",
      )
      .bind(user.id)
      .first<StoredRow>();
  }
  if (!row) throw new DomainError("체험 데이터를 불러오지 못했습니다.", 503);
  return row;
}
export async function readWorkspace(
  user: PreviewUser,
): Promise<WorkspaceState> {
  const row = await loadStore(user);
  return snapshot(JSON.parse(row.state) as PreviewStore);
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  return (
    "{" +
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
      .join(",") +
    "}"
  );
}
async function digest(input: ActionInput) {
  const bytes = new TextEncoder().encode(stable(input));
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function receipt(
  user: PreviewUser,
  requestId: string,
  hash: string,
): Promise<ActionResult | null> {
  const prior = await database()
    .prepare(
      "SELECT payload_hash, result FROM preview_requests WHERE user_id = ? AND request_id = ?",
    )
    .bind(user.id, requestId)
    .first<Receipt>();
  if (!prior) return null;
  if (prior.payload_hash !== hash)
    throw new DomainError(
      "같은 요청 번호에 다른 작업을 사용할 수 없습니다.",
      409,
    );
  return { ...JSON.parse(prior.result), state: await readWorkspace(user) };
}

/** CAS protects the whole sandbox aggregate, including date locks, rights and audit.
 * D1 batch is transactional: the receipt is inserted only for the successful version.
 * No request can affect another user's aggregate or a real-world transaction.
 */
export async function mutateWorkspace(
  user: PreviewUser,
  input: ActionInput,
  requestId: string,
): Promise<ActionResult> {
  const db = database(),
    hash = await digest(input);
  const previous = await receipt(user, requestId, hash);
  if (previous) return previous;
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await loadStore(user),
      now = new Date().toISOString();
    const completed = await receipt(user, requestId, hash);
    if (completed) return completed;
    const result = applyAction(
      input,
      JSON.parse(row.state) as PreviewStore,
      now,
    );
    // The preview is intentionally bounded. Important records are never silently pruned.
    const serialized = JSON.stringify(result.state);
    if (new TextEncoder().encode(serialized).length > 1500000)
      throw new DomainError(
        "체험 기록 저장 한도에 도달했습니다. 내 체험 데이터를 초기화한 뒤 다시 이용해 주세요.",
        409,
      );
    const response: ActionResult = {
      ok: true,
      message: result.message,
      ...(result.record ? { record: result.record } : {}),
      ...(result.holdId ? { holdId: result.holdId } : {}),
    };
    try {
      const batch = await db.batch([
        db
          .prepare(
            "UPDATE preview_workspaces SET state = ?, version = version + 1, last_request_id = ?, updated_at = ? WHERE user_id = ? AND version = ?",
          )
          .bind(serialized, requestId, now, user.id, row.version),
        db
          .prepare(
            "INSERT INTO preview_requests (user_id, request_id, payload_hash, result, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM preview_workspaces WHERE user_id = ? AND version = ? AND last_request_id = ?)",
          )
          .bind(
            user.id,
            requestId,
            hash,
            JSON.stringify(response),
            now,
            user.id,
            row.version + 1,
            requestId,
          ),
      ]);
      if (batch[0].meta.changes === 1)
        return { ...response, state: snapshot(result.state, now) };
    } catch (error) {
      // Concurrent retries of one request may encounter the unique receipt constraint.
      const raced = await receipt(user, requestId, hash);
      if (raced) return raced;
      throw error;
    }
    const raced = await receipt(user, requestId, hash);
    if (raced) return raced;
  }
  throw new DomainError(
    "다른 작업이 동시에 처리되고 있습니다. 상태를 새로 불러온 뒤 다시 시도해 주세요.",
    409,
  );
}
