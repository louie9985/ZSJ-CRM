"use client";

import {EllipsisVertical} from "@gravity-ui/icons";
import {Card} from "@heroui/react";
import {LineChart} from "@heroui-pro/react";

import {IconButton} from "../components/icon-button";
import {TRAFFIC_DATA} from "../data/traffic";

const Y_TICKS = [0, 5000, 10000, 20000];

function formatYTick(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : `${value}`;
}

export function TrafficSourceCard() {
  return (
    <Card className="rounded-2xl">
      <Card.Header className="flex-row items-center justify-between">
        <Card.Title className="text-base">流量来源</Card.Title>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <LegendDot color="var(--chart-2)" label="自然流量" />
            <LegendDot color="var(--chart-4)" label="付费广告" />
          </div>
          <IconButton label="更多选项" size="sm" variant="tertiary">
            <EllipsisVertical className="size-4" />
          </IconButton>
        </div>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <div className="flex flex-col">
          <span className="text-foreground text-lg font-semibold tabular-nums">231,856</span>
          <span className="text-muted text-xs">访问次数</span>
        </div>
        <LineChart data={[...TRAFFIC_DATA]} height={180}>
          <LineChart.Grid vertical={false} />
          <LineChart.XAxis dataKey="month" tickMargin={8} />
          <LineChart.YAxis tickFormatter={formatYTick} ticks={Y_TICKS} width={30} />
          <LineChart.Line
            dataKey="organic"
            dot={false}
            name="自然流量"
            stroke="var(--chart-2)"
            strokeWidth={2}
            type="linear"
          />
          <LineChart.Line
            dataKey="paidAds"
            dot={false}
            name="付费广告"
            stroke="var(--chart-4)"
            strokeWidth={2}
            type="linear"
          />
          <LineChart.Tooltip content={<LineChart.TooltipContent />} />
        </LineChart>
      </Card.Content>
    </Card>
  );
}

function LegendDot({color, label}: {color: string; label: string}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-3 rounded-full" style={{backgroundColor: color}} />
      <span className="text-muted text-xs">{label}</span>
    </div>
  );
}
