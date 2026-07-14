import "@/styles/globals.css";
import type {Metadata, Viewport} from "next";
import type {ReactNode} from "react";

import {TemplateNavigation} from "@/components/template-navigation";
import {TemplateToastProvider} from "@/components/template-toast-provider";
import {ThemeSwitcher} from "@/components/theme-switcher";
import {THEME_BOOTSTRAP_SCRIPT, THEME_IDS, THEME_STORAGE_KEY} from "@/lib/themes";

import {Providers} from "./providers";

export const metadata: Metadata = {
  title: "AI-CRM HeroUI 模板预览",
  description: "Dashboard、Email、Chat 与 Finances 官方模板集成预览",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "white",
};

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html
      suppressHydrationWarning
      className="bg-background text-foreground"
      data-theme="default"
      lang="zh-CN"
    >
      <head>
        <script dangerouslySetInnerHTML={{__html: THEME_BOOTSTRAP_SCRIPT}} />
      </head>
      <body className="font-sans antialiased">
        <Providers
          themeProps={{
            attribute: "data-theme",
            defaultTheme: "default",
            enableSystem: false,
            storageKey: THEME_STORAGE_KEY,
            themes: THEME_IDS,
          }}
        >
          <div className="flex h-dvh min-h-0 w-full overflow-hidden">
            <TemplateNavigation />
            <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
          </div>
          <ThemeSwitcher />
          <TemplateToastProvider />
        </Providers>
      </body>
    </html>
  );
}
