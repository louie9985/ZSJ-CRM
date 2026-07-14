"use client";

import type {ReactNode} from "react";

import {Card} from "@heroui/react";
import {ChartTooltip, NumberValue, PieChart} from "@heroui-pro/react";

import {SPENDING_CATEGORIES, TOTAL_SPENT} from "../data/spending";

const PIE_DATA = SPENDING_CATEGORIES.map((cat) => ({
  chartVar: cat.chartVar,
  name: cat.label,
  value: cat.spent,
}));

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    payload?: {fill?: string};
    value?: number | string;
  }>;
  valueFormatter?: (value: number | string) => ReactNode;
}

function SpendingTooltip({active, payload}: PieTooltipProps) {
  const entry = payload?.[0];

  if (!active || !entry) return null;

  return (
    <ChartTooltip>
      <ChartTooltip.Item>
        <ChartTooltip.Indicator color={entry.payload?.fill} />
        <ChartTooltip.Label>{entry.name}</ChartTooltip.Label>
        <ChartTooltip.Value>
          {typeof entry.value === "number" ? (
            <NumberValue
              currency="USD"
              maximumFractionDigits={2}
              style="currency"
              value={entry.value}
            />
          ) : (
            entry.value
          )}
        </ChartTooltip.Value>
      </ChartTooltip.Item>
    </ChartTooltip>
  );
}

export function SpendingByCategoryCard() {
  return (
    <Card className="rounded-2xl">
      <Card.Header>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted text-xs uppercase tracking-wide">Spending by category</span>
          <Card.Title className="text-lg">All time</Card.Title>
        </div>
      </Card.Header>
      <Card.Content className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="relative size-[200px] shrink-0">
            <PieChart height={200} width={200}>
              <PieChart.Pie
                cornerRadius={10}
                cx="50%"
                cy="50%"
                data={PIE_DATA}
                dataKey="value"
                innerRadius="65%"
                nameKey="name"
                paddingAngle={-16}
                strokeWidth={0}
              >
                {PIE_DATA.map((entry, idx) => (
                  <PieChart.Cell key={idx} fill={entry.chartVar} />
                ))}
              </PieChart.Pie>
              <PieChart.Tooltip content={<SpendingTooltip />} />
            </PieChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <NumberValue
                className="text-foreground text-xl font-bold tabular-nums"
                currency="USD"
                maximumFractionDigits={2}
                style="currency"
                value={TOTAL_SPENT}
              />
              <span className="text-muted text-xs">Total</span>
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {SPENDING_CATEGORIES.map((cat) => {
              const percent = ((cat.spent / TOTAL_SPENT) * 100).toFixed(1);

              return (
                <div key={cat.id} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 size-2.5 shrink-0 rounded-full"
                    style={{backgroundColor: cat.chartVar}}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-foreground truncate text-sm font-medium">
                      {cat.label}
                    </span>
                    <span className="text-muted text-xs tabular-nums">
                      <NumberValue
                        currency="USD"
                        maximumFractionDigits={2}
                        style="currency"
                        value={cat.spent}
                      />{" "}
                      ({percent}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}
