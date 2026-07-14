"use client";

import {Palette} from "@gravity-ui/icons";
import {Button, Dropdown, Label, Tooltip} from "@heroui/react";
import {useTheme} from "next-themes";
import {useEffect, useState} from "react";

import {
  isThemeId,
  THEME_OPTIONS,
  THEME_STYLESHEET_ID,
  THEME_STYLESHEETS,
  type ThemeId,
} from "@/lib/themes";

function syncThemeStylesheet(theme: ThemeId) {
  const currentLink = document.getElementById(THEME_STYLESHEET_ID);
  const stylesheet = THEME_STYLESHEETS[theme];

  if (!stylesheet) {
    currentLink?.remove();

    return;
  }

  const link = currentLink ?? document.createElement("link");

  link.id = THEME_STYLESHEET_ID;
  link.setAttribute("rel", "stylesheet");

  if (link.getAttribute("href") !== stylesheet) {
    link.setAttribute("href", stylesheet);
  }

  if (!link.isConnected) {
    document.head.appendChild(link);
  }
}

function ThemeSwatch({theme}: {theme: ThemeId}) {
  return (
    <span
      aria-hidden="true"
      className="border-border flex size-5 shrink-0 overflow-hidden rounded-full border"
    >
      {theme === "default" ? (
        <>
          <span className="h-full w-1/2 bg-white" />
          <span className="h-full w-1/2 bg-neutral-900" />
        </>
      ) : null}
      {theme === "brutalism-light" ? (
        <>
          <span className="h-full w-1/2 bg-yellow-300" />
          <span className="h-full w-1/2 bg-black" />
        </>
      ) : null}
      {theme === "glass-light" ? (
        <>
          <span className="h-full w-1/2 bg-sky-100" />
          <span className="h-full w-1/2 bg-blue-400/70" />
        </>
      ) : null}
      {theme === "mouve-light" ? (
        <>
          <span className="h-full w-1/2 bg-violet-200" />
          <span className="h-full w-1/2 bg-fuchsia-500" />
        </>
      ) : null}
    </span>
  );
}

export function ThemeSwitcher() {
  const {setTheme, theme} = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const activeTheme = isThemeId(theme) ? theme : "default";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted) {
      syncThemeStylesheet(activeTheme);
    }
  }, [activeTheme, isMounted]);

  const selectTheme = (key: React.Key) => {
    const nextTheme = String(key);

    if (!isThemeId(nextTheme)) {
      return;
    }

    syncThemeStylesheet(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <div
      className="fixed right-3 top-3 z-[60] size-8"
      data-testid="theme-switcher"
      onBlurCapture={() => setIsTooltipOpen(false)}
      onFocusCapture={() => setIsTooltipOpen(true)}
      onPointerEnter={() => setIsTooltipOpen(true)}
      onPointerLeave={() => setIsTooltipOpen(false)}
    >
      <Dropdown
        onOpenChange={(isOpen) => {
          setIsMenuOpen(isOpen);
          setIsTooltipOpen(false);
        }}
      >
        <Button
          isIconOnly
          aria-label="切换界面主题"
          className="bg-surface/90 shadow-surface size-8 min-w-8 backdrop-blur-md"
          isDisabled={!isMounted}
          size="sm"
          variant="ghost"
        >
          <Palette className="size-4" />
        </Button>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu
            aria-label="界面主题"
            selectedKeys={[activeTheme]}
            selectionMode="single"
            onAction={selectTheme}
          >
            {THEME_OPTIONS.map((option) => (
              <Dropdown.Item key={option.id} id={option.id} textValue={option.label}>
                <ThemeSwatch theme={option.id} />
                <Label className="flex-1">{option.label}</Label>
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      <Tooltip isOpen={isTooltipOpen && !isMenuOpen}>
        <Tooltip.Trigger
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          role="presentation"
          tabIndex={-1}
        />
        <Tooltip.Content placement="bottom">切换界面主题</Tooltip.Content>
      </Tooltip>
    </div>
  );
}
