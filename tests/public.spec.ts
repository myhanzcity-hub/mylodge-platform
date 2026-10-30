import { test, expect, type Page } from "@playwright/test";

type Snapshot = {
  mode: string;
  saved: string[];
  records: { id: string; type: string; data: Record<string, any> }[];
};

function localOrigin(baseURL: string | undefined) {
  if (!baseURL) throw new Error("Public browser tests need an explicit loopback baseURL.");
  const url = new URL(baseURL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Browser tests refuse to reset hosted or production workspaces.");
  }
  return url.origin;
}

async function resetPreview(page: Page, baseURL: string | undefined) {
  const response = await page.request.post("/api/workspace", {
    headers: { Origin: localOrigin(baseURL) },
    data: { action: "reset-preview", payload: {}, requestId: crypto.randomUUID() },
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function loginAndReset(page: Page, baseURL: string | undefined, returnTo: string) {
  localOrigin(baseURL);
  await page.goto(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
  await expect(page).toHaveURL(new RegExp(returnTo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
  await resetPreview(page, baseURL);
  await page.reload();
}

async function snapshot(page: Page): Promise<Snapshot> {
  const response = await page.request.get("/api/workspace");
  expect(response.status()).toBe(200);
  return response.json() as Promise<Snapshot>;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
}

test("public destinations, guides and policies serve readable pages without invented operating claims", async ({ page }) => {
  test.setTimeout(180_000);
  const pages: [string, RegExp][] = [
    ["/", /휴식|별장/],
    ["/lodges", /어떤 휴식/],
    ["/lodges/jumunjin-mint", /민트 코스트 스위트/],
    ["/destinations/jumunjin", /주문진/],
    ["/destinations/yangyang", /양양/],
    ["/villages/jumunjin", /주문진 코스트 빌리지/],
    ["/villages/yangyang", /양양 가든 빌리지/],
    ["/styles", /어떤 색/],
    ["/ownership", /별장 소유/],
    ["/ownership/pricing", /내게 맞는 소유/],
    ["/ownership/process", /처음의 관심/],
    ["/progress", /확인할 수 있는 과정/],
    ["/life", /즐거움을 더하다/],
    ["/stories", /삶의 이야기를/],
    ["/stories/a-place-to-return", /돌아올 곳/],
    ["/stories/your-color", /어떤 색/],
    ["/stories/shared-ownership", /함께 소유/],
    ["/help", /무엇이 궁금/],
    ["/consult", /함께 살펴보세요/],
    ["/partners", /당신의 이야기/],
    ["/partners/apply", /새로운 휴식/],
    ["/saved", /마음에 담아/],
    ["/privacy", /무엇이 궁금/],
    ["/terms", /무엇이 궁금/],
  ];
  for (const [path, heading] of pages) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("main h1"), path).toHaveCount(1);
    await expect(page.locator("main h1"), path).toContainText(heading);
  }
  await page.goto("/progress?village=yangyang");
  await expect(page.getByText("개별 증빙 확인 전", { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: /토목·건축/ }).click();
  await expect(page.getByText("임의의 공사 진행률이나 완료 날짜를 표시하지 않습니다.", { exact: true })).toBeVisible();
  await expect(page.locator(".pub-progress-board")).not.toContainText("공사 완료 100%");
  await page.goto("/help?category=사업");
  await expect(page.getByRole("button", { name: "사업", exact: true })).toHaveClass(/active/);
  await expect(page.getByText("주문진과 양양은 현재 예약할 수 있나요?", { exact: true })).toBeVisible();
});

test("search combines location, style and budget, survives reload and explains an empty result", async ({ page }) => {
  await page.goto("/lodges");
  await expect(page.locator(".pub-lodge-card")).toHaveCount(6);
  await page.getByLabel("지역", { exact: true }).selectOption("양양");
  await expect(page.locator(".pub-lodge-card")).toHaveCount(3);
  await page.getByRole("button", { name: "로맨틱", exact: true }).click();
  await expect(page.locator(".pub-lodge-card")).toHaveCount(1);
  await expect(page.locator(".pub-lodge-card h3")).toHaveText("로즈 가든 스위트");
  await expect(page).toHaveURL(/region=%EC%96%91%EC%96%91.*style=pink/);
  await page.reload();
  await expect(page.getByLabel("지역", { exact: true })).toHaveValue("양양");
  await expect(page.getByRole("button", { name: "로맨틱", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".pub-lodge-card")).toHaveCount(1);
  await page.getByLabel("연간 최소 이용 박수").selectOption("6");
  await page.getByLabel("최대 분양 예산").selectOption("396");
  await expect(page.getByRole("heading", { name: "조건에 맞는 공간이 없어요" })).toBeVisible();
  await expect(page.locator(".pub-lodge-card")).toHaveCount(0);
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await expect(page).toHaveURL(/\/lodges$/);
  await expect(page.locator(".pub-lodge-card")).toHaveCount(6);
  await page.getByRole("button", { name: "지역 보기", exact: true }).click();
  await page.locator(".pub-coast-line").getByRole("button", { name: /강릉 · 주문진/ }).click();
  await expect(page.locator(".pub-lodge-card")).toHaveCount(3);
  await expect(page).toHaveURL(/region=jumunjin/);
  await expect(page.getByText("확정 주소를 표시한 지도가 아닌 지역 관계를 설명하는 개념도입니다.", { exact: true })).toBeVisible();
});

test("quick view restores focus, filters and scroll on Escape and browser Back", async ({ page }) => {
  await page.goto("/lodges?region=yangyang");
  const trigger = page.getByRole("button", { name: "빠르게 보기", exact: true }).first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  // Record the actual opening click; Playwright may scroll the trigger before dispatch.
  await page.evaluate(() => document.addEventListener("click", () => {
    document.body.dataset.modalOpeningScroll = String(scrollY);
  }, { once: true, capture: true }));
  await trigger.click();
  const previousScroll = Number(await page.locator("body").getAttribute("data-modal-opening-scroll"));
  expect(Number.isFinite(previousScroll)).toBe(true);
  const dialog = page.getByRole("dialog", { name: "로즈 가든 스위트" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - previousScroll)).toBeLessThan(5);
  await expect(page.getByLabel("지역", { exact: true })).toHaveValue("yangyang");
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/lodges\?region=yangyang$/);
  await expect(page.locator(".pub-lodge-card")).toHaveCount(3);
});

test("comparison has a three-place limit and preserves choices after closing", async ({ page }) => {
  await page.goto("/lodges");
  const checks = page.getByRole("checkbox", { name: "비교", exact: true });
  await checks.nth(0).check();
  await checks.nth(1).check();
  await checks.nth(2).check();
  await checks.nth(3).click();
  await expect(checks.nth(3)).not.toBeChecked();
  await expect(page.getByText("최대 세 곳까지 비교할 수 있습니다. 선택한 곳을 해제한 뒤 추가해 주세요.", { exact: true })).toBeVisible();
  const open = page.getByRole("button", { name: "함께 비교", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "나의 휴식, 함께 비교하기" });
  await expect(dialog).toBeVisible();
  for (const name of ["민트 코스트 스위트", "로즈 가든 스위트", "코랄 선셋 프레스티지"]) {
    await expect(dialog.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(dialog.getByRole("rowheader", { name: "기본 상품", exact: true })).toBeVisible();
  await expect(dialog.getByText("1/120 지분 · 연 3박", { exact: true })).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  for (let i = 0; i < 3; i++) await expect(checks.nth(i)).toBeChecked();
});

test("plan selection recalculates four installments and clearly labels amortization", async ({ page }) => {
  await page.goto("/ownership/pricing?plan=share-60");
  const installments = page.locator(".pub-payment-bars");
  await expect(installments.getByText("1,188,000원", { exact: true })).toBeVisible();
  await expect(installments.getByText("1,980,000원", { exact: true })).toBeVisible();
  await expect(installments.getByText("2,376,000원", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: /1\/24 지분/ }).click();
  await expect(page).toHaveURL(/plan=share-24/);
  await expect(installments.getByText("2,970,000원", { exact: true })).toBeVisible();
  await expect(installments.getByText("4,950,000원", { exact: true })).toBeVisible();
  await expect(installments.getByText("5,940,000원", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("checkbox", { name: /스페셜 패키지/ })).toBeDisabled();
  await page.getByRole("button", { name: /1\/120 지분/ }).click();
  await expect(page.locator(".pub-amortization-value")).toContainText("26,400원");
  await expect(page.getByText("실제 숙박 결제액이 아닌, 분양대금을 이용 기간과 박수로 나눈 환산 예시입니다.", { exact: true })).toBeVisible();
  const years = page.getByRole("slider", { name: /이용 기간 가정/ });
  await years.focus();
  await years.press("Home");
  await years.press("ArrowRight");
  await expect(years).toHaveValue("10");
  await expect(page.locator(".pub-amortization-value")).toContainText("132,000원");
  await expect(page.getByRole("link", { name: "이 조건으로 상담 작성", exact: true })).toHaveAttribute("href", "/consult?plan=share-120");
});

test("consultation preserves a signed-out draft and stores optional marketing separately", async ({ page, baseURL }) => {
  localOrigin(baseURL);
  await page.context().clearCookies();
  await page.goto("/consult?lodge=yangyang-rose&plan=share-60");
  await expect(page.getByLabel("관심 별장", { exact: true })).toHaveValue("yangyang-rose");
  await page.getByRole("textbox", { name: "이름", exact: true }).fill("공개 UI 상담 검증");
  await page.getByRole("textbox", { name: "연락수단", exact: true }).fill("qa+consult@example.test");
  await page.getByLabel("궁금한 내용·상담 희망 시간", { exact: false }).fill("자동 검증용 상담입니다. 실제 연락은 필요하지 않습니다.");
  await page.getByRole("checkbox", { name: /^\[필수\]/ }).check();
  await expect(page.getByRole("checkbox", { name: /^\[선택\]/ })).not.toBeChecked();
  await page.getByRole("button", { name: "상담 요청 저장", exact: true }).click();
  await page.getByRole("link", { name: "로그인하고 계속", exact: false }).click();
  await expect(page).toHaveURL(/\/consult\?lodge=yangyang-rose&plan=share-60$/);
  await expect(page.getByRole("textbox", { name: "이름", exact: true })).toHaveValue("공개 UI 상담 검증");
  await expect(page.getByRole("textbox", { name: "연락수단", exact: true })).toHaveValue("qa+consult@example.test");
  await expect(page.getByRole("checkbox", { name: /^\[필수\]/ })).toBeChecked();
  await resetPreview(page, baseURL);
  await page.getByRole("button", { name: "상담 요청 저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "상담 요청을 저장했습니다.", exact: true })).toBeVisible();
  const record = (await snapshot(page)).records.find(r => r.type === "consultation" && r.data.name === "공개 UI 상담 검증");
  expect(record).toBeDefined();
  expect(record?.data.lodgeId).toBe("yangyang-rose");
  expect(record?.data.planId).toBe("share-60");
  expect(record?.data.consent.required).toBe(true);
  expect(record?.data.consent.marketing).toBe(false);
  await page.reload();
  expect((await snapshot(page)).records.filter(r => r.id === record?.id)).toHaveLength(1);
  // A visitor may ask a general question before selecting any lodge, plan or village.
  await page.goto("/consult");
  await page.getByRole("textbox", { name: "이름", exact: true }).fill("공개 UI 일반 상담");
  await page.getByRole("textbox", { name: "연락수단", exact: true }).fill("qa+general@example.test");
  await expect(page.getByLabel("관심 별장", { exact: true })).toHaveValue("");
  await page.getByLabel("궁금한 내용·상담 희망 시간", { exact: false }).fill("지역과 상품을 선택하기 전 작성하는 일반 상담 검증입니다.");
  await page.getByRole("checkbox", { name: /^\[필수\]/ }).check();
  await page.getByRole("checkbox", { name: /^\[선택\]/ }).check();
  const generalRequest = page.waitForRequest(request => request.url().endsWith("/api/workspace") && request.method() === "POST" && request.postDataJSON().action === "consultation-create");
  await page.getByRole("button", { name: "상담 요청 저장", exact: true }).click();
  const submitted = (await generalRequest).postDataJSON().payload;
  expect(submitted).not.toHaveProperty("planId");
  expect(submitted).not.toHaveProperty("villageId");
  await expect(page.getByRole("heading", { name: "상담 요청을 저장했습니다.", exact: true })).toBeVisible();
  const general = (await snapshot(page)).records.find(r => r.type === "consultation" && r.data.name === "공개 UI 일반 상담");
  expect(general?.data.lodgeId).toBe("");
  expect(general?.data.planId).toBe("");
  expect(general?.data.villageId).toBe("");
  expect(general?.data.consent.required).toBe(true);
  expect(general?.data.consent.marketing).toBe(true);
});

test("saved lodges persist across navigation and reload, then can be removed", async ({ page, baseURL }) => {
  await loginAndReset(page, baseURL, "/lodges");
  const save = page.getByRole("button", { name: "민트 코스트 스위트 저장", exact: true });
  await save.click();
  await expect(page.getByRole("button", { name: "민트 코스트 스위트 저장 해제", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/saved");
  await expect(page.locator(".pub-lodge-card")).toHaveCount(1);
  await expect(page.locator(".pub-lodge-card h3")).toHaveText("민트 코스트 스위트");
  await page.reload();
  await expect(page.locator(".pub-lodge-card")).toHaveCount(1);
  await page.getByRole("button", { name: "민트 코스트 스위트 저장 해제", exact: true }).click();
  await expect(page.getByRole("heading", { name: "아직 담아 둔 공간이 없어요", exact: true })).toBeVisible();
  expect((await snapshot(page)).saved).not.toContain("jumunjin-mint");
});

test("partner and support submissions are durable preview records with their original content", async ({ page, baseURL }) => {
  await loginAndReset(page, baseURL, "/partners/apply");
  await page.getByRole("textbox", { name: "이름", exact: true }).fill("공개 UI 파트너 검증");
  await page.getByRole("textbox", { name: "연락수단", exact: true }).fill("qa+partner@example.test");
  await page.getByLabel("주요 채널", { exact: true }).selectOption("인스타그램");
  await page.getByLabel("구독자·팔로워·일 방문자 수", { exact: true }).fill("6500");
  await page.getByLabel("채널 주소", { exact: false }).fill("https://example.test/mylodge-qa");
  await page.getByLabel("채널과 활동 소개", { exact: false }).fill("공간과 휴식 이야기를 소개하는 자동 검증용 채널입니다.");
  await page.getByRole("checkbox", { name: /^\[필수\]/ }).check();
  await page.getByRole("button", { name: "파트너 지원서 저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "지원서를 저장했습니다.", exact: true })).toBeVisible();
  const partner = (await snapshot(page)).records.find(r => r.type === "partner" && r.data.name === "공개 UI 파트너 검증");
  expect(partner?.data.channel).toBe("인스타그램");
  expect(partner?.data.followers).toBe(6500);
  expect(partner?.data.url).toBe("https://example.test/mylodge-qa");
  await page.goto("/help?q=26%2C400");
  await expect(page.getByText("1박 26,400원은 실제 숙박 요금인가요?", { exact: true })).toBeVisible();
  await page.getByLabel("문의 주제", { exact: true }).selectOption("예약");
  await page.getByLabel("문의 내용", { exact: false }).fill("자동 검증용 예약 문의입니다. 실제 연락은 필요하지 않습니다.");
  await page.getByRole("button", { name: "문의 접수", exact: true }).click();
  await expect(page.getByRole("heading", { name: "문의가 접수되었습니다.", exact: true })).toBeVisible();
  const support = (await snapshot(page)).records.find(r => r.type === "support" && r.data.message === "자동 검증용 예약 문의입니다. 실제 연락은 필요하지 않습니다.");
  expect(support?.data.category).toBe("예약");
});

test("mobile style comparison and key public pages remain usable at 390 and 320 pixels", async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/styles?style=mint");
    await expect(page.locator(".pub-style-current h2")).toHaveText("민트 그린 & 화이트");
    await page.getByRole("button", { name: "스카이 블루", exact: true }).click();
    await expect(page.locator(".pub-style-current h2")).toHaveText("스카이 블루 & 화이트");
    await expect(page).toHaveURL(/style=blue/);
    await expectNoHorizontalOverflow(page);
    const checks = page.getByRole("checkbox", { name: "비교에 담기", exact: true });
    await checks.nth(0).check();
    await checks.nth(1).check();
    await page.getByRole("button", { name: "두 콘셉트 비교 (2/2)", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "두 가지 공간의 온도" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "소프트 핑크 & 크림", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    for (const path of ["/lodges", "/ownership/pricing", "/help", "/consult"]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expect.poll(async () => page.locator("main img").evaluateAll(images => images.filter(image => {
        const bounds = image.getBoundingClientRect();
        return bounds.top < innerHeight && bounds.bottom > 0;
      }).every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
      const failedImages = await page.locator("main img").evaluateAll(images => images.filter(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 0).map(image => (image as HTMLImageElement).src));
      expect(failedImages, path).toEqual([]);
    }
  }
});
