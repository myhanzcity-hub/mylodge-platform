import test from "node:test";
import assert from "node:assert/strict";
const domainPath = "../lib/server/domain.ts";
const { createStore, applyAction, snapshot, DomainError, localDay, addDays } =
  await import(domainPath);
const NOW = "2026-10-30T03:00:00.000Z";
const user = {
  id: "test-user-a",
  name: "체험 사용자",
  email: "test@example.test",
};
const seed = () => createStore(user, NOW);
const act = (
  state: any,
  action: string,
  payload: Record<string, unknown>,
  now = NOW,
) => applyAction({ action, payload }, state, now);
const bookingInput = {
  lodgeId: "yangyang-rose",
  start: "2026-11-20",
  end: "2026-11-23",
  guests: 2,
};

test("preview seed keeps actual transactions unavailable and balances at 13 nights", () => {
  const state = snapshot(seed(), NOW);
  assert.equal(state.mode, "preview");
  assert.equal(state.ledger.available, 13);
  assert.deepEqual(Object.values(state.capabilities), [
    false,
    false,
    false,
    false,
  ]);
  assert.deepEqual(
    state.records
      .filter((r: any) => r.type === "invoice")
      .sort((a: any, b: any) => a.data.number - b.data.number)
      .map((r: any) => r.data.amount),
    [594000, 990000, 1188000, 1188000],
  );
});
test("hold reserves rights, confirmation converts rather than double charges", () => {
  const held = act(seed(), "booking-hold", bookingInput);
  assert.equal(snapshot(held.state, NOW).ledger.available, 10);
  assert.equal(snapshot(held.state, NOW).ledger.held, 3);
  const confirmed = act(held.state, "booking-confirm", { holdId: held.holdId });
  const balance = snapshot(confirmed.state, NOW).ledger;
  assert.equal(balance.held, 0);
  assert.equal(balance.booked, 5);
  assert.equal(balance.available, 10);
  assert.throws(
    () => act(confirmed.state, "booking-confirm", { holdId: held.holdId }),
    DomainError,
  );
});
test("overlapping reservations reject but checkout-to-checkin adjacency is allowed", () => {
  const held = act(seed(), "booking-hold", bookingInput);
  const confirmed = act(held.state, "booking-confirm", { holdId: held.holdId });
  assert.throws(
    () =>
      act(confirmed.state, "booking-hold", {
        ...bookingInput,
        start: "2026-11-22",
        end: "2026-11-24",
      }),
    /예약 또는 정비/,
  );
  assert.doesNotThrow(() =>
    act(confirmed.state, "booking-hold", {
      ...bookingInput,
      start: "2026-11-23",
      end: "2026-11-24",
    }),
  );
});
test("expired holds release rights and cannot be confirmed", () => {
  const held = act(seed(), "booking-hold", bookingInput);
  const later = "2026-10-30T03:11:00.000Z";
  assert.equal(snapshot(held.state, later).ledger.available, 13);
  assert.throws(
    () => act(held.state, "booking-confirm", { holdId: held.holdId }, later),
    DomainError,
  );
  assert.doesNotThrow(() =>
    act(held.state, "booking-hold", bookingInput, later),
  );
});
test("insufficient nights leave original state untouched", () => {
  const s = seed(),
    original = JSON.stringify(s);
  assert.throws(
    () =>
      act(s, "booking-hold", {
        ...bookingInput,
        start: "2026-11-20",
        end: "2026-12-04",
      }),
    /박수가 부족/,
  );
  assert.equal(JSON.stringify(s), original);
});
test("failed change preserves original reservation and ledger", () => {
  const held = act(seed(), "booking-hold", {
    lodgeId: "jumunjin-mint",
    start: "2026-11-20",
    end: "2026-11-23",
    guests: 2,
  });
  const confirmed = act(held.state, "booking-confirm", { holdId: held.holdId });
  const before = JSON.stringify(confirmed.state);
  assert.throws(
    () =>
      act(confirmed.state, "booking-change", {
        id: "booking-sample",
        start: "2026-11-21",
        end: "2026-11-22",
        guests: 2,
      }),
    /예약 또는 정비/,
  );
  assert.equal(JSON.stringify(confirmed.state), before);
});
test("cancellation restores rights once and revokes guest plus unstarted services", () => {
  let s = act(seed(), "guest-invite", {
    bookingId: "booking-sample",
    name: "친구",
    contact: "friend@example.test",
  }).state;
  const b = s.records.find((r: any) => r.id === "booking-sample");
  s = act(s, "order-create", {
    bookingId: b.id,
    serviceId: "bedding",
    quantity: 1,
    date: b.data.start,
  }).state;
  const result = act(s, "booking-cancel", { id: b.id });
  assert.equal(snapshot(result.state, NOW).ledger.available, 15);
  assert.equal(
    result.state.records.find((r: any) => r.type === "guest").status,
    "revoked",
  );
  assert.equal(
    result.state.records.find((r: any) => r.type === "order").status,
    "cancelled",
  );
  assert.throws(
    () => act(result.state, "booking-cancel", { id: b.id }),
    DomainError,
  );
});
test("existing bookings retain cancellation policy snapshots", () => {
  const updated = act(seed(), "admin-policy-update", {
    key: "cancellationNoticeDays",
    value: 30,
  }).state;
  assert.equal(updated.policies.cancellationNoticeDays, 30);
  assert.equal(
    updated.records.find((r: any) => r.id === "booking-sample").data
      .policySnapshot.cancellationNoticeDays,
    0,
  );
  assert.doesNotThrow(() =>
    act(updated, "booking-cancel", { id: "booking-sample" }),
  );
});
test("unscoped record id cannot mutate another workspace", () => {
  const a = act(seed(), "support-create", {
    category: "이용",
    message: "문의 내용 테스트",
  });
  const b = createStore(
    { id: "test-user-b", name: "다른 사용자", email: "other@example.test" },
    NOW,
  );
  assert.throws(
    () => act(b, "admin-update", { id: a.record.id, status: "in-progress" }),
    /찾을 수 없습니다/,
  );
});
test("unsupported admin transitions and live capability editing are rejected", () => {
  assert.throws(
    () => act(seed(), "admin-update", { id: "invoice-2", status: "confirmed" }),
    /허용되지 않은/,
  );
  assert.throws(
    () =>
      act(seed(), "admin-policy-update", { key: "livePayments", value: true }),
    /변경할 수 없는/,
  );
});
test("payment reports need stage evidence and preceding installment completion", () => {
  let s = act(seed(), "payment-report", {
    id: "invoice-2",
    amount: 990000,
  }).state;
  assert.equal(
    s.records.find((r: any) => r.id === "invoice-2").status,
    "reported",
  );
  assert.throws(
    () => act(s, "admin-payment-confirm", { id: "invoice-2" }),
    /증빙/,
  );
  s = act(s, "admin-milestone-approve", { id: "invoice-2" }).state;
  s = act(s, "admin-payment-confirm", { id: "invoice-2" }).state;
  assert.equal(
    s.records.find((r: any) => r.id === "invoice-2").data.paid,
    990000,
  );
  assert.throws(
    () => act(s, "admin-payment-confirm", { id: "invoice-2" }),
    DomainError,
  );
});
test("partial payments remain partial and cannot exceed remaining amount", () => {
  let s = act(seed(), "admin-milestone-approve", { id: "invoice-2" }).state;
  s = act(s, "payment-report", { id: "invoice-2", amount: 100000 }).state;
  s = act(s, "admin-payment-confirm", { id: "invoice-2" }).state;
  const invoice = s.records.find((r: any) => r.id === "invoice-2");
  assert.equal(invoice.status, "partial");
  assert.equal(invoice.data.paid, 100000);
  assert.throws(
    () => act(s, "payment-report", { id: "invoice-2", amount: 990000 }),
    /남은 납입액/,
  );
});
test("commission requires confirmed invoice and payment is a preview-only record", () => {
  assert.throws(
    () => act(seed(), "admin-settlement-approve", { id: "settlement-1" }),
    DomainError,
  );
  let s = act(seed(), "admin-milestone-approve", { id: "invoice-2" }).state;
  s = act(s, "payment-report", { id: "invoice-2", amount: 990000 }).state;
  s = act(s, "admin-payment-confirm", { id: "invoice-2" }).state;
  s = act(s, "admin-settlement-approve", { id: "settlement-1" }).state;
  const result = act(s, "admin-payout-record", { id: "settlement-1" });
  assert.equal(result.record.data.paymentType, "preview-only");
  assert.throws(
    () => act(result.state, "admin-payout-record", { id: "settlement-1" }),
    DomainError,
  );
});
test("reward requires approved mission and cannot over-allocate 120 units", () => {
  assert.throws(
    () =>
      act(seed(), "admin-reward-allocate", {
        id: "reward-sample",
        lodgeId: "jumunjin-mint",
        units: 1,
      }),
    DomainError,
  );
  let s = act(seed(), "admin-update", {
    id: "mission-sample",
    status: "approved",
  }).state;
  s.initialAllocated = 120;
  assert.throws(
    () =>
      act(s, "admin-reward-allocate", {
        id: "reward-sample",
        lodgeId: "jumunjin-mint",
        units: 1,
      }),
    /120/,
  );
  s.initialAllocated = 119;
  const result = act(s, "admin-reward-allocate", {
    id: "reward-sample",
    lodgeId: "jumunjin-mint",
    units: 1,
  });
  assert.equal(snapshot(result.state, NOW).inventory.allocated, 120);
  assert.throws(
    () =>
      act(result.state, "admin-reward-allocate", {
        id: "reward-sample",
        lodgeId: "jumunjin-mint",
        units: 1,
      }),
    DomainError,
  );
});
test("service capacity is separate from nights and total is server-calculated", () => {
  const s = seed(),
    b = s.records.find((r: any) => r.id === "booking-sample");
  assert.throws(
    () =>
      act(s, "order-create", {
        bookingId: b.id,
        serviceId: "cart",
        quantity: 5,
        date: b.data.start,
      }),
    /공급 수량/,
  );
  const result = act(s, "order-create", {
    bookingId: b.id,
    serviceId: "bedding",
    quantity: 2,
    date: b.data.start,
    amount: 1,
  });
  assert.equal(result.record.data.amount, 16000);
  assert.equal(result.record.data.paid, 0);
});
test("swaps cannot overwrite unavailable target and preserve original on failure", () => {
  let s = act(seed(), "swap-create", {
    bookingId: "booking-sample",
    region: "양양",
    message: "같은 일정 교환",
  }).state;
  const b = s.records.find((r: any) => r.id === "booking-sample");
  s = act(s, "booking-hold", {
    lodgeId: "yangyang-rose",
    start: b.data.start,
    end: b.data.end,
    guests: 2,
  }).state;
  const swap = s.records.find((r: any) => r.type === "swap"),
    before = JSON.stringify(s);
  assert.throws(() => act(s, "swap-accept", { id: swap.id }), /예약 또는 정비/);
  assert.equal(JSON.stringify(s), before);
});
test("invalid dates, guest capacity, consent and unsafe URLs are rejected", () => {
  assert.throws(
    () => act(seed(), "booking-hold", { ...bookingInput, start: "2026-02-30" }),
    /유효한 날짜/,
  );
  assert.throws(
    () => act(seed(), "booking-hold", { ...bookingInput, guests: 20 }),
    DomainError,
  );
  assert.throws(
    () =>
      act(seed(), "consultation-create", {
        name: "테스트",
        contact: "test@example.test",
        message: "상담 요청",
        consent: false,
      }),
    /필수/,
  );
  assert.throws(
    () =>
      act(seed(), "mission-submit", {
        channel: "유튜브",
        url: "javascript:alert(1)",
      }),
    /https/,
  );
});
test("Korea date boundary and explicit reset preserve isolation", () => {
  assert.equal(localDay("2026-10-30T16:00:00Z"), "2026-10-31");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  const result = act(
    act(seed(), "save-toggle", { lodgeId: "yangyang-rose" }).state,
    "reset-preview",
    {},
  );
  assert.deepEqual(result.state.saved, []);
  assert.equal(result.state.user.id, user.id);
  assert.equal(snapshot(result.state, NOW).ledger.available, 13);
});

test("maintenance blocks future inventory and records impacted bookings without cancelling them", () => {
  const base = seed();
  const b = base.records.find((r: any) => r.id === "booking-sample");
  const blocked = act(base, "admin-block-create", {
    lodgeId: b.data.lodgeId,
    start: b.data.start,
    end: b.data.end,
    reason: "시설 점검 체험",
  });
  const booking = blocked.state.records.find((r: any) => r.id === b.id);
  assert.equal(booking.status, "confirmed");
  assert.equal(booking.data.disruption.status, "review-needed");
  assert.deepEqual(blocked.record.data.affectedBookingIds, [b.id]);
  const cancelled = act(blocked.state, "booking-cancel", { id: b.id }).state;
  assert.throws(
    () =>
      act(cancelled, "booking-hold", {
        lodgeId: b.data.lodgeId,
        start: b.data.start,
        end: b.data.end,
        guests: 2,
      }),
    /예약 또는 정비/,
  );
  const released = act(cancelled, "admin-block-release", {
    id: blocked.record.id,
  }).state;
  assert.doesNotThrow(() =>
    act(released, "booking-hold", {
      lodgeId: b.data.lodgeId,
      start: b.data.start,
      end: b.data.end,
      guests: 2,
    }),
  );
});
