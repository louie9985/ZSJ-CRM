"use client";

import type {Holding} from "../data/holdings";

import {Avatar, Button, Card, Chip} from "@heroui/react";
import {TrendChip} from "@heroui-pro/react";
import {Line, LineChart, ResponsiveContainer, YAxis} from "recharts";

import {HOLDINGS} from "../data/holdings";

export interface HoldingsListProps {
  /** Optional footer action — defaults to a "See all" button. */
  footerLabel?: string;
  /** Cap the visible rows (defaults to all). */
  limit?: number;
}

export function HoldingsList({footerLabel = "查看全部持仓", limit}: HoldingsListProps) {
  const visible = limit != null ? HOLDINGS.slice(0, limit) : HOLDINGS;

  return (
    <Card className="rounded-none p-0" variant="transparent">
      <Card.Header className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Card.Title className="text-base">持有资产</Card.Title>
          <Chip size="sm" variant="soft">
            {HOLDINGS.length}
          </Chip>
        </div>
      </Card.Header>
      <Card.Content className="flex flex-col gap-0.5">
        {visible.map((holding) => (
          <HoldingRow key={holding.id} holding={holding} />
        ))}
      </Card.Content>
      <Card.Footer>
        <Button fullWidth size="sm" variant="tertiary">
          {footerLabel}
        </Button>
      </Card.Footer>
    </Card>
  );
}

function HoldingRow({holding}: {holding: Holding}) {
  const trend = holding.change24h > 0 ? "up" : holding.change24h < 0 ? "down" : "neutral";
  const stroke =
    trend === "up" ? "var(--success)" : trend === "down" ? "var(--danger)" : "var(--muted)";
  // Tight y-domain so each sparkline fills its own 8px × 64px box — without
  // this, Recharts squashes the line when the series min/max are close.
  const min = Math.min(...holding.spark);
  const max = Math.max(...holding.spark);
  const pad = Math.max((max - min) * 0.2, 0.001);
  const data = holding.spark.map((value) => ({value}));

  return (
    <div className="hover:bg-surface/60 flex items-center justify-between rounded-lg p-2 transition-colors">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-8 shrink-0">
          <Avatar.Image alt={holding.name} src={holding.avatar} />
          <Avatar.Fallback className={holding.color}>{holding.ticker[0]}</Avatar.Fallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="text-foreground truncate text-sm font-medium">{holding.ticker}</span>
          <span className="text-muted truncate text-xs">{holding.name}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-8 w-16 shrink-0">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={data} margin={{bottom: 1, left: 0, right: 0, top: 1}}>
              <YAxis hide domain={[min - pad, max + pad]} />
              <Line
                dataKey="value"
                dot={false}
                isAnimationActive={false}
                stroke={stroke}
                strokeWidth={1.5}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-foreground text-sm font-medium tabular-nums">{holding.value}</span>
          <TrendChip className="bg-transparent px-0 text-xs" trend={trend}>
            {`${holding.change24h >= 0 ? "+" : ""}${holding.change24h.toFixed(2)}%`}
          </TrendChip>
        </div>
      </div>
    </div>
  );
}
