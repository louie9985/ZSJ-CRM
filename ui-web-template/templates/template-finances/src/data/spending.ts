import type {ComponentType} from "react";

import {House, Mug, Plane, ShoppingBag, Ticket} from "@gravity-ui/icons";

export type SpendingCategory = {
  readonly id: string;
  readonly label: string;
  readonly icon: ComponentType<{className?: string}>;
  /** Tailwind foreground class applied to the icon. */
  readonly tone: string;
  /** Tailwind background class used for the progress fill & pill. */
  readonly fill: string;
  /** Raw hex color (legacy, unused when chartVar is set). */
  readonly hex: string;
  /** CSS variable reference for Recharts fills (e.g. `"var(--chart-1)"`). */
  readonly chartVar: string;
  /** USD spent this month. */
  readonly spent: number;
  /** Monthly budget for the category. */
  readonly budget: number;
};

/**
 * Five categories — one per `--chart-N` design token so each slice gets a
 * unique chart color without needing arbitrary hex overrides.
 */
export const SPENDING_CATEGORIES: readonly SpendingCategory[] = [
  {
    budget: 2400,
    chartVar: "var(--chart-1)",
    fill: "bg-[var(--chart-1)]",
    hex: "",
    icon: House,
    id: "housing",
    label: "Housing",
    spent: 1840,
    tone: "text-[var(--chart-1)]",
  },
  {
    budget: 900,
    chartVar: "var(--chart-2)",
    fill: "bg-[var(--chart-2)]",
    hex: "",
    icon: Mug,
    id: "food",
    label: "Food & Drinks",
    spent: 612,
    tone: "text-[var(--chart-2)]",
  },
  {
    budget: 450,
    chartVar: "var(--chart-3)",
    fill: "bg-[var(--chart-3)]",
    hex: "",
    icon: ShoppingBag,
    id: "shopping",
    label: "Shopping",
    spent: 380,
    tone: "text-[var(--chart-3)]",
  },
  {
    budget: 1200,
    chartVar: "var(--chart-4)",
    fill: "bg-[var(--chart-4)]",
    hex: "",
    icon: Plane,
    id: "travel",
    label: "Travel",
    spent: 240,
    tone: "text-[var(--chart-4)]",
  },
  {
    budget: 600,
    chartVar: "var(--chart-5)",
    fill: "bg-[var(--chart-5)]",
    hex: "",
    icon: Ticket,
    id: "entertainment",
    label: "Entertainment",
    spent: 525,
    tone: "text-[var(--chart-5)]",
  },
];

export const TOTAL_SPENT = SPENDING_CATEGORIES.reduce((sum, cat) => sum + cat.spent, 0);
export const TOTAL_BUDGET = SPENDING_CATEGORIES.reduce((sum, cat) => sum + cat.budget, 0);

/** 6-month spending totals for the trend card. */
export const MONTHLY_SPENDING: readonly {month: string; spent: number}[] = [
  {month: "Jul", spent: 3210},
  {month: "Aug", spent: 2980},
  {month: "Sep", spent: 3450},
  {month: "Oct", spent: 3120},
  {month: "Nov", spent: 3380},
  {month: "Dec", spent: 3597},
];

/** Individual spending transactions grouped by date. */
export type SpendingTransaction = {
  readonly id: string;
  readonly merchant: string;
  readonly categoryId: string;
  readonly account: string;
  readonly amount: number;
  readonly date: string;
  readonly dateGroup: string;
};

export const SPENDING_TRANSACTIONS: readonly SpendingTransaction[] = [
  {
    account: "Checking (...4821)",
    amount: 1840,
    categoryId: "housing",
    date: "Dec 1, 2025",
    dateGroup: "December 1, 2025",
    id: "sp-1",
    merchant: "Rent payment",
  },
  {
    account: "Credit (...7392)",
    amount: 86.42,
    categoryId: "food",
    date: "Dec 5, 2025",
    dateGroup: "December 5, 2025",
    id: "sp-2",
    merchant: "Whole Foods",
  },
  {
    account: "Credit (...7392)",
    amount: 124.9,
    categoryId: "shopping",
    date: "Dec 5, 2025",
    dateGroup: "December 5, 2025",
    id: "sp-3",
    merchant: "Amazon",
  },
  {
    account: "Credit (...7392)",
    amount: 14.99,
    categoryId: "entertainment",
    date: "Dec 5, 2025",
    dateGroup: "December 5, 2025",
    id: "sp-4",
    merchant: "Netflix",
  },
  {
    account: "Credit (...7392)",
    amount: 38.5,
    categoryId: "food",
    date: "Dec 8, 2025",
    dateGroup: "December 8, 2025",
    id: "sp-5",
    merchant: "DoorDash",
  },
  {
    account: "Credit (...7392)",
    amount: 255.1,
    categoryId: "shopping",
    date: "Dec 10, 2025",
    dateGroup: "December 10, 2025",
    id: "sp-6",
    merchant: "Apple Store",
  },
  {
    account: "Checking (...4821)",
    amount: 240,
    categoryId: "travel",
    date: "Dec 12, 2025",
    dateGroup: "December 12, 2025",
    id: "sp-7",
    merchant: "United Airlines",
  },
  {
    account: "Credit (...7392)",
    amount: 52.8,
    categoryId: "food",
    date: "Dec 12, 2025",
    dateGroup: "December 12, 2025",
    id: "sp-8",
    merchant: "Uber Eats",
  },
  {
    account: "Credit (...7392)",
    amount: 170.01,
    categoryId: "entertainment",
    date: "Dec 14, 2025",
    dateGroup: "December 14, 2025",
    id: "sp-9",
    merchant: "Ticketmaster",
  },
  {
    account: "Credit (...7392)",
    amount: 434.28,
    categoryId: "food",
    date: "Dec 15, 2025",
    dateGroup: "December 15, 2025",
    id: "sp-10",
    merchant: "Costco",
  },
  {
    account: "Credit (...7392)",
    amount: 340,
    categoryId: "entertainment",
    date: "Dec 15, 2025",
    dateGroup: "December 15, 2025",
    id: "sp-11",
    merchant: "StubHub",
  },
] as const;

/** Summary stats — computed once at module load. */
export const SPENDING_SUMMARY = {
  avgTransaction: TOTAL_SPENT / SPENDING_TRANSACTIONS.length,
  firstTransaction: SPENDING_TRANSACTIONS[0]?.date ?? "—",
  largestTransaction: Math.max(...SPENDING_TRANSACTIONS.map((tx) => tx.amount)),
  lastTransaction: SPENDING_TRANSACTIONS[SPENDING_TRANSACTIONS.length - 1]?.date ?? "—",
  totalSpending: TOTAL_SPENT,
  totalTransactions: SPENDING_TRANSACTIONS.length,
};

/** Lookup category by id. */
export function getSpendingCategory(categoryId: string): SpendingCategory | undefined {
  return SPENDING_CATEGORIES.find((cat) => cat.id === categoryId);
}
