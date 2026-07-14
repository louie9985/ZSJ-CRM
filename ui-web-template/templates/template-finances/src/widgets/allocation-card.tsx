"use client";

import {Card} from "@heroui/react";
import {NumberValue} from "@heroui-pro/react";
import {useMemo} from "react";

import {HOLDINGS, TOTAL_BALANCE_USD} from "../data/holdings";

type AllocationRow = {
  id: string;
  ticker: string;
  color: string;
  usd: number;
  percent: number;
};

export function AllocationCard() {
  const allocations = useMemo<readonly AllocationRow[]>(() => {
    return HOLDINGS.map((holding) => ({
      color: holding.color,
      id: holding.id,
      percent: (holding.usd / TOTAL_BALANCE_USD) * 100,
      ticker: holding.ticker,
      usd: holding.usd,
    }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 6);
  }, []);

  return (
    <Card className="rounded-2xl">
      <Card.Header>
        <Card.Title className="text-base">Allocation</Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <div
          aria-label="Portfolio allocation"
          className="bg-surface-secondary flex h-3 w-full overflow-hidden rounded-full"
          role="img"
        >
          {allocations.map((row) => (
            <span
              key={row.id}
              aria-label={`${row.ticker} ${row.percent.toFixed(1)}%`}
              className={`${row.color} h-full`}
              style={{width: `${row.percent}%`}}
            />
          ))}
        </div>
        <ul className="flex flex-col gap-2">
          {allocations.map((row) => (
            <li key={row.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${row.color}`} />
                <span className="text-foreground font-medium">{row.ticker}</span>
              </div>
              <div className="flex items-baseline gap-3 tabular-nums">
                <span className="text-muted text-xs">{row.percent.toFixed(1)}%</span>
                <NumberValue
                  className="text-foreground text-sm font-medium"
                  currency="USD"
                  maximumFractionDigits={2}
                  style="currency"
                  value={row.usd}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card>
  );
}
