import type { RecordItem, WorkspaceState } from "../types";

export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
export type PreviewUser = { id: string; name: string; email: string };
export type PreviewStore = {
  user: PreviewUser;
  records: RecordItem[];
  granted: number;
  initialAllocated: number;
  saved: string[];
  policies: Record<string, any>;
  revision: number;
};
export type DomainResult = {
  state: PreviewStore;
  message: string;
  record?: RecordItem;
  holdId?: string;
};
export type ActionInput = { action: string; payload: Record<string, unknown> };
const DAY = 86400000;
const LODGES: Record<string, { capacity: number; name: string }> = {
  "jumunjin-mint": { capacity: 4, name: "민트 코스트 스위트" },
  "yangyang-rose": { capacity: 4, name: "로즈 가든 스위트" },
  "jumunjin-coral": { capacity: 6, name: "코랄 선셋 프레스티지" },
  "yangyang-forest": { capacity: 4, name: "포레스트 우드 스위트" },
  "jumunjin-blue": { capacity: 4, name: "블루 브리즈 스위트" },
  "yangyang-peach": { capacity: 4, name: "피치 데이즈 스위트" },
};
const SERVICES: Record<
  string,
  { price: number; name: string; capacity: number }
> = {
  cleaning: { price: 20000, name: "룸 클리닝", capacity: 8 },
  bedding: { price: 8000, name: "프리미엄 침구", capacity: 20 },
  dining: { price: 35000, name: "인룸 다이닝", capacity: 12 },
  cart: { price: 5000, name: "빌리지 카트", capacity: 4 },
};
function text(
  p: Record<string, unknown>,
  key: string,
  min = 1,
  max = 500,
): string {
  const v = p[key];
  if (typeof v !== "string" || v.trim().length < min || v.trim().length > max)
    throw new DomainError(`${key}: ${min}~${max}자 사이로 입력해 주세요.`);
  return v.trim();
}
function optional(p: Record<string, unknown>, key: string, max = 500) {
  return p[key] === undefined || p[key] === "" ? "" : text(p, key, 0, max);
}
function integer(
  p: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
) {
  const n = p[key];
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < min || n > max)
    throw new DomainError(`${key}: ${min}~${max} 사이의 정수가 필요합니다.`);
  return n;
}
function consent(p: Record<string, unknown>) {
  if (p.consent !== true)
    throw new DomainError("필수 개인정보 처리 안내를 확인해 주세요.");
}
function url(p: Record<string, unknown>, key: string) {
  const v = text(p, key, 5, 1200);
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password) throw Error();
    return u.href;
  } catch {
    throw new DomainError(
      "https:// 로 시작하는 공개 콘텐츠 주소를 입력해 주세요.",
    );
  }
}
function unitId(p: Record<string, unknown>) {
  const id = text(p, "lodgeId", 1, 80);
  if (!Object.hasOwn(LODGES, id))
    throw new DomainError("선택한 별장을 찾을 수 없습니다.", 404);
  return id;
}
export function localDay(now: string | number | Date = Date.now()) {
  return new Date(new Date(now).getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * DAY)
    .toISOString()
    .slice(0, 10);
}
function date(v: unknown) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v))
    throw new DomainError("날짜를 YYYY-MM-DD 형식으로 선택해 주세요.");
  const d = new Date(v + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v)
    throw new DomainError("유효한 날짜를 선택해 주세요.");
  return v;
}
function dates(p: Record<string, unknown>, s: PreviewStore, now: string) {
  const start = date(p.start),
    end = date(p.end),
    nights = Math.round((Date.parse(end) - Date.parse(start)) / DAY),
    today = localDay(now);
  if (start < today || nights < 1 || nights > 15)
    throw new DomainError("오늘 이후의 1~15박 일정을 선택해 주세요.");
  if (end > addDays(today, s.policies.bookingWindowDays))
    throw new DomainError(
      `체험 예약은 ${s.policies.bookingWindowDays}일 이내 일정만 가능합니다.`,
    );
  return { start, end, nights };
}
function find(s: PreviewStore, id: unknown, types?: string | string[]) {
  if (typeof id !== "string") throw new DomainError("대상 항목이 필요합니다.");
  const r = s.records.find((x) => x.id === id);
  if (
    !r ||
    (types && !(Array.isArray(types) ? types : [types]).includes(r.type))
  )
    throw new DomainError(
      "내 워크스페이스에서 해당 항목을 찾을 수 없습니다.",
      404,
    );
  return r;
}
function status(r: RecordItem, allowed: string[]) {
  if (!allowed.includes(r.status))
    throw new DomainError(
      `현재 상태(${r.status})에서는 처리할 수 없습니다.`,
      409,
    );
}
function patch(
  r: RecordItem,
  next: string,
  now: string,
  data: Record<string, any> = {},
) {
  r.status = next;
  r.updatedAt = now;
  r.data = { ...r.data, ...data };
}
function push(
  s: PreviewStore,
  type: string,
  title: string,
  next: string,
  data: Record<string, any>,
  now: string,
  id: string = crypto.randomUUID(),
) {
  const r: RecordItem = {
    id,
    type,
    title,
    status: next,
    data: { ...data, demo: true, mode: "preview" },
    createdAt: now,
    updatedAt: now,
  };
  s.records.push(r);
  return r;
}
function expire(s: PreviewStore, now: string) {
  for (const r of s.records)
    if (r.type === "hold" && r.status === "held" && r.data.expiresAt <= now)
      patch(r, "expired", now);
}
function amounts(s: PreviewStore) {
  const sum = (t: string, ss: string[]) =>
    s.records
      .filter((r) => r.type === t && ss.includes(r.status))
      .reduce((n, r) => n + Number(r.data.nights || 0), 0);
  const held = sum("hold", ["held"]),
    booked = sum("booking", ["confirmed", "checked-in"]),
    used = sum("booking", ["completed"]);
  return {
    granted: s.granted,
    held,
    booked,
    used,
    available: s.granted - held - booked - used,
  };
}
function allocated(s: PreviewStore) {
  return (
    s.initialAllocated +
    s.records
      .filter(
        (r) =>
          r.type === "reward" &&
          ["allocated", "rights-confirmed"].includes(r.status),
      )
      .reduce((n, r) => n + r.data.units, 0)
  );
}
function available(
  s: PreviewStore,
  unit: string,
  start: string,
  end: string,
  ignore: string[] = [],
) {
  if (
    s.records.some(
      (r) =>
        !ignore.includes(r.id) &&
        r.data.lodgeId === unit &&
        ((r.type === "booking" &&
          ["confirmed", "checked-in"].includes(r.status)) ||
          (r.type === "hold" && r.status === "held") ||
          (r.type === "block" && r.status === "active")) &&
        r.data.start < end &&
        r.data.end > start,
    )
  )
    throw new DomainError(
      "선택한 일정은 예약 또는 정비로 이용할 수 없습니다. 다른 날짜를 선택해 주세요.",
      409,
    );
}
function ledger(
  s: PreviewStore,
  title: string,
  sourceId: string,
  change: Record<string, number>,
  now: string,
) {
  push(s, "ledger", title, "recorded", { sourceId, ...change }, now);
}

export function createStore(
  user: PreviewUser,
  now = new Date().toISOString(),
): PreviewStore {
  const today = localDay(now),
    s: PreviewStore = {
      user,
      granted: 15,
      initialAllocated: 116,
      saved: [],
      revision: 1,
      policies: {
        version: "preview-v1",
        holdMinutes: 10,
        bookingWindowDays: 180,
        cancellationNoticeDays: 0,
        seasonPolicy: "성수기는 운영자 검토 후 배정",
        approvedForLive: false,
      },
      records: [],
    };
  push(
    s,
    "contract",
    "나의 첫 별장 공동소유 계약 예시",
    "in-progress",
    {
      lodgeId: "jumunjin-mint",
      fraction: "1/120",
      price: 3960000,
      annualNights: 3,
      version: "preview-v1",
      rightsStatus: "서류 확인 전",
      documentStatus: "체험 문서",
      notice: "실제 서명·계약·소유권을 발생시키지 않습니다.",
    },
    now,
    "contract-sample",
  );
  const rates = [15, 25, 30, 30],
    stages = ["계약", "등기", "토목", "준공"];
  rates.forEach((rate, i) =>
    push(
      s,
      "invoice",
      `${i + 1}회차 · ${stages[i]} 납입 예시`,
      i === 0 ? "confirmed" : i === 1 ? "due" : "planned",
      {
        contractId: "contract-sample",
        number: i + 1,
        stage: stages[i],
        rate,
        amount: (3960000 * rate) / 100,
        paid: i === 0 ? 594000 : 0,
        evidenceApproved: i === 0,
        reportedAmount: 0,
      },
      now,
      `invoice-${i + 1}`,
    ),
  );
  push(
    s,
    "booking",
    "주문진에서의 두 밤",
    "confirmed",
    {
      lodgeId: "jumunjin-mint",
      start: addDays(today, 14),
      end: addDays(today, 16),
      nights: 2,
      guests: 2,
      policyVersion: s.policies.version,
      policySnapshot: { ...s.policies },
    },
    now,
    "booking-sample",
  );
  push(
    s,
    "consultation",
    "공동소유 상담 예시",
    "contacted",
    {
      name: "체험 고객",
      contact: "demo@example.test",
      lodgeId: "jumunjin-mint",
      message: "지분별 이용 조건이 궁금합니다.",
      referralCode: "PREVIEW",
      attributionStatus: "검토 전",
    },
    now,
    "consultation-sample",
  );
  push(
    s,
    "partner",
    "마이롯지 앰배서더 체험",
    "approved",
    {
      name: user.name,
      channel: "유튜브",
      url: "https://example.com/demo-channel",
      followers: 5000,
    },
    now,
    "partner-sample",
  );
  push(
    s,
    "mission",
    "별장 라이프 콘텐츠 미션",
    "submitted",
    {
      channel: "유튜브",
      url: "https://example.com/demo-content",
      message: "체험용 콘텐츠 제출 예시",
      requiredCount: 2,
      submittedCount: 1,
      version: "preview-v1",
    },
    now,
    "mission-sample",
  );
  [50000, 100000, 100000].forEach((amount, i) =>
    push(
      s,
      "settlement",
      `${i + 1}차 인센티브 예시`,
      "pending",
      {
        amount,
        tranche: i + 1,
        invoiceId: `invoice-${i + 2}`,
        rate: [20, 40, 40][i],
        contractId: "contract-sample",
        partnerId: "partner-sample",
        attributionStatus: "confirmed",
        taxPolicy: "미확정 · 실지급 불가",
      },
      now,
      `settlement-${i + 1}`,
    ),
  );
  push(
    s,
    "reward",
    "스타트 플레이 1/120 보상 예시",
    "eligible",
    {
      units: 1,
      missionId: "mission-sample",
      fraction: "1/120",
      reason: "미션",
      notice: "실제 권리를 부여하지 않는 재고 배정 체험",
    },
    now,
    "reward-sample",
  );
  push(
    s,
    "work",
    "입실 전 공간 점검",
    "assigned",
    {
      bookingId: "booking-sample",
      lodgeId: "jumunjin-mint",
      date: addDays(today, 14),
      assignee: "현장 운영 체험",
      checklist: ["청소 상태", "침구 확인", "시설 점검"],
    },
    now,
    "work-sample",
  );
  push(
    s,
    "support",
    "체험 환경 이용 안내",
    "received",
    {
      category: "이용",
      message:
        "계약·결제·예약은 실제 거래가 아닌 격리된 체험 데이터로 저장됩니다.",
    },
    now,
    "support-sample",
  );
  push(
    s,
    "content",
    "주문진 빌리지 사업 소식",
    "draft",
    { category: "진행 현황", source: "제공 사업계획서", verifiedAt: null },
    now,
    "content-sample",
  );
  ledger(s, "체험 이용권 15박 부여", "preview-grant", { granted: 15 }, now);
  ledger(s, "예시 예약 2박 확보", "booking-sample", { booked: 2 }, now);
  return s;
}
export function snapshot(
  store: PreviewStore,
  now = new Date().toISOString(),
): WorkspaceState {
  const s: PreviewStore = structuredClone(store);
  expire(s, now);
  return {
    mode: "preview",
    user: s.user,
    records: s.records
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    ledger: amounts(s),
    inventory: { allocated: allocated(s), capacity: 120 },
    saved: s.saved,
    capabilities: {
      liveContracts: false,
      livePayments: false,
      livePayouts: false,
      liveRentals: false,
    },
    policies: s.policies,
  };
}

const transitions: Record<string, Record<string, string[]>> = {
  consultation: {
    received: ["assigned", "contacted", "closed"],
    assigned: ["contacted", "scheduled", "closed"],
    contacted: ["scheduled", "completed", "closed"],
    scheduled: ["completed", "closed"],
    completed: ["contract-review", "closed"],
    "contract-review": ["closed"],
  },
  support: {
    received: ["assigned", "in-progress"],
    assigned: ["in-progress", "resolved"],
    "in-progress": ["awaiting-customer", "resolved"],
    "awaiting-customer": ["in-progress", "resolved"],
    resolved: ["in-progress"],
  },
  partner: {
    submitted: ["reviewing", "revision-requested", "approved", "rejected"],
    reviewing: ["revision-requested", "approved", "rejected"],
    "revision-requested": ["reviewing", "approved", "rejected"],
    approved: ["suspended"],
    suspended: ["approved", "closed"],
  },
  mission: {
    submitted: ["reviewing", "revision-requested", "approved", "rejected"],
    reviewing: ["revision-requested", "approved", "rejected"],
    "revision-requested": ["reviewing", "approved", "rejected"],
  },
  work: {
    assigned: ["in-progress"],
    "in-progress": ["inspection"],
    inspection: ["completed", "rework"],
    rework: ["in-progress"],
  },
  order: {
    received: ["assigned", "cancelled"],
    assigned: ["in-progress", "cancelled"],
    "in-progress": ["completed", "failed"],
    failed: ["refunding"],
    refunding: ["refunded"],
  },
  transfer: {
    received: ["reviewing", "documents-needed"],
    reviewing: ["documents-needed", "approved", "rejected"],
    "documents-needed": ["reviewing"],
  },
  booking: { confirmed: ["checked-in"], "checked-in": ["completed"] },
};

export function applyAction(
  input: ActionInput,
  original: PreviewStore,
  now = new Date().toISOString(),
): DomainResult {
  const s: PreviewStore = structuredClone(original);
  expire(s, now);
  const p = input.payload;
  let record: RecordItem | undefined,
    holdId: string | undefined,
    message = "체험 워크스페이스에 저장했습니다.";
  switch (input.action) {
    case "save-toggle": {
      const id = unitId(p);
      s.saved = s.saved.includes(id)
        ? s.saved.filter((x) => x !== id)
        : [...s.saved, id];
      message = s.saved.includes(id)
        ? "별장을 저장했습니다."
        : "저장을 해제했습니다.";
      break;
    }
    case "consultation-create": {
      consent(p);
      const planId = optional(p, "planId", 40),
        villageId = optional(p, "villageId", 40);
      if (
        planId &&
        !["share-120", "share-60", "share-30", "share-24"].includes(planId)
      )
        throw new DomainError("관심 지분 상품을 확인해 주세요.");
      if (villageId && !["jumunjin", "yangyang"].includes(villageId))
        throw new DomainError("관심 단지를 확인해 주세요.");
      record = push(
        s,
        "consultation",
        "공동소유 상담 요청",
        "received",
        {
          name: text(p, "name", 1, 60),
          contact: text(p, "contact", 4, 120),
          lodgeId: p.lodgeId ? unitId(p) : "",
          planId,
          villageId,
          message: text(p, "message", 2, 2000),
          referralCode: optional(p, "referralCode", 80),
          attributionStatus: "검토 전",
          consent: {
            required: true,
            marketing: p.marketingConsent === true,
            at: now,
            version: "preview-v1",
          },
        },
        now,
      );
      message =
        "상담 요청을 체험 워크스페이스에 저장했습니다. 실제 연락은 발송되지 않습니다.";
      break;
    }
    case "support-create":
      record = push(
        s,
        "support",
        text(p, "category", 1, 40) + " 문의",
        "received",
        { category: p.category, message: text(p, "message", 5, 3000) },
        now,
      );
      message = "문의가 저장되었습니다. 내 공간에서 처리 상태를 확인하세요.";
      break;
    case "partner-apply":
      consent(p);
      record = push(
        s,
        "partner",
        "앰배서더 지원",
        "submitted",
        {
          name: text(p, "name", 1, 60),
          channel: text(p, "channel", 1, 40),
          url: url(p, "url"),
          followers: integer(p, "followers", 0, 100000000),
          contact: optional(p, "contact", 120),
          message: optional(p, "message", 2000),
          consentAt: now,
          ruleVersion: "preview-v1",
        },
        now,
      );
      break;
    case "profile-update":
      s.user.name = text(p, "name", 1, 60);
      break;
    case "booking-hold": {
      const unit = unitId(p),
        span = dates(p, s, now),
        guests = integer(p, "guests", 1, LODGES[unit].capacity);
      available(s, unit, span.start, span.end);
      if (amounts(s).available < span.nights)
        throw new DomainError("사용 가능한 이용 박수가 부족합니다.", 409);
      record = push(
        s,
        "hold",
        LODGES[unit].name + " 일정 확보",
        "held",
        {
          lodgeId: unit,
          ...span,
          guests,
          expiresAt: new Date(
            Date.parse(now) + s.policies.holdMinutes * 60000,
          ).toISOString(),
          policyVersion: s.policies.version,
          policySnapshot: { ...s.policies },
        },
        now,
      );
      holdId = record.id;
      ledger(s, "예약 임시 확보", record.id, { held: span.nights }, now);
      message = `${s.policies.holdMinutes}분 동안 일정과 이용권을 확보했습니다. 최종 확인 후 예약을 확정하세요.`;
      break;
    }
    case "booking-confirm": {
      const hold = find(s, p.holdId, "hold");
      status(hold, ["held"]);
      available(s, hold.data.lodgeId, hold.data.start, hold.data.end, [
        hold.id,
      ]);
      patch(hold, "converted", now);
      record = push(
        s,
        "booking",
        LODGES[hold.data.lodgeId].name + " 체험 예약",
        "confirmed",
        { ...hold.data, holdId: hold.id, confirmedAt: now },
        now,
      );
      ledger(
        s,
        "체험 예약 확정",
        record.id,
        { held: -hold.data.nights, booked: hold.data.nights },
        now,
      );
      message = "체험 예약을 확정했습니다. 실제 숙박 예약은 발생하지 않습니다.";
      break;
    }
    case "booking-release": {
      record = find(s, p.holdId, "hold");
      status(record, ["held"]);
      patch(record, "released", now);
      ledger(
        s,
        "임시 확보 해제",
        record.id,
        { held: -record.data.nights },
        now,
      );
      message = "일정과 이용권의 임시 확보를 해제했습니다.";
      break;
    }
    case "booking-change": {
      record = find(s, p.id, "booking");
      status(record, ["confirmed"]);
      const span = dates(p, s, now),
        guests = integer(p, "guests", 1, LODGES[record.data.lodgeId].capacity);
      available(s, record.data.lodgeId, span.start, span.end, [record.id]);
      const invited = s.records.filter(
        (r) =>
          r.type === "guest" &&
          r.data.bookingId === record!.id &&
          r.status === "invited",
      ).length;
      if (invited > guests)
        throw new DomainError(
          "먼저 초대 인원을 정리한 뒤 예약 인원을 줄여 주세요.",
          409,
        );
      const diff = span.nights - record.data.nights;
      if (amounts(s).available < diff)
        throw new DomainError(
          "변경에 필요한 이용 박수가 부족합니다. 기존 예약은 유지됩니다.",
          409,
        );
      const previous = {
        start: record.data.start,
        end: record.data.end,
        nights: record.data.nights,
        guests: record.data.guests,
      };
      patch(record, "confirmed", now, {
        ...span,
        guests,
        changeHistory: [
          ...(record.data.changeHistory || []),
          { at: now, previous },
        ],
        serviceReviewRequired: s.records.some(
          (r) =>
            r.type === "order" &&
            r.data.bookingId === record!.id &&
            !["cancelled", "refunded"].includes(r.status),
        ),
      });
      ledger(s, "예약 일정 변경", record.id, { booked: diff }, now);
      message =
        "체험 예약을 변경했습니다. 연결 서비스의 제공 날짜도 확인해 주세요.";
      break;
    }
    case "booking-cancel": {
      record = find(s, p.id, "booking");
      status(record, ["confirmed"]);
      const cutoff = Number(
        record.data.policySnapshot?.cancellationNoticeDays || 0,
      );
      if (record.data.start < addDays(localDay(now), cutoff))
        throw new DomainError(
          "온라인 취소 가능 시점을 지났습니다. 문의를 접수해 주세요.",
          409,
        );
      patch(record, "cancelled", now, {
        cancelledAt: now,
        restoredNights: record.data.nights,
        refundAmount: 0,
      });
      for (const r of s.records) {
        if (r.data.bookingId !== record.id) continue;
        if (r.type === "guest" && r.status === "invited")
          patch(r, "revoked", now);
        if (r.type === "swap" && r.status === "open")
          patch(r, "withdrawn", now);
        if (r.type === "order" && ["received", "assigned"].includes(r.status))
          patch(r, "cancelled", now, { reason: "예약 취소", refundAmount: 0 });
      }
      ledger(
        s,
        "예약 취소 · 이용권 복구",
        record.id,
        { booked: -record.data.nights },
        now,
      );
      message = `${record.data.nights}박을 복구했습니다. 미진행 서비스와 초대도 취소했습니다.`;
      break;
    }
    case "guest-invite": {
      const b = find(s, p.bookingId, "booking");
      status(b, ["confirmed"]);
      if (
        s.records.filter(
          (r) =>
            r.type === "guest" &&
            r.data.bookingId === b.id &&
            r.status === "invited",
        ).length >= b.data.guests
      )
        throw new DomainError("예약 인원을 넘는 초대는 만들 수 없습니다.", 409);
      record = push(
        s,
        "guest",
        text(p, "name", 1, 60) + "님 이용 초대",
        "invited",
        {
          bookingId: b.id,
          name: p.name,
          contact: text(p, "contact", 4, 120),
          access: "visit-only",
          expiresAt: b.data.end,
          sent: false,
        },
        now,
      );
      message = "초대 기록을 저장했습니다. 실제 메시지는 발송되지 않습니다.";
      break;
    }
    case "guest-revoke":
      record = find(s, p.id, "guest");
      status(record, ["invited"]);
      patch(record, "revoked", now);
      break;
    case "swap-create": {
      const b = find(s, p.bookingId, "booking");
      status(b, ["confirmed"]);
      const region = text(p, "region", 1, 40);
      if (!["양양", "주문진", "yangyang", "jumunjin"].includes(region))
        throw new DomainError(
          "체험 교환 지역은 주문진 또는 양양을 선택해 주세요.",
        );
      if (
        s.records.some(
          (r) =>
            r.type === "swap" &&
            r.data.bookingId === b.id &&
            r.status === "open",
        )
      )
        throw new DomainError("이미 교환 신청 중인 예약입니다.", 409);
      record = push(
        s,
        "swap",
        "회원 간 일정 교환 신청",
        "open",
        {
          bookingId: b.id,
          region,
          message: optional(p, "message", 1000),
          nights: b.data.nights,
          original: { ...b.data },
        },
        now,
      );
      break;
    }
    case "swap-accept": {
      const swap = find(s, p.id, "swap");
      status(swap, ["open"]);
      const b = find(s, swap.data.bookingId, "booking");
      status(b, ["confirmed"]);
      const prefix =
        swap.data.region.includes("양양") || swap.data.region === "yangyang"
          ? "yangyang"
          : "jumunjin";
      const target = Object.keys(LODGES).find(
        (id) => id !== b.data.lodgeId && id.startsWith(prefix),
      )!;
      available(s, target, b.data.start, b.data.end, [b.id]);
      if (LODGES[target].capacity < b.data.guests)
        throw new DomainError("교환 대상의 수용 인원이 부족합니다.", 409);
      patch(b, "confirmed", now, {
        lodgeId: target,
        exchangedFrom: b.data.lodgeId,
        exchangeId: swap.id,
        guestReviewRequired: true,
        serviceReviewRequired: true,
      });
      patch(swap, "confirmed", now, {
        targetLodgeId: target,
        acceptedAt: now,
        counterparty: "격리된 체험 교환 재고",
        notice: "실제 다른 회원의 예약을 변경하지 않습니다.",
      });
      for (const r of s.records)
        if (
          r.type === "guest" &&
          r.data.bookingId === b.id &&
          r.status === "invited"
        )
          patch(r, "revoked", now);
      record = swap;
      message = "체험 교환을 확정했습니다. 연결 서비스는 다시 확인해 주세요.";
      break;
    }
    case "swap-withdraw":
      record = find(s, p.id, "swap");
      status(record, ["open"]);
      patch(record, "withdrawn", now);
      break;
    case "order-create": {
      const b = find(s, p.bookingId, "booking");
      status(b, ["confirmed", "checked-in"]);
      const id = text(p, "serviceId", 1, 50);
      if (!Object.hasOwn(SERVICES, id))
        throw new DomainError("선택한 서비스를 찾을 수 없습니다.");
      const quantity = integer(p, "quantity", 1, id === "cleaning" ? 1 : 10),
        day = date(p.date);
      if (day < b.data.start || day > b.data.end)
        throw new DomainError("서비스 날짜는 방문 일정 안에서 선택해 주세요.");
      const used = s.records
        .filter(
          (r) =>
            r.type === "order" &&
            r.data.serviceId === id &&
            r.data.date === day &&
            !["cancelled", "refunded", "failed"].includes(r.status),
        )
        .reduce((n, r) => n + r.data.quantity, 0);
      if (used + quantity > SERVICES[id].capacity)
        throw new DomainError(
          "선택 날짜의 서비스 공급 수량이 부족합니다.",
          409,
        );
      record = push(
        s,
        "order",
        SERVICES[id].name,
        "received",
        {
          bookingId: b.id,
          lodgeId: b.data.lodgeId,
          serviceId: id,
          quantity,
          date: day,
          unitPrice: SERVICES[id].price,
          amount: SERVICES[id].price * quantity,
          paid: 0,
          priceType: "체험용 요금",
        },
        now,
      );
      message =
        "서비스 주문을 저장했습니다. 실제 결제·현장 배정은 발생하지 않습니다.";
      break;
    }
    case "order-cancel":
      record = find(s, p.id, "order");
      status(record, ["received", "assigned"]);
      patch(record, "cancelled", now, { refundAmount: 0 });
      break;
    case "event-reserve": {
      const eventId = text(p, "eventId", 1, 80),
        quantity = integer(p, "quantity", 1, 6);
      if (
        !["pool-preview", "village-walk", "pool-party", "sunset-walk"].includes(
          eventId,
        )
      )
        throw new DomainError("체험할 행사를 찾을 수 없습니다.");
      const used = s.records
        .filter(
          (r) =>
            r.type === "event" &&
            r.data.eventId === eventId &&
            r.status === "confirmed",
        )
        .reduce((n, r) => n + r.data.quantity, 0);
      if (used + quantity > 12)
        throw new DomainError("체험 행사 정원이 마감되었습니다.", 409);
      record = push(
        s,
        "event",
        "빌리지 프로그램 체험 신청",
        "confirmed",
        {
          eventId,
          quantity,
          amount: 0,
          notice: "실제 개최·입장권이 아닌 기능 체험입니다.",
        },
        now,
      );
      break;
    }
    case "event-cancel":
      record = find(s, p.id, "event");
      status(record, ["confirmed"]);
      patch(record, "cancelled", now);
      break;
    case "transfer-request": {
      const kind = text(p, "kind", 1, 20);
      if (!["양도", "상속", "transfer", "inheritance"].includes(kind))
        throw new DomainError("양도 또는 상속을 선택해 주세요.");
      record = push(
        s,
        "transfer",
        "권리 이전 검토 요청",
        "received",
        {
          kind,
          message: text(p, "message", 5, 2000),
          contractId: "contract-sample",
          rightsChanged: false,
        },
        now,
      );
      message = "이전 검토 요청을 저장했습니다. 실제 권리는 변경되지 않습니다.";
      break;
    }
    case "payment-report": {
      record = find(s, p.id, "invoice");
      status(record, ["due", "planned", "partial"]);
      const amount = integer(p, "amount", 1, 100000000);
      if (amount > record.data.amount - record.data.paid)
        throw new DomainError("남은 납입액보다 큰 금액은 요청할 수 없습니다.");
      patch(record, "reported", now, {
        reportedAmount: amount,
        reportedAt: now,
      });
      message =
        "입금 확인 요청을 저장했습니다. 실제 납입 완료는 담당 확인 후 변경됩니다.";
      break;
    }
    case "mission-submit":
      record = push(
        s,
        "mission",
        "콘텐츠 미션 제출",
        "submitted",
        {
          channel: text(p, "channel", 1, 40),
          url: url(p, "url"),
          message: optional(p, "message", 2000),
          version: "preview-v1",
        },
        now,
      );
      break;
    case "admin-block-create": {
      const unit = unitId(p),
        start = date(p.start),
        end = date(p.end);
      const days = (Date.parse(end) - Date.parse(start)) / DAY;
      if (start < localDay(now) || days < 1 || days > 90)
        throw new DomainError("오늘 이후의 1~90일 점검 기간을 선택해 주세요.");
      const reason = text(p, "reason", 2, 300);
      const affected = s.records.filter(
        (r) =>
          r.type === "booking" &&
          r.data.lodgeId === unit &&
          ["confirmed", "checked-in"].includes(r.status) &&
          r.data.start < end &&
          r.data.end > start,
      );
      record = push(
        s,
        "block",
        LODGES[unit].name + " 정비 차단",
        "active",
        {
          lodgeId: unit,
          start,
          end,
          reason,
          affectedBookingIds: affected.map((r) => r.id),
        },
        now,
      );
      for (const booking of affected)
        patch(booking, booking.status, now, {
          disruption: { blockId: record.id, reason, status: "review-needed" },
        });
      for (const hold of s.records) {
        if (
          hold.type === "hold" &&
          hold.status === "held" &&
          hold.data.lodgeId === unit &&
          hold.data.start < end &&
          hold.data.end > start
        ) {
          patch(hold, "released", now, { reason: "정비 차단" });
          ledger(
            s,
            "정비 차단으로 임시 확보 해제",
            hold.id,
            { held: -hold.data.nights },
            now,
          );
        }
      }
      message = `${affected.length}건의 예약 영향을 기록하고 새 예약을 차단했습니다. 기존 확정 예약은 임의 취소하지 않습니다.`;
      break;
    }
    case "admin-block-release": {
      record = find(s, p.id, "block");
      status(record, ["active"]);
      patch(record, "released", now, { releasedAt: now });
      for (const booking of s.records) {
        if (
          booking.type === "booking" &&
          booking.data.disruption?.blockId === record.id
        )
          patch(booking, booking.status, now, {
            disruption: {
              ...booking.data.disruption,
              status: "resolved",
              resolvedAt: now,
            },
          });
      }
      message = "정비 차단을 해제하고 영향 기록을 갱신했습니다.";
      break;
    }
    case "admin-update": {
      record = find(s, p.id);
      const next = text(p, "status", 1, 50);
      if (!transitions[record.type]?.[record.status]?.includes(next))
        throw new DomainError("허용되지 않은 상태 변경입니다.", 409);
      if (record.type === "booking" && next === "completed")
        ledger(
          s,
          "이용 완료",
          record.id,
          { booked: -record.data.nights, used: record.data.nights },
          now,
        );
      patch(record, next, now, {
        adminNote: optional(p, "note", 1000),
        reviewedAt: now,
      });
      break;
    }
    case "admin-payment-confirm": {
      record = find(s, p.id, "invoice");
      status(record, ["reported"]);
      if (!record.data.evidenceApproved)
        throw new DomainError(
          "해당 사업 단계의 증빙을 먼저 승인해 주세요.",
          409,
        );
      if (
        s.records.some(
          (r) =>
            r.type === "invoice" &&
            r.data.contractId === record!.data.contractId &&
            r.data.number < record!.data.number &&
            r.status !== "confirmed",
        )
      )
        throw new DomainError("앞선 회차의 납입 확인이 필요합니다.", 409);
      const paid = record.data.paid + record.data.reportedAmount;
      patch(
        record,
        paid === record.data.amount ? "confirmed" : "partial",
        now,
        {
          paid,
          reportedAmount: 0,
          confirmedAt: now,
          confirmation: "체험 거래 확인 · 실제 입금 증빙 없음",
        },
      );
      message =
        "체험 납입 확인을 기록했습니다. 실제 자금 거래·등기는 변경되지 않습니다.";
      break;
    }
    case "admin-milestone-approve": {
      record = find(s, p.id, "invoice");
      if (record.data.evidenceApproved)
        throw new DomainError("이미 단계 확인을 기록했습니다.", 409);
      patch(record, record.status === "planned" ? "due" : record.status, now, {
        evidenceApproved: true,
        evidenceApprovedAt: now,
        evidence: "체험용 단계 확인 · 실제 증빙 아님",
      });
      break;
    }
    case "admin-reward-allocate": {
      record = find(s, p.id, "reward");
      status(record, ["eligible"]);
      status(find(s, record.data.missionId, "mission"), ["approved"]);
      const unit = unitId(p),
        units = integer(p, "units", 1, 5);
      if (units !== record.data.units)
        throw new DomainError("승인된 보상 수량과 일치해야 합니다.");
      if (allocated(s) + units > 120)
        throw new DomainError(
          "판매·보상 합계가 공급 지분 120단위를 초과합니다.",
          409,
        );
      patch(record, "allocated", now, {
        lodgeId: unit,
        allocatedAt: now,
        rightsStatus: "체험 배정 · 권리 확인 전",
      });
      message =
        "체험 보상 재고를 배정했습니다. 실제 소유권은 발생하지 않습니다.";
      break;
    }
    case "admin-settlement-approve": {
      record = find(s, p.id, "settlement");
      status(record, ["pending"]);
      status(find(s, record.data.invoiceId, "invoice"), ["confirmed"]);
      status(find(s, record.data.partnerId, "partner"), ["approved"]);
      if (record.data.attributionStatus !== "confirmed")
        throw new DomainError("추천 귀속 확인이 필요합니다.", 409);
      patch(record, "approved", now, { approvedAt: now });
      break;
    }
    case "admin-payout-record":
      record = find(s, p.id, "settlement");
      status(record, ["approved"]);
      patch(record, "paid", now, {
        paidAt: now,
        paymentType: "preview-only",
        notice: "체험 지급 기록 · 실제 송금 없음",
      });
      message = "체험 지급 기록을 남겼습니다. 실제 송금은 실행되지 않았습니다.";
      break;
    case "admin-policy-update": {
      const key = text(p, "key", 1, 50);
      if (key === "holdMinutes") s.policies[key] = integer(p, "value", 1, 30);
      else if (key === "bookingWindowDays")
        s.policies[key] = integer(p, "value", 30, 730);
      else if (key === "cancellationNoticeDays")
        s.policies[key] = integer(p, "value", 0, 60);
      else if (key === "seasonPolicy")
        s.policies[key] = text(p, "value", 2, 100);
      else throw new DomainError("변경할 수 없는 정책입니다.");
      s.revision++;
      s.policies.version = `preview-v${s.revision}`;
      record = push(
        s,
        "policy",
        "체험 운영정책 변경",
        "recorded",
        { key, value: s.policies[key], version: s.policies.version },
        now,
      );
      message = "체험 정책을 저장했습니다. 기존 예약의 적용 조건은 유지됩니다.";
      break;
    }
    case "admin-content-update": {
      record = find(s, p.id, "content");
      const next = text(p, "status", 1, 40);
      if (!["draft", "review", "published", "archived"].includes(next))
        throw new DomainError("콘텐츠 상태를 확인해 주세요.");
      record.title = text(p, "title", 1, 150);
      patch(record, next, now, { reviewedAt: now });
      break;
    }
    case "reset-preview": {
      const reset = createStore(s.user, now);
      push(
        reset,
        "audit",
        "내 체험 데이터 초기화",
        "recorded",
        { action: input.action, scope: "own-preview-only" },
        now,
      );
      return {
        state: reset,
        message: "내 체험 데이터를 초기 상태로 복원했습니다.",
      };
    }
    default:
      throw new DomainError("지원하지 않는 작업입니다.");
  }
  if (amounts(s).available < 0 || allocated(s) > 120)
    throw new DomainError("이용권 또는 지분 재고 검증에 실패했습니다.", 409);
  push(
    s,
    "audit",
    message,
    "recorded",
    {
      action: input.action,
      targetId: record?.id || null,
      scope: "own-preview-only",
      policyVersion: s.policies.version,
    },
    now,
  );
  return { state: s, message, record, holdId };
}
