# HeroUI Pro - Email Template

A responsive email client starter built with **Next.js 16** and **HeroUI Pro** components. Includes an app shell (sidebar + navbar), folder list, thread list, thread detail, a composer Sheet, and a Command palette search.

## Quick start

```bash
pnpm install
pnpm dev
```

The app will be available at `http://localhost:3005`.

## Pages

| Route                 | What's in it                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `/`                   | Redirects to `/inbox`                                            |
| `/[folder]`           | Folder with email list; empty detail pane on desktop             |
| `/[folder]/[emailId]` | Email list on desktop, detail pane rendering the selected thread |

Folders supported: `inbox`, `starred`, `sent`, `drafts`, `snoozed`, `archive`, `spam`, `trash`.

## Project structure

```
src/
  app/
    layout.tsx                 # root html/body
    globals.css
    (app)/
      layout.tsx               # shared shell (sidebar + navbar)
      page.tsx                 # redirects to /inbox
      [folder]/
        layout.tsx             # responsive list + children split
        page.tsx               # empty-state when no email is open
        [emailId]/page.tsx     # email detail
  components/                  # shell, navbar, sidebar, list, detail, compose, search
  data/
    email.ts                   # folders, labels, threads, mock messages
```

## Responsive behavior

- **Desktop (`md+`)**: sidebar + list (≈360px) + detail (flex).
- **Tablet**: same 2-column list/detail layout inside main, sidebar offcanvas.
- **Mobile**: only list or only detail is visible based on the current route. Sidebar collapses into the HeroUI mobile sheet.

## Prerequisites

- Node 20+
- pnpm 9+ (or swap `pnpm` for `npm`/`yarn` in the scripts)
- `@heroui-pro/react` needs to be resolvable from your package registry. If you see an install error for this package, make sure you have access to the HeroUI Pro npm registry.
