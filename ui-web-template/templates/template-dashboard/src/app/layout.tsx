import type {Metadata} from "next";
import type {ReactNode} from "react";

import {Toast} from "@heroui/react";

import "./globals.css";

export const metadata: Metadata = {
  description: "A multi-page dashboard starter built with HeroUI Pro.",
  title: "HeroUI Pro - Dashboard Template",
};

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html suppressHydrationWarning className="bg-background text-foreground" lang="en">
      <body className="font-sans antialiased">
        {children}
        <Toast.Provider placement="bottom" />
      </body>
    </html>
  );
}
