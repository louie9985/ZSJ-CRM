import type {ComponentType} from "react";

import {ArrowDownToLine, ArrowsRotateLeft, FileText, PaperPlane} from "@gravity-ui/icons";

export type TransactionType = "sent" | "received" | "swapped" | "contract";

export type Transaction = {
  readonly id: string;
  readonly type: TransactionType;
  readonly typeLabel: string;
  readonly typeIcon: ComponentType<{className?: string}>;
  readonly asset: string;
  readonly assetAvatar: string;
  readonly assetColor: string;
  readonly amount: string;
  readonly usdValue: string;
  readonly usd: number;
  readonly date: string;
  /** Unix timestamp for sort. */
  readonly timestamp: number;
  readonly hash: string;
  readonly status: "confirmed" | "pending" | "failed";
};

const CDN = "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/templates/finances";

const ICON_BY_TYPE: Readonly<Record<TransactionType, ComponentType<{className?: string}>>> = {
  contract: FileText,
  received: ArrowDownToLine,
  sent: PaperPlane,
  swapped: ArrowsRotateLeft,
};

const LABEL_BY_TYPE: Readonly<Record<TransactionType, string>> = {
  contract: "合约交互",
  received: "已收款",
  sent: "已转账",
  swapped: "已兑换",
};

type TransactionInput = Omit<Transaction, "typeIcon" | "typeLabel">;

const RAW_TRANSACTIONS: readonly TransactionInput[] = [
  {
    amount: "0.12312453",
    asset: "ETH",
    assetAvatar: `${CDN}/eth.png`,
    assetColor: "bg-[#627EEA]",
    date: "2025 年 12 月 8 日 · 下午 12:32",
    hash: "0xaa2bf905d3…",
    id: "tx-1",
    status: "confirmed",
    timestamp: 1765221120000,
    type: "contract",
    usd: 320.65,
    usdValue: "$320.65",
  },
  {
    amount: "500.00",
    asset: "USDC",
    assetAvatar: `${CDN}/usdc.png`,
    assetColor: "bg-[#2775CA]",
    date: "2025 年 12 月 7 日 · 上午 11:43",
    hash: "0xbb4e0d712f…",
    id: "tx-2",
    status: "confirmed",
    timestamp: 1765131780000,
    type: "received",
    usd: 500,
    usdValue: "$500.00",
  },
  {
    amount: "1.42",
    asset: "ETH",
    assetAvatar: `${CDN}/eth.png`,
    assetColor: "bg-[#627EEA]",
    date: "2025 年 11 月 28 日 · 上午 08:14",
    hash: "0xcc1a2f4e39…",
    id: "tx-3",
    status: "confirmed",
    timestamp: 1764317640000,
    type: "sent",
    usd: 3384.1,
    usdValue: "$3,384.10",
  },
  {
    amount: "0.1543",
    asset: "BTC",
    assetAvatar: `${CDN}/btc.png`,
    assetColor: "bg-[#F7931A]",
    date: "2025 年 10 月 5 日 · 下午 06:21",
    hash: "0xdd6b5a1635…",
    id: "tx-4",
    status: "confirmed",
    timestamp: 1759694460000,
    type: "swapped",
    usd: 9385.22,
    usdValue: "$9,385.22",
  },
  {
    amount: "12.4",
    asset: "SOL",
    assetAvatar: `${CDN}/solana.png`,
    assetColor: "bg-[#9945FF]",
    date: "2025 年 10 月 2 日 · 下午 02:12",
    hash: "0xee7c6f5410…",
    id: "tx-5",
    status: "confirmed",
    timestamp: 1759414320000,
    type: "received",
    usd: 2692.16,
    usdValue: "$2,692.16",
  },
  {
    amount: "850.00",
    asset: "USDC",
    assetAvatar: `${CDN}/usdc.png`,
    assetColor: "bg-[#2775CA]",
    date: "2025 年 9 月 29 日 · 上午 09:54",
    hash: "0xff9d0a7102…",
    id: "tx-6",
    status: "confirmed",
    timestamp: 1759139640000,
    type: "sent",
    usd: 850,
    usdValue: "$850.00",
  },
  {
    amount: "0.812",
    asset: "BNB",
    assetAvatar: `${CDN}/bnb.png`,
    assetColor: "bg-[#F3BA2F]",
    date: "2025 年 9 月 21 日 · 上午 11:06",
    hash: "0x124d5e817b…",
    id: "tx-7",
    status: "confirmed",
    timestamp: 1758452760000,
    type: "swapped",
    usd: 653.4,
    usdValue: "$653.40",
  },
  {
    amount: "40.00",
    asset: "LINK",
    assetAvatar: `${CDN}/link.png`,
    assetColor: "bg-[#2A5ADA]",
    date: "2025 年 9 月 18 日 · 下午 05:38",
    hash: "0x329a4b1d2e…",
    id: "tx-8",
    status: "pending",
    timestamp: 1758216480000,
    type: "contract",
    usd: 558,
    usdValue: "$558.00",
  },
] as const;

export const TRANSACTIONS: readonly Transaction[] = RAW_TRANSACTIONS.map((tx) => ({
  ...tx,
  typeIcon: ICON_BY_TYPE[tx.type],
  typeLabel: LABEL_BY_TYPE[tx.type],
}));
