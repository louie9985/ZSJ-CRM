"use client";

import {KPI} from "@heroui-pro/react";

import {STATS_CARDS} from "../data/sales";

export function KpiRow() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STATS_CARDS.map((stat) => (
        <KPI key={stat.label}>
          <KPI.Header>
            <KPI.Title>{stat.label}</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value
              currency={stat.currency}
              maximumFractionDigits={0}
              style={stat.currency ? "currency" : "decimal"}
              value={stat.value}
            />
            <KPI.Trend trend={stat.trend}>{stat.trendValue}</KPI.Trend>
          </KPI.Content>
        </KPI>
      ))}
    </div>
  );
}
