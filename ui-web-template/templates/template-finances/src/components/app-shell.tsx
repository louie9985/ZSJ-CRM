"use client";

import type {ReactNode} from "react";

import {AppLayout} from "@heroui-pro/react";
import {usePathname, useRouter} from "next/navigation";
import {useCallback, useMemo} from "react";

import {FOOTER_ITEMS, NAV_ITEMS} from "../nav-items";

import {FinancesNavbar} from "./finances-navbar";
import {FinancesSidebar} from "./finances-sidebar";

const HOME_GREETING = "下午好，Fred";

// One-shot lookup so every registered route maps to its label in O(1).
// Hoisted per `server-hoist-static-io` — computed once at module load.
const ROUTE_LABELS = new Map<string, string>(
  [...NAV_ITEMS, ...FOOTER_ITEMS].map((item) => [item.href, item.label]),
);

export interface AppShellProps {
  children: ReactNode;
  /**
   * Prefix used for navigation and active-state matching.
   * Empty in the standalone template; `/templates/finances` when embedded in
   * the frontend preview.
   */
  basePath?: string;
  /**
   * When true, sidebar items render without `href` so the preview iframe
   * doesn't navigate.
   */
  disableNavigation?: boolean;
}

export function AppShell({basePath = "", children, disableNavigation = false}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Primitive deps → stable callback. No-op in preview mode.
  const navigate = useCallback(
    (href: string) => {
      if (disableNavigation) return;
      const target = href === basePath || href.startsWith(`${basePath}/`) ? href : basePath + href;

      router.push(target);
    },
    [router, basePath, disableNavigation],
  );

  // Derive the navbar title from the current route during render —
  // no useState + useEffect mirror (`rerender-derived-state-no-effect`).
  const title = useMemo(() => {
    const relative = pathname.slice(basePath.length) || "/";

    if (relative === "/" || relative === "") return HOME_GREETING;

    return ROUTE_LABELS.get(relative) ?? HOME_GREETING;
  }, [pathname, basePath]);

  return (
    <AppLayout
      navbar={<FinancesNavbar title={title} />}
      navigate={navigate}
      sidebarCollapsible="offcanvas"
      sidebar={
        <FinancesSidebar
          basePath={basePath}
          disableNavigation={disableNavigation}
          pathname={pathname}
        />
      }
    >
      {children}
    </AppLayout>
  );
}
