export const THEME_STORAGE_KEY = "ui-web-template-theme";
export const THEME_STYLESHEET_ID = "heroui-theme-stylesheet";

export const THEME_OPTIONS = [
  {id: "default", label: "默认", stylesheet: null},
  {id: "brutalism-light", label: "粗野主义", stylesheet: "/themes/brutalism.css"},
  {id: "glass-light", label: "玻璃", stylesheet: "/themes/glass.css"},
  {id: "mouve-light", label: "柔光紫", stylesheet: "/themes/mouve.css"},
] as const;

export type ThemeId = (typeof THEME_OPTIONS)[number]["id"];

export const THEME_IDS = THEME_OPTIONS.map(({id}) => id);

export const THEME_STYLESHEETS = Object.fromEntries(
  THEME_OPTIONS.map(({id, stylesheet}) => [id, stylesheet]),
) as Record<ThemeId, string | null>;

export function isThemeId(value: string | undefined): value is ThemeId {
  return THEME_IDS.some((theme) => theme === value);
}

export const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
    var stylesheetId = ${JSON.stringify(THEME_STYLESHEET_ID)};
    var stylesheets = ${JSON.stringify(THEME_STYLESHEETS)};
    var storedTheme = localStorage.getItem(storageKey);
    var theme = Object.prototype.hasOwnProperty.call(stylesheets, storedTheme) ? storedTheme : "default";
    document.documentElement.setAttribute("data-theme", theme);
    var stylesheet = stylesheets[theme];
    if (stylesheet) {
      var link = document.createElement("link");
      link.id = stylesheetId;
      link.rel = "stylesheet";
      link.href = stylesheet;
      document.head.appendChild(link);
    }
  } catch (_) {}
})();
`;
