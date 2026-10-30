import test, { before, after } from "node:test";
import assert from "node:assert/strict";

// Integration checks intentionally refuse hosted URLs: they reset only a local demo workspace.
const base = process.env.MYLODGE_API_TEST_URL;
if (
  !base ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)
) {
  throw new Error(
    "MYLODGE_API_TEST_URL must explicitly name a running loopback preview.",
  );
}
let cookie = "";
let seed;
const endpoint = new URL("/api/workspace", base).href;
const id = () => crypto.randomUUID();
async function post(action, payload, requestId = id(), headers = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, ...headers },
    body: JSON.stringify({ action, payload, requestId }),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { data = { ok: false, error: raw }; }
  return { status: response.status, data };
}
async function read() {
  const response = await fetch(endpoint, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return response.json();
}
const future = (days) => {
  const now = Date.now() + 9 * 3600000;
  const today = new Date(now).toISOString().slice(0, 10);
  return new Date(Date.parse(today + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
};
before(async () => {
  const login = await fetch(
    new URL("/signin-with-chatgpt?return_to=/my", base),
    { redirect: "manual" },
  );
  cookie = login.headers
    .getSetCookie()
    .map((x) => x.split(";", 1)[0])
    .join("; ");
  assert.ok(
    cookie,
    "portable local sign-in must return its development cookie",
  );
  const result = await post("reset-preview", {});
  assert.equal(result.status, 200, JSON.stringify(result.data));
  seed = result.data.state;
});
after(async () => {
  if (cookie) await post("reset-preview", {});
});

test("anonymous records and cross-site mutations are rejected", async () => {
  assert.equal((await fetch(endpoint)).status, 401);
  const blocked = await post(
    "save-toggle",
    { lodgeId: "yangyang-rose" },
    id(),
    { Origin: "https://unrelated.example" },
  );
  assert.equal(blocked.status, 403);
  assert.equal((await read()).saved.length, 0);
});
test("durable reads retain successful server changes", async () => {
  const result = await post("save-toggle", { lodgeId: "yangyang-rose" });
  assert.equal(result.status, 200);
  assert.ok((await read()).saved.includes("yangyang-rose"));
});
test("concurrent identical requests create exactly one hold and one debit", async () => {
  const requestId = id(),
    payload = {
      lodgeId: "yangyang-rose",
      start: future(50),
      end: future(52),
      guests: 2,
    };
  const [a, b] = await Promise.all([
    post("booking-hold", payload, requestId),
    post("booking-hold", payload, requestId),
  ]);
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(b.status, 200, JSON.stringify(b.data));
  assert.equal(a.data.holdId, b.data.holdId);
  const state = await read();
  assert.equal(
    state.records.filter(
      (r) => r.type === "hold" && r.data.start === payload.start,
    ).length,
    1,
  );
  assert.equal(state.ledger.held, 2);
  const conflict = await post(
    "booking-hold",
    { ...payload, guests: 3 },
    requestId,
  );
  assert.equal(conflict.status, 409);
  assert.equal(
    (await post("booking-release", { holdId: a.data.holdId })).status,
    200,
  );
});
test("concurrent overlapping holds allow one winner with nonnegative rights", async () => {
  const payload = {
    lodgeId: "jumunjin-blue",
    start: future(60),
    end: future(62),
    guests: 2,
  };
  const results = await Promise.all([
    post("booking-hold", payload),
    post("booking-hold", payload),
  ]);
  assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
  const winner = results.find((x) => x.status === 200);
  const confirmed = await post("booking-confirm", {
    holdId: winner.data.holdId,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.ok(confirmed.data.state.ledger.available >= 0);
  const cancelled = await post("booking-cancel", {
    id: confirmed.data.record.id,
  });
  assert.equal(cancelled.status, 200);
  assert.equal(
    (await post("booking-cancel", { id: confirmed.data.record.id })).status,
    409,
  );
  assert.equal((await read()).ledger.available, seed.ledger.available);
});
test("a failed reservation change leaves original persisted booking unchanged", async () => {
  const original = (await read()).records.find(
    (r) => r.id === "booking-sample",
  );
  const hold = await post("booking-hold", {
    lodgeId: "jumunjin-mint",
    start: future(70),
    end: future(72),
    guests: 2,
  });
  assert.equal(hold.status, 200);
  const failure = await post("booking-change", {
    id: original.id,
    start: future(70),
    end: future(71),
    guests: 2,
  });
  assert.equal(failure.status, 409);
  const persisted = (await read()).records.find((r) => r.id === original.id);
  assert.equal(persisted.data.start, original.data.start);
  assert.equal(persisted.data.end, original.data.end);
  await post("booking-release", { holdId: hold.data.holdId });
});
test("payment review, milestone and commission preserve distinct stages", async () => {
  assert.equal(
    (await post("admin-settlement-approve", { id: "settlement-1" })).status,
    409,
  );
  assert.equal(
    (await post("payment-report", { id: "invoice-2", amount: 990000 })).status,
    200,
  );
  assert.equal(
    (await post("admin-payment-confirm", { id: "invoice-2" })).status,
    409,
  );
  assert.equal(
    (await post("admin-milestone-approve", { id: "invoice-2" })).status,
    200,
  );
  assert.equal(
    (await post("admin-payment-confirm", { id: "invoice-2" })).status,
    200,
  );
  assert.equal(
    (await post("admin-settlement-approve", { id: "settlement-1" })).status,
    200,
  );
  const paid = await post("admin-payout-record", { id: "settlement-1" });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.record.data.paymentType, "preview-only");
  assert.equal(paid.data.state.capabilities.livePayouts, false);
});
test("required consent, record ownership and unapproved status jumps are enforced", async () => {
  assert.equal(
    (
      await post("consultation-create", {
        name: "테스트",
        contact: "test@example.test",
        message: "문의입니다",
        consent: false,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post("admin-update", {
        id: "unknown-foreign-record",
        status: "approved",
      })
    ).status,
    404,
  );
  assert.equal(
    (await post("admin-update", { id: "invoice-3", status: "confirmed" }))
      .status,
    409,
  );
  assert.equal(
    (await post("admin-policy-update", { key: "livePayments", value: true }))
      .status,
    400,
  );
});
