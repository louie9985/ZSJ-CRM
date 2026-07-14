import type {ReactNode} from "react";

import {AppShell} from "@finances/components/app-shell";

export default function FinancesLayout({children}: {children: ReactNode}) {
  return <AppShell basePath="/finances">{children}</AppShell>;
}
