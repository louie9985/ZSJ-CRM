import {expect, test} from "@playwright/test";

const cases = [
  {expected: "/dashboard/orders", start: "/dashboard"},
  {expected: "/email/starred", start: "/email/inbox"},
  {expected: "/chat/new", start: "/chat"},
  {expected: "/finances/portfolio", start: "/finances"},
] as const;

for (const {expected, start} of cases) {
  test(`${start} 的内部导航不会重复添加模板前缀`, async ({page}) => {
    await page.goto(start);

    const menuItem = page.locator(`[data-href="${expected}"]`).first();

    await menuItem.locator('[data-slot="sidebar-menu-item-content"]').click();

    await expect(page).toHaveURL(expected);
  });
}
