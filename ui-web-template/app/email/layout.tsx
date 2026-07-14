import type {ReactNode} from "react";

import {EmailShell} from "@email/components/email-shell";

export default function EmailLayout({children}: {children: ReactNode}) {
  return <EmailShell basePath="/email">{children}</EmailShell>;
}
