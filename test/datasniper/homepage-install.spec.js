import { test, expect } from "@playwright/test";

const OPTIONS = [
  ["For Google Sheets", "Chrome add-on — free"],
  ["For Excel on Mac", "macOS app — free"],
  ["DataSniper", "Excel add-in — free"],
];

async function expectMenuInsideViewport(page, menu) {
  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  for (const [label, sub] of OPTIONS) {
    await expect(menu).toContainText(label);
    await expect(menu).toContainText(sub);
  }
  const snip = menu.locator("a", { hasText: "DataSniper" });
  await expect(snip).toHaveAttribute("href", "/datasniper/");
}

test("header and hero install menus list DataSniper", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const headerBtn = page.locator("header button.x-cta");
  await expect(headerBtn).toHaveText("Install now");
  await headerBtn.click();
  const headerMenu = page.locator("body > .m-install-menu");
  await expect(headerMenu).toBeVisible();
  await expectMenuInsideViewport(page, headerMenu);
  await page.screenshot({ path: "/opt/cursor/artifacts/install-dropdown/desktop-header-open.png" });

  await page.keyboard.press("Escape");
  await expect(headerMenu).toBeHidden();

  await headerBtn.click();
  await page.locator("h1").click();
  await expect(headerMenu).toBeHidden();

  await headerBtn.focus();
  await page.keyboard.press("ArrowDown");
  await expect(headerMenu.locator("a").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(headerBtn).toBeFocused();

  await page.locator("#installBtn").click();
  const heroMenu = page.locator("#installMenu");
  await expect(heroMenu).toBeVisible();
  await expectMenuInsideViewport(page, heroMenu);
  await page.screenshot({ path: "/opt/cursor/artifacts/install-dropdown/desktop-hero-open.png" });
});

test("header menu stays on screen at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pricing.html");
  const headerBtn = page.locator("header button.x-cta");
  await expect(headerBtn).toHaveText("Install now");
  await headerBtn.click();
  const headerMenu = page.locator("body > .m-install-menu");
  await expect(headerMenu).toBeVisible();
  await expectMenuInsideViewport(page, headerMenu);
  const btnBox = await headerBtn.boundingBox();
  const menuBox = await headerMenu.boundingBox();
  expect(Math.abs(btnBox.x + btnBox.width - (menuBox.x + menuBox.width))).toBeLessThan(2);
  await page.screenshot({ path: "/opt/cursor/artifacts/install-dropdown/mobile-header-open.png" });

  await page.keyboard.press("Escape");
  await expect(headerMenu).toBeHidden();
});

test("demo card shows a first frame before the video plays", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes(".mp4") || url.includes(".webm")) return route.abort();
    return route.continue();
  });
  await page.goto("/");
  const poster = page.locator(".m-poster");
  await expect(poster).toBeVisible();
  const box = await poster.boundingBox();
  expect(box.height).toBeGreaterThan(80);
  await expect(page.locator(".m-stage")).not.toHaveClass(/is-playing/);
  await page.screenshot({ path: "/opt/cursor/artifacts/install-dropdown/mobile-demo-poster.png" });
});
