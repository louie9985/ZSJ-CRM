import type {ReactNode} from "react";

import {EmailShell} from "../../components/email-shell";

export default function AppGroupLayout({children}: {children: ReactNode}) {
  return <EmailShell>{children}</EmailShell>;
}
