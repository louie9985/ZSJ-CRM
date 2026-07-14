export type Holding = {
  readonly id: string;
  readonly name: string;
  readonly ticker: string;
  readonly avatar: string;
  readonly color: string;
  /** Amount held in native units (e.g. 0.236 BTC). */
  readonly amount: string;
  /** USD-formatted value of the holding. */
  readonly value: string;
  /** Raw USD value used for sorting / allocation math. */
  readonly usd: number;
  /** 24-hour percent change as a signed number. */
  readonly change24h: number;
  /** Signed 7-day price series used for sparklines. */
  readonly spark: readonly number[];
};

const CDN = "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/templates/finances";

export const HOLDINGS: readonly Holding[] = [
  {
    amount: "0.23637493",
    avatar: `${CDN}/btc.png`,
    change24h: 2.34,
    color: "bg-[#F7931A]",
    id: "btc",
    name: "Bitcoin",
    spark: [61200, 62400, 60100, 62800, 60400, 62200, 63950],
    ticker: "BTC",
    usd: 1283.84,
    value: "$1,283.84",
  },
  {
    amount: "2092.32235",
    avatar: `${CDN}/usdc.png`,
    change24h: 0.01,
    color: "bg-[#2775CA]",
    id: "usdc",
    name: "USDC",
    spark: [1, 1.001, 0.999, 1.002, 0.998, 1.001, 1],
    ticker: "USDC",
    usd: 2087.25,
    value: "$2,087.25",
  },
  {
    amount: "0.45682912",
    avatar: `${CDN}/eth.png`,
    change24h: -1.12,
    color: "bg-[#627EEA]",
    id: "eth",
    name: "Ethereum",
    spark: [2480, 2410, 2520, 2330, 2450, 2290, 2380],
    ticker: "ETH",
    usd: 1087.25,
    value: "$1,087.25",
  },
  {
    amount: "5.18723422",
    avatar: `${CDN}/bnb.png`,
    change24h: 0.92,
    color: "bg-[#F3BA2F]",
    id: "bnb",
    name: "BNB Chain",
    spark: [798, 820, 785, 815, 790, 824, 810],
    ticker: "BNB",
    usd: 165.2,
    value: "$165.20",
  },
  {
    amount: "0.91623843",
    avatar: `${CDN}/solana.png`,
    change24h: 4.72,
    color: "bg-[#9945FF]",
    id: "sol",
    name: "Solana",
    spark: [196, 188, 204, 192, 214, 202, 218],
    ticker: "SOL",
    usd: 195.54,
    value: "$195.54",
  },
  {
    amount: "124.5234",
    avatar: `${CDN}/matic.png`,
    change24h: -0.38,
    color: "bg-[#8247E5]",
    id: "matic",
    name: "Polygon",
    spark: [0.75, 0.72, 0.78, 0.68, 0.74, 0.67, 0.69],
    ticker: "POL",
    usd: 85.9,
    value: "$85.90",
  },
  {
    amount: "312.0891",
    avatar: `${CDN}/arb.png`,
    change24h: 1.88,
    color: "bg-[#12AAFF]",
    id: "arb",
    name: "Arbitrum",
    spark: [0.78, 0.84, 0.76, 0.82, 0.79, 0.87, 0.86],
    ticker: "ARB",
    usd: 268.4,
    value: "$268.40",
  },
  {
    amount: "18.2145",
    avatar: `${CDN}/link.png`,
    change24h: -0.22,
    color: "bg-[#2A5ADA]",
    id: "link",
    name: "Chainlink",
    spark: [14.6, 13.8, 14.4, 13.5, 14.2, 13.6, 13.95],
    ticker: "LINK",
    usd: 254.1,
    value: "$254.10",
  },
] as const;

/** Total portfolio value in USD, computed at module load. */
export const TOTAL_BALANCE_USD = HOLDINGS.reduce((sum, holding) => sum + holding.usd, 0);
