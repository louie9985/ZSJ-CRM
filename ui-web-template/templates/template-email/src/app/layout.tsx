import type {Metadata} from "next";
import type {ReactNode} from "react";

import "./globals.css";

export const metadata: Metadata = {
  description: "A responsive email client starter built with HeroUI Pro.",
  title: "HeroUI Pro - Email Template",
};

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html suppressHydrationWarning className="bg-background text-foreground" lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
