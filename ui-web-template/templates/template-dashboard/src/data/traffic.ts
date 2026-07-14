export type TrafficPoint = {
  month: string;
  organic: number;
  paidAds: number;
};

export const TRAFFIC_DATA: readonly TrafficPoint[] = [
  {month: "Jan", organic: 2000, paidAds: 1000},
  {month: "Feb", organic: 15000, paidAds: 10000},
  {month: "Mar", organic: 8000, paidAds: 12000},
  {month: "Apr", organic: 14000, paidAds: 14000},
  {month: "May", organic: 15000, paidAds: 8000},
  {month: "Jun", organic: 8000, paidAds: 9000},
  {month: "Jul", organic: 18000, paidAds: 12000},
  {month: "Aug", organic: 18000, paidAds: 10000},
  {month: "Sep", organic: 20000, paidAds: 5000},
  {month: "Oct", organic: 17000, paidAds: 12000},
  {month: "Nov", organic: 22000, paidAds: 18000},
  {month: "Dec", organic: 15000, paidAds: 9000},
];
