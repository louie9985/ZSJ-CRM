"use client";

import {Card} from "@heroui/react";
import {BarChart} from "@heroui-pro/react";

import {CHANNEL_BREAKDOWN} from "../data/analytics";

function formatThousands(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : `${value}`;
}

export function TopChannelsCard() {
  return (
    <Card className="h-full rounded-2xl">
      <Card.Header>
        <Card.Title className="text-base">Top channels</Card.Title>
        <Card.Description>Sessions by acquisition channel.</Card.Description>
      </Card.Header>
      <Card.Content>
        <BarChart data={[...CHANNEL_BREAKDOWN]} height={360} layout="vertical">
          <BarChart.Grid horizontal={false} />
          <BarChart.XAxis tickFormatter={formatThousands} tickMargin={4} type="number" />
          <BarChart.YAxis dataKey="channel" tickMargin={4} type="category" width={110} />
          <BarChart.Bar
            barSize={16}
            dataKey="sessions"
            fill="var(--chart-3)"
            name="Sessions"
            radius={[0, 24, 24, 0]}
          />
          <BarChart.Tooltip content={<BarChart.TooltipContent />} />
        </BarChart>
      </Card.Content>
    </Card>
  );
}
