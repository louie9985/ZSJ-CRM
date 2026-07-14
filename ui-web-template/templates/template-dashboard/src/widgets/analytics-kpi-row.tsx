"use client";

import type {SparklinePoint} from "../data/analytics";
import type {ComponentProps} from "react";

import {KPI} from "@heroui-pro/react";

import {
  BOUNCE_SPARKLINE,
  DURATION_SPARKLINE,
  SESSIONS_SPARKLINE,
  USERS_SPARKLINE,
} from "../data/analytics";

type TrendDir = ComponentProps<typeof KPI.Trend>["trend"];

type AnalyticsKpi = {
  chartColor: string;
  chartData: readonly SparklinePoint[];
  label: string;
  /** How the value renders — currency/percent/decimal/unit. */
  numberProps: Omit<ComponentProps<typeof KPI.Value>, "children">;
  trend: TrendDir;
  trendValue: string;
};

/**
 * Seconds → human-friendly "3m 42s" helper used below.
 * Hoisted so it's a module-level pure function (`js-cache-function-results`).
 */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const ANALYTICS_KPIS: readonly AnalyticsKpi[] = [
  {
    chartColor: "var(--color-accent)",
    chartData: SESSIONS_SPARKLINE,
    label: "Sessions",
    numberProps: {maximumFractionDigits: 0, value: 84_210},
    trend: "up",
    trendValue: "14%",
  },
  {
    chartColor: "var(--color-success)",
    chartData: USERS_SPARKLINE,
    label: "Unique users",
    numberProps: {maximumFractionDigits: 0, value: 47_382},
    trend: "up",
    trendValue: "6%",
  },
  {
    chartColor: "var(--color-muted)",
    chartData: BOUNCE_SPARKLINE,
    label: "Bounce rate",
    numberProps: {maximumFractionDigits: 1, style: "percent", value: 0.413},
    // Bounce rate going down is actually good — use "neutral" so we don't
    // mis-signal a red "down" arrow for an improving metric.
    trend: "neutral",
    trendValue: "−2.1%",
  },
];

export function AnalyticsKpiRow() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {ANALYTICS_KPIS.map((kpi) => (
        <KPI key={kpi.label}>
          <KPI.Header>
            <KPI.Title>{kpi.label}</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value {...kpi.numberProps} />
            <KPI.Trend trend={kpi.trend}>{kpi.trendValue}</KPI.Trend>
          </KPI.Content>
          <KPI.Chart
            color={kpi.chartColor}
            data={[...kpi.chartData]}
            height={60}
            strokeWidth={1.5}
          />
        </KPI>
      ))}
      <DurationKpi />
    </div>
  );
}

/**
 * Duration KPI is split out because it formats its value with a custom
 * render prop (minutes + seconds), which `KPI.Value` doesn't express
 * cleanly as a plain number.
 */
function DurationKpi() {
  const avgSeconds = 222;

  return (
    <KPI>
      <KPI.Header>
        <KPI.Title>Avg. session</KPI.Title>
      </KPI.Header>
      <KPI.Content>
        <span className="text-foreground text-2xl font-semibold tabular-nums">
          {formatDuration(avgSeconds)}
        </span>
        <KPI.Trend trend="up">12%</KPI.Trend>
      </KPI.Content>
      <KPI.Chart
        color="var(--color-warning)"
        data={[...DURATION_SPARKLINE]}
        height={60}
        strokeWidth={1.5}
      />
    </KPI>
  );
}
