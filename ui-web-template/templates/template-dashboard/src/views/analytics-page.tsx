"use client";

// TODO: Replace the static analytics data (src/data/analytics.ts) with a real
// analytics source (PostHog, Plausible, your warehouse, etc.) and wire the
// `Segment` control up to change the time range.

import {Segment} from "@heroui-pro/react";

import {AnalyticsKpiRow} from "../widgets/analytics-kpi-row";
import {DeviceBreakdownCard} from "../widgets/device-breakdown-card";
import {SessionsOverTimeCard} from "../widgets/sessions-over-time-card";
import {TopChannelsCard} from "../widgets/top-channels-card";
import {TopPagesCard} from "../widgets/top-pages-card";

const TIME_RANGES = ["7D", "30D", "90D", "12M"] as const;

export function AnalyticsPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted text-sm">Explore how your product is performing.</p>
        <Segment aria-label="Time range" defaultSelectedKey="30D" size="sm">
          {TIME_RANGES.map((range) => (
            <Segment.Item key={range} id={range}>
              {range}
            </Segment.Item>
          ))}
        </Segment>
      </div>

      <AnalyticsKpiRow />

      <SessionsOverTimeCard />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DeviceBreakdownCard />
        <TopChannelsCard />
      </div>

      <TopPagesCard />
    </div>
  );
}
