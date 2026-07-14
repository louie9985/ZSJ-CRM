# HeroUI Pro - Chat Template

A conversational chat starter built with **Next.js 16** and **HeroUI Pro** components. Includes an app shell (sidebar + navbar), a dynamic thread viewer, a command-palette search dialog, and scaffolded routes for New Chat, Library, and Explore.

## Quick start

```bash
pnpm install
pnpm dev
```

The app will be available at `http://localhost:3004`.

## Pages

| Route       | What's in it                                                                |
| ----------- | --------------------------------------------------------------------------- |
| `/`         | Redirects to the default chat thread                                        |
| `/[chatId]` | Mock chat thread with messages, model selector, and composer                |
| `/new`      | Empty chat landing with suggested prompts and the composer                  |
| `/library`  | Saved prompts and reusable setups as cards that can link back into a thread |
| `/explore`  | Starter prompt categories and cards grouped by use case                     |

## Project structure

```
src/
  app/
    layout.tsx               # root html/body
    globals.css
    (app)/
      layout.tsx             # shared shell (sidebar + navbar)
      page.tsx               # redirects to the default thread
      [chatId]/page.tsx      # mock dynamic chat thread
      new/page.tsx
      library/page.tsx
      explore/page.tsx
  components/                # shell, sidebar, navbar, composer, search dialog
  data/
    chat.ts                  # mock threads, models, nav items, library/explore data
  views/
    chat-page.tsx
    new-chat-page.tsx
    library-page.tsx
    explore-page.tsx
```

## Components used

Components are imported directly from `@heroui-pro/react` and `@heroui/react`. No barrel imports, no custom wrappers.

## Prerequisites

- Node 20+
- pnpm 9+ (or swap `pnpm` for `npm`/`yarn` in the scripts)
- `@heroui-pro/react` needs to be resolvable from your package registry. If you see an install error for this package, make sure you have access to the HeroUI Pro npm registry.
