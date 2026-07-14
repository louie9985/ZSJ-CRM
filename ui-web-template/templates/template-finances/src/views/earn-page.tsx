"use client";

import {KPI} from "@heroui-pro/react";

import {EARN_OPPORTUNITIES} from "../data/earn";
import {EarnTable} from "../widgets/earn-table";

// Module-level derivations
const AVG_APY =
  EARN_OPPORTUNITIES.reduce((sum, item) => sum + item.apy, 0) / EARN_OPPORTUNITIES.length;
const MAX_APY = Math.max(...EARN_OPPORTUNITIES.map((item) => item.apy));
const OPP_COUNT = EARN_OPPORTUNITIES.length;

export function EarnPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KPI>
          <KPI.Header>
            <KPI.Title>Opportunities</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value maximumFractionDigits={0} style="decimal" value={OPP_COUNT} />
            <KPI.Trend trend="neutral">Active</KPI.Trend>
          </KPI.Content>
        </KPI>
        <KPI>
          <KPI.Header>
            <KPI.Title>Average APY</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value maximumFractionDigits={2} style="decimal" value={AVG_APY} />
            <KPI.Trend trend="up">{`${AVG_APY.toFixed(2)}%`}</KPI.Trend>
          </KPI.Content>
        </KPI>
        <KPI>
          <KPI.Header>
            <KPI.Title>Top APY</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value maximumFractionDigits={2} style="decimal" value={MAX_APY} />
            <KPI.Trend trend="up">{`${MAX_APY.toFixed(2)}%`}</KPI.Trend>
          </KPI.Content>
        </KPI>
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-foreground text-base font-semibold">Earn opportunities</h2>
        <EarnTable />
      </div>
    </div>
  );
}
