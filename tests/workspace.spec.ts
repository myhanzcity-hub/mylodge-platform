import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ActionResult, RecordItem, WorkspaceState } from "../lib/types";

// This suite only exercises the loopback preview. It never calls a live payment,
// signature, messaging, registry, or payout provider.
const ORIGIN = "http://127.0.0.1:5173";
const consoleFailures = new WeakMap<Page, string[]>();
const allowedRejections = new WeakMap<Page, Set<number>>();

function plusDays(value: string, days: number) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function stateOf(page: Page): Promise<WorkspaceState> {
  const response = await page.request.get(ORIGIN + "/api/workspace");
  expect(response.ok(), "authenticated workspace GET succeeds").toBeTruthy();
  const state = await response.json() as WorkspaceState;
  expect(state.mode).toBe("preview");
  expect(state.capabilities).toEqual({
    liveContracts: false, livePayments: false, livePayouts: false, liveRentals: false,
  });
  return state;
}

function recordOf(state: WorkspaceState, id: string): RecordItem {
  const record = state.records.find(item => item.id === id);
  expect(record, `record ${id} exists in the current user's preview`).toBeTruthy();
  return record!;
}

async function visit(page: Page, path: string, heading?: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} responds successfully`).toBeTruthy();
  await expect(page.locator(".ws-page-header")).toBeVisible();
  if (heading) await expect(page.locator(".ws-page-header h1")).toHaveText(heading);
}

function card(page: Page, id: string) {
  return page.locator(".ws-record").filter({ has: page.locator(".ws-record-head small", { hasText: id }) });
}

async function clickAction(page: Page, action: string, click: () => Promise<unknown>, status = 200): Promise<ActionResult> {
  const responsePromise = page.waitForResponse(response => {
    if (new URL(response.url()).pathname !== "/api/workspace" || response.request().method() !== "POST") return false;
    try { return response.request().postDataJSON().action === action; } catch { return false; }
  });
  await click();
  const response = await responsePromise;
  expect(response.status(), `${action} response status`).toBe(status);
  const body = await response.json() as ActionResult;
  expect(body.ok).toBe(status < 400);
  return body;
}

async function submitDialog(page: Page, dialog: Locator, action: string, buttonName = "확인하고 처리", status = 200) {
  const result = await clickAction(page, action, () => dialog.getByRole("button", { name: buttonName, exact: true }).click(), status);
  if (status < 400) await expect(dialog).not.toBeVisible();
  else await expect(dialog.getByRole("alert")).toBeVisible();
  return result;
}

test.beforeEach(async ({ page, baseURL }) => {
  expect(baseURL, "workspace tests must stay on the local preview").toBe(ORIGIN);
  const failures: string[] = [];
  consoleFailures.set(page, failures);
  allowedRejections.set(page, new Set());
  page.on("pageerror", error => failures.push("pageerror: " + error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    const status = text.match(/Failed to load resource:.*\b(\d{3})\b/);
    if (status && allowedRejections.get(page)?.has(Number(status[1]))) return;
    failures.push("console: " + text);
  });
  await page.goto("/signin-with-chatgpt?return_to=/my");
  await expect(page.locator(".ws-page-header h1")).toHaveText("나의 홈");
  const reset = await page.request.post(ORIGIN + "/api/workspace", {
    headers: { Origin: ORIGIN },
    data: { action: "reset-preview", payload: {}, requestId: randomUUID() },
  });
  expect(reset.ok(), "reset is confined to the signed-in user's preview").toBeTruthy();
  const resetResult = await reset.json() as ActionResult;
  expect(resetResult.ok).toBeTruthy();
  await visit(page, "/my", "나의 홈");
});

test.afterEach(async ({ page }) => {
  expect(consoleFailures.get(page) || [], "no unexpected browser runtime or console errors").toEqual([]);
});

test("회원 예약: 경합 거부 시 원본 유지, 정상 변경과 취소 후 박수 복구", async ({ page }) => {
  const initial = await stateOf(page);
  const sample = recordOf(initial, "booking-sample");
  const start = plusDays(sample.data.start, 20);
  const end = plusDays(start, 2);

  await visit(page, "/my/book", "예약하기");
  await page.getByRole("combobox", { name: "이용할 별장", exact: true }).selectOption("jumunjin-mint");
  await page.getByLabel("체크인", { exact: true }).fill(start);
  await page.getByLabel("체크아웃", { exact: true }).fill(end);
  await page.getByRole("combobox", { name: "이용 인원", exact: true }).selectOption("2");
  const held = await clickAction(page, "booking-hold", () => page.getByRole("button", { name: "일정 임시 확보", exact: true }).click());
  expect(held.holdId).toBeTruthy();
  await expect(page.locator(".ws-hold-confirm")).toContainText("일정을 임시 확보했습니다");
  await page.getByRole("checkbox", { name: "2박 차감과 체험 예약 조건을 확인했습니다." }).check();
  const confirmed = await clickAction(page, "booking-confirm", () => page.getByRole("button", { name: "체험 예약 확정", exact: true }).click());
  expect(confirmed.record?.status).toBe("confirmed");
  const id = confirmed.record!.id;
  expect((await stateOf(page)).ledger.available).toBe(initial.ledger.available - 2);

  await visit(page, "/my/bookings", "이용 일정");
  await card(page, id).getByRole("button", { name: "일정 변경", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "예약 일정 변경", exact: true });
  await dialog.getByLabel("새 체크인").fill(sample.data.start);
  await dialog.getByLabel("새 체크아웃").fill(sample.data.end);
  allowedRejections.get(page)!.add(409);
  await submitDialog(page, dialog, "booking-change", "확인하고 처리", 409);
  await expect(dialog.getByRole("alert")).toContainText("선택한 일정");
  const rejected = recordOf(await stateOf(page), id);
  expect(rejected.data.start).toBe(start);
  expect(rejected.data.end).toBe(end);

  const changedStart = plusDays(start, 3);
  const changedEnd = plusDays(changedStart, 3);
  await dialog.getByLabel("새 체크인").fill(changedStart);
  await dialog.getByLabel("새 체크아웃").fill(changedEnd);
  await dialog.getByRole("spinbutton", { name: /^인원/ }).fill("3");
  await submitDialog(page, dialog, "booking-change");
  const changed = await stateOf(page);
  expect(recordOf(changed, id).data).toMatchObject({ start: changedStart, end: changedEnd, guests: 3, nights: 3 });
  expect(changed.ledger.available).toBe(initial.ledger.available - 3);

  await card(page, id).getByRole("button", { name: "예약 취소", exact: true }).click();
  const cancel = page.getByRole("dialog", { name: "체험 예약 취소", exact: true });
  await expect(cancel).toContainText("3박");
  await submitDialog(page, cancel, "booking-cancel", "취소 확정");
  const final = await stateOf(page);
  expect(recordOf(final, id).status).toBe("cancelled");
  expect(final.ledger.available).toBe(initial.ledger.available);
  expect(final.ledger.booked).toBe(initial.ledger.booked);
  await expect(card(page, id).getByRole("button", { name: "예약 취소", exact: true })).toHaveCount(0);
});

test("지인 초대와 침구 주문: 방문 범위 기록, 철회·주문 취소", async ({ page }) => {
  const initial = await stateOf(page);
  const booking = recordOf(initial, "booking-sample");
  await visit(page, "/my/bookings");
  await card(page, booking.id).getByRole("button", { name: "지인 초대", exact: true }).click();
  const invite = page.getByRole("dialog", { name: "지정 이용자 초대", exact: true });
  await invite.getByLabel("지인 이름").fill("테스트 지인");
  await invite.getByLabel("연락수단").fill("guest@example.test");
  const invited = await submitDialog(page, invite, "guest-invite");
  const guestId = invited.record!.id;
  expect(invited.record!.data).toMatchObject({ access: "visit-only", sent: false, bookingId: booking.id });
  await card(page, guestId).getByRole("button", { name: "초대 철회", exact: true }).click();
  await submitDialog(page, page.getByRole("dialog", { name: "초대 철회", exact: true }), "guest-revoke");
  expect(recordOf(await stateOf(page), guestId).status).toBe("revoked");

  await visit(page, "/my/services", "컨시어지");
  await page.locator(".ws-service-card").filter({ has: page.getByRole("heading", { name: "프리미엄 침구", exact: true }) }).getByRole("button", { name: "서비스 선택", exact: true }).click();
  const order = page.getByRole("dialog", { name: "프리미엄 침구 주문", exact: true });
  await order.getByLabel("연결 예약").selectOption(booking.id);
  await order.getByLabel("제공 날짜").fill(booking.data.start);
  await order.getByLabel("수량").fill("2");
  const ordered = await submitDialog(page, order, "order-create");
  const orderId = ordered.record!.id;
  expect(ordered.record!.data).toMatchObject({ serviceId: "bedding", quantity: 2, amount: 16000, paid: 0 });
  await card(page, orderId).getByRole("button", { name: "주문 취소", exact: true }).click();
  await submitDialog(page, page.getByRole("dialog", { name: "서비스 주문 취소", exact: true }), "order-cancel");
  expect(recordOf(await stateOf(page), orderId).status).toBe("cancelled");
});

test("등기 단계 증빙·납입 요청·거래 확인·1차 정산을 분리 처리", async ({ page }) => {
  await visit(page, "/admin/payments", "납입 · 환불");
  const invoiceRow = page.getByRole("row").filter({ hasText: "2회차 · 등기" });
  await invoiceRow.getByRole("button", { name: "단계 증빙 승인", exact: true }).click();
  await submitDialog(page, page.getByRole("dialog", { name: "체험 단계 증빙 승인", exact: true }), "admin-milestone-approve");
  expect(recordOf(await stateOf(page), "invoice-2").data.evidenceApproved).toBe(true);

  await visit(page, "/my/assets", "내 별장 · 계약");
  const memberInvoice = page.getByRole("row").filter({ hasText: "2회차 · 등기" });
  await memberInvoice.getByRole("button", { name: "납입 확인 요청", exact: true }).click();
  const report = page.getByRole("dialog", { name: "체험 납입 확인 요청", exact: true });
  await report.getByLabel("확인 요청 금액").fill("990000");
  await submitDialog(page, report, "payment-report");
  expect(recordOf(await stateOf(page), "invoice-2").status).toBe("reported");

  await visit(page, "/admin/payments");
  await page.getByRole("row").filter({ hasText: "2회차 · 등기" }).getByRole("button", { name: "체험 거래 확인", exact: true }).click();
  await submitDialog(page, page.getByRole("dialog", { name: "납입 확인 처리", exact: true }), "admin-payment-confirm");
  const paidInvoice = recordOf(await stateOf(page), "invoice-2");
  expect(paidInvoice.status).toBe("confirmed");
  expect(paidInvoice.data.paid).toBe(990000);

  await visit(page, "/admin/settlements", "정산 · 지급");
  const settlement = page.getByRole("row").filter({ hasText: "1차 인센티브 예시" });
  await settlement.getByRole("button", { name: "지급 조건 검토", exact: true }).click();
  await submitDialog(page, page.getByRole("dialog", { name: "체험 정산 승인", exact: true }), "admin-settlement-approve");
  await settlement.getByRole("button", { name: "체험 지급 기록", exact: true }).click();
  await submitDialog(page, page.getByRole("dialog", { name: "체험 지급 결과 기록", exact: true }), "admin-payout-record", "가상 지급 기록");
  const payout = recordOf(await stateOf(page), "settlement-1");
  expect(payout.status).toBe("paid");
  expect(payout.data).toMatchObject({ amount: 50000, paymentType: "preview-only" });

  await visit(page, "/partner/settlements");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "명세 CSV", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("mylodge-preview-settlements.csv");
});

test("미션 제출·검토와 승인된 보상의 지분 재고 배정", async ({ page }) => {
  const initial = await stateOf(page);
  await visit(page, "/partner/missions", "콘텐츠 · 미션");
  await page.getByRole("button", { name: "실적 제출", exact: true }).click();
  const submission = page.getByRole("dialog", { name: "활동 결과 제출", exact: true });
  await submission.getByRole("combobox", { name: /^채널/ }).selectOption("유튜브");
  await submission.getByLabel("콘텐츠 주소").fill("https://example.com/workspace-e2e-content");
  await submission.getByLabel("활동 설명").fill("공동소유 조건과 이용 방식 안내 콘텐츠 체험입니다.");
  const submitted = await submitDialog(page, submission, "mission-submit");
  expect(submitted.record!.status).toBe("submitted");
  expect(submitted.record!.data.url).toBe("https://example.com/workspace-e2e-content");

  // The initial reward explicitly references mission-sample. Approve that exact
  // mission rather than implying every new submission instantly earns a reward.
  await visit(page, "/admin/partners", "파트너 · 미션");
  const sampleMission = page.getByRole("row").filter({ hasText: "mission-sample" });
  await sampleMission.getByRole("button", { name: "진행 처리", exact: true }).click();
  const review = page.getByRole("dialog", { name: "체험 업무 상태 변경", exact: true });
  await review.getByLabel("다음 상태").selectOption("approved");
  await review.getByLabel("처리 사유 · 근거").fill("체험 미션 조건과 제출 자료 검토 완료");
  await submitDialog(page, review, "admin-update");

  await visit(page, "/admin/inventory", "지분 재고");
  await card(page, "reward-sample").getByRole("button", { name: "배정 검토", exact: true }).click();
  const allocation = page.getByRole("dialog", { name: "보상 지분 배정", exact: true });
  await allocation.getByLabel("배정 대상 별장").selectOption("jumunjin-mint");
  await allocation.getByLabel("배정 단위").fill("1");
  await submitDialog(page, allocation, "admin-reward-allocate", "체험 재고 배정");
  const final = await stateOf(page);
  expect(recordOf(final, "reward-sample").status).toBe("allocated");
  expect(final.inventory.allocated).toBe(initial.inventory.allocated + 1);
  expect(final.inventory.allocated).toBeLessThanOrEqual(final.inventory.capacity);
  await expect(card(page, "reward-sample").getByRole("button", { name: "배정 검토", exact: true })).toHaveCount(0);
});

test("정비 차단은 기존 예약을 유지하며 영향 안내와 해제를 연결", async ({ page }) => {
  const initial = await stateOf(page);
  const booking = recordOf(initial, "booking-sample");
  await visit(page, "/admin/operations", "현장 · 서비스");
  await page.getByRole("button", { name: "정비 등록", exact: true }).click();
  const maintenance = page.getByRole("dialog", { name: "정비 일정 등록", exact: true });
  await maintenance.getByLabel("대상 별장").selectOption(booking.data.lodgeId);
  await maintenance.getByLabel("정비 시작").fill(booking.data.start);
  await maintenance.getByLabel("정비 종료").fill(booking.data.end);
  await maintenance.getByLabel("사유 · 고객 안내").fill("시설 점검 체험으로 일정 확인이 필요합니다.");
  const blocked = await submitDialog(page, maintenance, "admin-block-create");
  const blockId = blocked.record!.id;
  const affected = recordOf(await stateOf(page), booking.id);
  expect(affected.status).toBe("confirmed");
  expect(affected.data.disruption.status).toBe("review-needed");

  await visit(page, "/my/bookings");
  await expect(card(page, booking.id).locator(".ws-disruption")).toContainText("정비 영향 확인이 필요합니다");
  await expect(card(page, booking.id).locator(".ws-disruption")).toContainText("기존 예약은 유지됩니다");
  await visit(page, "/my/book");
  const target = new Date(booking.data.start + "T00:00:00Z");
  const now = new Date();
  const months = (target.getUTCFullYear() - now.getFullYear()) * 12 + target.getUTCMonth() - now.getMonth();
  for (let i = 0; i < months; i++) await page.getByRole("button", { name: "다음 달", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^${booking.data.start} `) })).toBeDisabled();

  await visit(page, "/admin/operations");
  await card(page, blockId).getByRole("button", { name: "차단 해제", exact: true }).click();
  await submitDialog(page, page.getByRole("dialog", { name: "정비 차단 해제", exact: true }), "admin-block-release");
  const released = await stateOf(page);
  expect(recordOf(released, blockId).status).toBe("released");
  expect(recordOf(released, booking.id).status).toBe("confirmed");
  expect(recordOf(released, booking.id).data.disruption.status).toBe("resolved");
});

for (const width of [390, 320]) {
  test(`모바일 ${width}px: 회원·파트너·운영 화면에 문서 가로 넘침 없음`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/my", "/my/book", "/my/services", "/partner", "/partner/missions", "/admin", "/admin/payments", "/admin/policies"]) {
      await visit(page, path);
      await expect(page.locator(".ws-role-switch")).toBeVisible();
      const size = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      expect(size.document, `${path} document overflow at ${width}px`).toBeLessThanOrEqual(size.viewport + 1);
      expect(size.body, `${path} body overflow at ${width}px`).toBeLessThanOrEqual(size.viewport + 1);
    }
    await visit(page, "/my/book");
    const inputFont = await page.getByLabel("체크인", { exact: true }).evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(inputFont, "mobile date input remains readable without focus zoom").toBeGreaterThanOrEqual(16);
    await expect(page.getByRole("button", { name: "일정 임시 확보", exact: true })).toBeEnabled();
  });
}
