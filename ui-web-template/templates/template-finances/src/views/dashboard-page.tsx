import {BalanceKpiStrip} from "../widgets/balance-kpi-strip";
import {HoldingsList} from "../widgets/holdings-list";
import {PortfolioChartCard} from "../widgets/portfolio-chart-card";
import {RecentActivityTable} from "../widgets/recent-activity-table";

export function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <BalanceKpiStrip />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <PortfolioChartCard />
        <HoldingsList limit={5} />
      </div>
      <RecentActivityTable limit={6} />
    </div>
  );
}
