"use client";

import {DashboardToolbar} from "../widgets/dashboard-toolbar";
import {EmployeesTable} from "../widgets/employees-table";
import {KpiRow} from "../widgets/kpi-row";
import {SalesPerformanceCard} from "../widgets/sales-performance-card";
import {TrafficSourceCard} from "../widgets/traffic-source-card";

export function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <DashboardToolbar />
      <KpiRow />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SalesPerformanceCard />
        <TrafficSourceCard />
      </div>
      <EmployeesTable />
    </div>
  );
}
