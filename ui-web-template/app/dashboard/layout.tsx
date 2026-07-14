import type {ReactNode} from "react";

import {AppShell} from "@dashboard/components/app-shell";

export default function DashboardLayout({children}: {children: ReactNode}) {
  return <AppShell basePath="/dashboard">{children}</AppShell>;
}
