import { getChatGPTUser } from "../../chatgpt-auth";
import { DomainError } from "../../../lib/server/domain";
import { mutateWorkspace, readWorkspace } from "../../../lib/server/store";

export const dynamic = "force-dynamic";
const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: responseHeaders });
}
async function identity() {
  const user = await getChatGPTUser();
  if (!user)
    throw new DomainError(
      "로그인 후 내 체험 워크스페이스를 이용해 주세요.",
      401,
    );
  return { id: user.userId, name: user.displayName, email: user.email };
}
function failure(error: unknown) {
  if (error instanceof DomainError)
    return json({ ok: false, error: error.message }, error.status);
  console.error(
    "Workspace storage operation failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return json(
    {
      ok: false,
      error: "데이터 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    },
    503,
  );
}
export async function GET() {
  try {
    return json(await readWorkspace(await identity()));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await identity();
    const origin = request.headers.get("origin");
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && origin !== new URL(request.url).origin)
    )
      throw new DomainError(
        "현재 사이트에서 시작한 요청만 처리할 수 있습니다.",
        403,
      );
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("application/json")
    )
      throw new DomainError("JSON 요청이 필요합니다.", 415);
    if (Number(request.headers.get("content-length")) > 16000)
      throw new DomainError("요청 내용이 너무 큽니다.", 413);
    const reader = request.body?.getReader();
    let raw = "",
      size = 0;
    const decoder = new TextDecoder();
    if (reader) {
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 16000) {
            await reader.cancel();
            throw new DomainError("요청 내용이 너무 큽니다.", 413);
          }
          raw += decoder.decode(part.value, { stream: true });
        }
        raw += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new DomainError("요청 내용을 확인해 주세요.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new DomainError("올바른 요청이 필요합니다.");
    const value = body as Record<string, unknown>;
    if (
      Object.keys(value).some(
        (k) => !["action", "payload", "requestId"].includes(k),
      )
    )
      throw new DomainError("알 수 없는 요청 필드가 포함되어 있습니다.");
    if (
      typeof value.action !== "string" ||
      value.action.length < 2 ||
      value.action.length > 70
    )
      throw new DomainError("작업 이름을 확인해 주세요.");
    if (
      !value.payload ||
      typeof value.payload !== "object" ||
      Array.isArray(value.payload)
    )
      throw new DomainError("작업 내용이 필요합니다.");
    if (
      typeof value.requestId !== "string" ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(value.requestId)
    )
      throw new DomainError("유효한 요청 번호가 필요합니다.");
    return json(
      await mutateWorkspace(
        user,
        {
          action: value.action,
          payload: value.payload as Record<string, unknown>,
        },
        value.requestId,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
