"use client";

import {KPI} from "@heroui-pro/react";

import {HOLDINGS, TOTAL_BALANCE_USD} from "../data/holdings";

// Module-level derivations — avoid recomputing per render.
const HOLDINGS_COUNT = HOLDINGS.length;
const TOP_PERFORMER = HOLDINGS.reduce((best, current) =>
  current.change24h > best.change24h ? current : best,
);
// Illustrative mocks — real apps would compute these from the price series.
const CHANGE_24H_USD = 120.18;
const CHANGE_24H_PERCENT = 2.24;
const CHANGE_7D_PERCENT = 5.32;

export function BalanceKpiStrip() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KPI>
        <KPI.Header>
          <KPI.Title>总余额</KPI.Title>
        </KPI.Header>
        <KPI.Content>
          <KPI.Value
            currency="USD"
            maximumFractionDigits={2}
            style="currency"
            value={TOTAL_BALANCE_USD}
          />
          <KPI.Trend trend="up">{`${CHANGE_7D_PERCENT}%`}</KPI.Trend>
        </KPI.Content>
      </KPI>
      <KPI>
        <KPI.Header>
          <KPI.Title>24 小时变化</KPI.Title>
        </KPI.Header>
        <KPI.Content>
          <KPI.Value
            currency="USD"
            maximumFractionDigits={2}
            style="currency"
            value={CHANGE_24H_USD}
          />
          <KPI.Trend trend="up">{`${CHANGE_24H_PERCENT}%`}</KPI.Trend>
        </KPI.Content>
      </KPI>
      <KPI>
        <KPI.Header>
          <KPI.Title>表现最佳 · {TOP_PERFORMER.ticker}</KPI.Title>
        </KPI.Header>
        <KPI.Content>
          <KPI.Value maximumFractionDigits={2} style="decimal" value={TOP_PERFORMER.change24h} />
          <KPI.Trend trend="up">{`${TOP_PERFORMER.change24h}%`}</KPI.Trend>
        </KPI.Content>
      </KPI>
      <KPI>
        <KPI.Header>
          <KPI.Title>持有资产</KPI.Title>
        </KPI.Header>
        <KPI.Content>
          <KPI.Value maximumFractionDigits={0} style="decimal" value={HOLDINGS_COUNT} />
          <KPI.Trend trend="neutral">种资产</KPI.Trend>
        </KPI.Content>
      </KPI>
    </div>
  );
}
