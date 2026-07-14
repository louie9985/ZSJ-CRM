import type {ReactNode} from "react";

import {ChatShell} from "@chat/components/chat-shell";

export default function ChatLayout({children}: {children: ReactNode}) {
  return <ChatShell basePath="/chat">{children}</ChatShell>;
}
