import {expect, test} from "@playwright/test";

const themes = [
  {id: "default", label: "默认", stylesheetCount: 0},
  {id: "brutalism-light", label: "粗野主义", stylesheetCount: 1},
  {id: "glass-light", label: "玻璃", stylesheetCount: 1},
  {id: "mouve-light", label: "柔光紫", stylesheetCount: 1},
] as const;

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("theme-test-storage-cleared")) {
      localStorage.removeItem("ui-web-template-theme");
      sessionStorage.setItem("theme-test-storage-cleared", "true");
    }
  });
});

test("主题按钮可以切换四套主题，并且只加载当前主题样式", async ({page}) => {
  await page.goto("/dashboard");

  for (const theme of themes) {
    await page.getByRole("button", {name: "切换界面主题"}).click();
    await page.getByRole("menuitemradio", {name: theme.label}).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);
    await expect(page.locator("#heroui-theme-stylesheet")).toHaveCount(theme.stylesheetCount);
  }
});

test("主题按钮悬停显示提示，打开菜单后隐藏提示", async ({page}) => {
  await page.goto("/dashboard");

  const themeButton = page.getByRole("button", {name: "切换界面主题"});

  await themeButton.hover();
  await expect(page.getByRole("tooltip")).toHaveText("切换界面主题");

  await themeButton.click();
  await expect(page.getByRole("menuitemradio", {name: "默认"})).toBeVisible();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("刷新页面后保留选中的主题", async ({page}) => {
  await page.goto("/chat/new");
  await page.getByRole("button", {name: "切换界面主题"}).click();
  await page.getByRole("menuitemradio", {name: "玻璃"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "glass-light");

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "glass-light");
  await expect(page.locator('#heroui-theme-stylesheet[href="/themes/glass.css"]')).toHaveCount(1);
});

for (const route of ["/dashboard", "/email/inbox", "/chat", "/finances"]) {
  test(`${route} 显示全局主题按钮`, async ({page}) => {
    await page.goto(route);

    await expect(page.getByRole("button", {name: "切换界面主题"})).toBeVisible();
  });
}
