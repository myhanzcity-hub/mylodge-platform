import { test } from "node:test";
import assert from "node:assert/strict";
const sessionPath = "../lib/server/preview-session.ts";
const { signSession, verifySession } = await import(sessionPath);

test("preview cookies require an intact signature, secret and future expiry", () => {
  const id = "6ef97da2-f31f-4bb7-ae27-c3a808452641";
  const token = signSession(id, 2000, "test-secret");
  assert.equal(verifySession(token, "test-secret", 1000), id);
  assert.equal(verifySession(token, "wrong-secret", 1000), null);
  assert.equal(verifySession(token, "test-secret", 2000), null);
  assert.equal(verifySession(token.replace(id, "0" + id.slice(1)), "test-secret", 1000), null);
  assert.equal(verifySession(token + ".extra", "test-secret", 1000), null);
  assert.equal(verifySession(undefined, "test-secret", 1000), null);
});
