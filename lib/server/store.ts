import type { ActionInput, PreviewUser } from "./domain";
export async function readWorkspace(user: PreviewUser) {
 const adapter = process.env.MYLODGE_RUNTIME === "vercel" ? await import("./store-vercel") : await import("./store-cloudflare");
 return adapter.readWorkspace(user);
}
export async function mutateWorkspace(user: PreviewUser, input: ActionInput, requestId: string) {
 const adapter = process.env.MYLODGE_RUNTIME === "vercel" ? await import("./store-vercel") : await import("./store-cloudflare");
 return adapter.mutateWorkspace(user, input, requestId);
}
