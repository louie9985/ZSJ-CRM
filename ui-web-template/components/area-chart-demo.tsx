"use client";

import {Card} from "@heroui/react";
import {AreaChart, ChartTooltip} from "@heroui-pro/react";

const data = [
  {month: "Jan", revenue: 4200},
  {month: "Feb", revenue: 5800},
  {month: "Mar", revenue: 4900},
  {month: "Apr", revenue: 7200},
  {month: "May", revenue: 6100},
  {month: "Jun", revenue: 8400},
];

export default function AreaChartDemo() {
  return (
    <Card className="w-full max-w-[520px] rounded-2xl">
      <Card.Header>
        <Card.Title className="text-base">Monthly Revenue</Card.Title>
      </Card.Header>
      <Card.Content>
        <AreaChart data={data} height={200}>
          <defs>
            <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <AreaChart.Grid vertical={false} />
          <AreaChart.XAxis dataKey="month" tickMargin={8} />
          <AreaChart.YAxis
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={40}
          />
          <AreaChart.Area
            dataKey="revenue"
            dot={false}
            fill="url(#fill)"
            name="Revenue"
            stroke="var(--chart-3)"
            strokeWidth={2}
            type="monotone"
          />
          <AreaChart.Tooltip
            content={({active, label, payload}) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltip>
                  <ChartTooltip.Header>{label}</ChartTooltip.Header>
                  {payload.map((entry) => (
                    <ChartTooltip.Item key={String(entry.dataKey)}>
                      <ChartTooltip.Indicator color={entry.color ?? entry.stroke} />
                      <ChartTooltip.Label>{entry.name}</ChartTooltip.Label>
                      <ChartTooltip.Value>
                        ${Number(entry.value).toLocaleString()}
                      </ChartTooltip.Value>
                    </ChartTooltip.Item>
                  ))}
                </ChartTooltip>
              );
            }}
          />
        </AreaChart>
      </Card.Content>
    </Card>
  );
}