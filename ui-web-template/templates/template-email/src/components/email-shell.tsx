"use client";

import type {ReactNode} from "react";

import {AppLayout} from "@heroui-pro/react";
import {usePathname, useRouter} from "next/navigation";
import {useCallback, useEffect, useState} from "react";

import {DEFAULT_FOLDER_ID} from "../data/email";

import {ComposeSheet} from "./compose-sheet";
import {EmailSidebar} from "./email-sidebar";

export interface EmailShellProps {
  children: ReactNode;
  basePath?: string;
  disableNavigation?: boolean;
}

export function EmailShell({basePath = "", children, disableNavigation = false}: EmailShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const navigate = useCallback(
    (href: string) => {
      if (disableNavigation) return;
      const target = href === basePath || href.startsWith(`${basePath}/`) ? href : basePath + href;

      router.push(target);
    },
    [router, basePath, disableNavigation],
  );

  // Keyboard shortcut: `C` opens compose. Skipped in preview mode and when
  // focus is inside an input/textarea so normal typing still works.
  useEffect(() => {
    if (disableNavigation) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key !== "c" && event.key !== "C") return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();

      if (tagName === "input" || tagName === "textarea" || target?.isContentEditable) return;

      event.preventDefault();
      setIsComposeOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disableNavigation]);

  return (
    <AppLayout
      navigate={navigate}
      sidebarCollapsible="offcanvas"
      sidebar={
        <EmailSidebar
          basePath={basePath}
          disableNavigation={disableNavigation}
          pathname={pathname ?? `/${DEFAULT_FOLDER_ID}`}
          onCompose={disableNavigation ? undefined : () => setIsComposeOpen(true)}
        />
      }
    >
      {children}
      <ComposeSheet isOpen={isComposeOpen} onOpenChange={setIsComposeOpen} />
    </AppLayout>
  );
}
