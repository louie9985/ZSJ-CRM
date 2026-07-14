"use client";

import type {ReactNode} from "react";

import {ArrowDownToLine} from "@gravity-ui/icons";
import {Button, Card, Separator} from "@heroui/react";
import {NumberValue} from "@heroui-pro/react";

import {SPENDING_SUMMARY} from "../data/spending";

function Usd({value}: {value: number}) {
  return <NumberValue currency="USD" maximumFractionDigits={2} style="currency" value={value} />;
}

const ROWS: readonly {label: string; value: ReactNode}[] = [
  {label: "Total transactions", value: SPENDING_SUMMARY.totalTransactions.toLocaleString()},
  {label: "Largest transaction", value: <Usd value={SPENDING_SUMMARY.largestTransaction} />},
  {label: "Average transaction", value: <Usd value={SPENDING_SUMMARY.avgTransaction} />},
  {label: "Total spending", value: <Usd value={SPENDING_SUMMARY.totalSpending} />},
  {label: "First transaction", value: SPENDING_SUMMARY.firstTransaction},
  {label: "Last transaction", value: SPENDING_SUMMARY.lastTransaction},
];

export function SpendingSummaryCard() {
  return (
    <Card className="rounded-2xl">
      <Card.Header>
        <Card.Title className="text-base">Summary</Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        {ROWS.map((row, index) => (
          <div key={row.label}>
            {index > 0 ? <Separator className="mb-3" /> : null}
            <div className="flex items-center justify-between">
              <span className="text-muted text-sm">{row.label}</span>
              <span className="text-foreground text-sm font-medium tabular-nums">{row.value}</span>
            </div>
          </div>
        ))}
      </Card.Content>
      <Card.Footer>
        <Button fullWidth size="sm" variant="tertiary">
          <ArrowDownToLine className="size-4" />
          Download CSV
        </Button>
      </Card.Footer>
    </Card>
  );
}
