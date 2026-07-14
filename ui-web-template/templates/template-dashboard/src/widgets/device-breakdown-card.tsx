"use client";

import type {ReactNode} from "react";

import {Card} from "@heroui/react";
import {ChartTooltip, PieChart} from "@heroui-pro/react";

import {DEVICE_BREAKDOWN} from "../data/analytics";

const DEVICE_COLORS = ["var(--chart-3)", "var(--chart-2)", "var(--chart-4)"];

function formatCount(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toString();
}

interface DeviceTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    payload?: {fill?: string};
    value?: number | string;
  }>;
}

function DeviceTooltip({active, payload}: DeviceTooltipProps) {
  const entry = payload?.[0];

  if (!active || !entry) return null;

  return (
    <ChartTooltip>
      <ChartTooltip.Item>
        <ChartTooltip.Indicator color={entry.payload?.fill} />
        <ChartTooltip.Label>{entry.name}</ChartTooltip.Label>
        <ChartTooltip.Value>{formatCount(Number(entry.value))}</ChartTooltip.Value>
      </ChartTooltip.Item>
    </ChartTooltip>
  );
}

export function DeviceBreakdownCard() {
  const total = DEVICE_BREAKDOWN.reduce((sum, d) => sum + d.value, 0);
  const formattedTotal = formatCount(total);

  return (
    <Card className="h-full rounded-2xl">
      <Card.Header>
        <Card.Title className="text-base">Traffic by device</Card.Title>
        <Card.Description>How visitors are reaching your site.</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="relative">
          <PieChart height={240} width={240}>
            <PieChart.Pie
              cornerRadius={8}
              cx="50%"
              cy="50%"
              data={[...DEVICE_BREAKDOWN]}
              dataKey="value"
              innerRadius="68%"
              nameKey="name"
              paddingAngle={-12}
              strokeWidth={0}
            >
              {DEVICE_BREAKDOWN.map((_, idx) => (
                <PieChart.Cell key={idx} fill={DEVICE_COLORS[idx % DEVICE_COLORS.length]} />
              ))}
            </PieChart.Pie>
            <PieChart.Tooltip content={<DeviceTooltip />} />
          </PieChart>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-foreground text-2xl font-semibold tabular-nums">
              {formattedTotal}
            </span>
            <span className="text-muted text-xs">Sessions</span>
          </div>
        </div>
        <DeviceLegend total={total} />
      </Card.Content>
    </Card>
  );
}

function DeviceLegend({total}: {total: number}): ReactNode {
  return (
    <div className="flex w-full max-w-[240px] flex-col gap-2">
      {DEVICE_BREAKDOWN.map((entry, idx) => {
        const pct = ((entry.value / total) * 100).toFixed(0);

        return (
          <div key={entry.name} className="flex items-center gap-3">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{backgroundColor: DEVICE_COLORS[idx % DEVICE_COLORS.length]}}
            />
            <span className="text-foreground flex-1 text-sm">{entry.name}</span>
            <span className="text-foreground text-sm font-semibold tabular-nums">
              {formatCount(entry.value)}
            </span>
            <span className="text-muted w-10 text-right text-xs tabular-nums">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
