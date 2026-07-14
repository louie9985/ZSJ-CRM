# HeroUI Pro — Finances Template

A multi-page crypto portfolio template built on top of
[Next.js 16](https://nextjs.org) and [HeroUI Pro](https://pro.heroui.com).

## Pages

- **Dashboard** `/` — Balance overview, portfolio chart, holdings, recent activity
- **Portfolio** `/portfolio` — All holdings with allocation and performance
- **Spending** `/spending` — Category breakdown and month-over-month spending
- **Transactions** `/transactions` — Full transaction history with filters
- **Earn** `/earn` — Staking and yield opportunities
- **Settings** `/settings` — Account preferences
- **Help** `/help` — Resource links

## Getting started

```bash
pnpm install
pnpm dev
```

The dev server runs on `http://localhost:3006`.

## Tech stack

- Next.js 16 (App Router, React Server Components)
- React 19
- Tailwind CSS v4 + HeroUI design tokens
- HeroUI Pro (`AppLayout`, `Sidebar`, `DataGrid`, `KPI`, …)
- Recharts for lightweight charts

## Layout

- `src/app/` — App Router routes (`(app)` group holds the shell + pages)
- `src/components/` — Router-aware shell pieces (Sidebar, Navbar)
- `src/data/` — Module-level mock data (`holdings`, `transactions`, etc.)
- `src/views/` — One component per page
- `src/widgets/` — Reusable building blocks (KPI strip, chart card, tables)
- `src/nav-items.ts` — Navigation registry for sidebar + active state
