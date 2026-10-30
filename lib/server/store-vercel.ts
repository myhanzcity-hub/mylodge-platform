import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import { createHash } from "node:crypto";
import { applyAction, createStore, DomainError, snapshot } from "./domain";
import type { ActionInput, PreviewUser, PreviewStore } from "./domain";
import type { ActionResult } from "../types";

type Envelope = { state: PreviewStore; receipts: Record<string, { hash: string; response: ActionResult }> };
function key(user: PreviewUser) { return `workspaces/${createHash("sha256").update(user.id).digest("hex")}.json`; }
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
}
async function load(user: PreviewUser) {
  const blob = await get(key(user), { access: "private", useCache: false });
  if (!blob) return { data: { state: createStore(user, new Date().toISOString()), receipts: {} } as Envelope, etag: undefined };
  if (blob.statusCode !== 200) throw new DomainError("저장소 응답을 다시 확인해 주세요.", 503);
  return { data: await new Response(blob.stream).json() as Envelope, etag: blob.blob.etag };
}
export async function readWorkspace(user: PreviewUser) { return snapshot((await load(user)).data.state); }
export async function mutateWorkspace(user: PreviewUser, input: ActionInput, requestId: string): Promise<ActionResult> {
  const hash = createHash("sha256").update(stable(input)).digest("hex");
  for (let attempt = 0; attempt < 6; attempt++) {
    const {data, etag} = await load(user);
    const prior = data.receipts[requestId];
    if (prior) {
      if (prior.hash !== hash) throw new DomainError("같은 요청 번호에 다른 작업을 사용할 수 없습니다.", 409);
      return {...prior.response, state: snapshot(data.state)};
    }
    const result = applyAction(input, data.state, new Date().toISOString());
    const response: ActionResult = {ok: true, message: result.message, ...(result.record ? {record: result.record} : {}), ...(result.holdId ? {holdId: result.holdId} : {})};
    const serialized = JSON.stringify({state: result.state, receipts: {...data.receipts, [requestId]: {hash, response}}});
    if (Buffer.byteLength(serialized) > 1500000) throw new DomainError("체험 기록 저장 한도에 도달했습니다.", 409);
    try {
      await put(key(user), serialized, {access: "private", addRandomSuffix: false, contentType: "application/json", ...(etag ? {ifMatch: etag, allowOverwrite: true} : {allowOverwrite: false})});
      return {...response, state: snapshot(result.state)};
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      if (!etag && (await load(user)).etag) continue;
      throw error;
    }
  }
  throw new DomainError("다른 작업이 처리 중입니다. 다시 시도해 주세요.", 409);
}
