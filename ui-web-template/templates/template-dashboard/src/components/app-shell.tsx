"use client";

import type {ReactNode} from "react";

import {AppLayout} from "@heroui-pro/react";
import {usePathname, useRouter} from "next/navigation";
import {useCallback, useMemo} from "react";

import {FOOTER_ITEMS, NAV_ITEMS} from "../nav-items";

import {DashboardNavbar} from "./dashboard-navbar";
import {DashboardSidebar} from "./dashboard-sidebar";

const HOME_GREETING = "早上好，Kate";

// Combined lookup so every registered route maps to its label in O(1).
// Hoisted per `server-hoist-static-io` — computed once at module load.
const ROUTE_LABELS = new Map<string, string>(
  [...NAV_ITEMS, ...FOOTER_ITEMS].map((item) => [item.href, item.label]),
);

export interface AppShellProps {
  children: ReactNode;
  /**
   * Prefix used for navigation and active-state matching.
   * Empty in the standalone template; `/templates/dashboard` when embedded in the frontend preview.
   */
  basePath?: string;
}

export function AppShell({basePath = "", children}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Primitive dep (basePath) + stable `router` ref → stable callback.
  const navigate = useCallback(
    (href: string) => {
      const target = href === basePath || href.startsWith(`${basePath}/`) ? href : basePath + href;

      router.push(target);
    },
    [router, basePath],
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
      navbar={<DashboardNavbar title={title} />}
      navigate={navigate}
      sidebar={<DashboardSidebar basePath={basePath} pathname={pathname} />}
      sidebarCollapsible="offcanvas"
    >
      {children}
    </AppLayout>
  );
}
