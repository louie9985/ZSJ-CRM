export type SalesPoint = {
  month: string;
  sales: number;
};

export const SALES_CHART_DATA: readonly SalesPoint[] = [
  {month: "01", sales: 30},
  {month: "02", sales: 53},
  {month: "03", sales: 35},
  {month: "04", sales: 17},
  {month: "05", sales: 44},
  {month: "06", sales: 24},
  {month: "07", sales: 26},
  {month: "08", sales: 31},
  {month: "09", sales: 10},
  {month: "10", sales: 44},
  {month: "11", sales: 38},
  {month: "12", sales: 32},
];

export type StatsCard = {
  currency?: string;
  label: string;
  trend: "down" | "up";
  trendValue: string;
  value: number;
};

export const STATS_CARDS: readonly StatsCard[] = [
  {currency: "USD", label: "营收", trend: "up", trendValue: "3.3%", value: 228441},
  {currency: "USD", label: "支出", trend: "down", trendValue: "3.3%", value: 25108},
  {label: "销量", trend: "up", trendValue: "3.3%", value: 458},
  {currency: "USD", label: "利润", trend: "up", trendValue: "4.1%", value: 203133},
];

export type MiniKpi = {
  currency?: string;
  label: string;
  value: number;
};

export const SALES_MINI_KPIS: readonly MiniKpi[] = [
  {currency: "USD", label: "周销售额", value: 28441},
  {currency: "USD", label: "日销售额", value: 4063},
  {label: "总销量", value: 278},
];
