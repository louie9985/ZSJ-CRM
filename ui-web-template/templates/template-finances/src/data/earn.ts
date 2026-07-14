export type EarnOpportunity = {
  readonly id: string;
  readonly asset: string;
  readonly assetAvatar: string;
  readonly assetColor: string;
  readonly protocol: string;
  readonly kind: "Staking" | "Lending" | "Liquidity" | "Vault";
  /** Annual percentage yield, expressed as a number (e.g. 4.8). */
  readonly apy: number;
  /** Formatted TVL (total value locked) string. */
  readonly tvl: string;
  /** Risk bucket for visual emphasis. */
  readonly risk: "Low" | "Medium" | "High";
};

const CDN = "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/templates/finances";

export const EARN_OPPORTUNITIES: readonly EarnOpportunity[] = [
  {
    apy: 4.82,
    asset: "ETH",
    assetAvatar: `${CDN}/eth.png`,
    assetColor: "bg-[#627EEA]",
    id: "eth-staking",
    kind: "Staking",
    protocol: "Lido",
    risk: "Low",
    tvl: "$18.4B",
  },
  {
    apy: 6.15,
    asset: "SOL",
    assetAvatar: `${CDN}/solana.png`,
    assetColor: "bg-[#9945FF]",
    id: "sol-staking",
    kind: "Staking",
    protocol: "Jito",
    risk: "Low",
    tvl: "$2.8B",
  },
  {
    apy: 8.4,
    asset: "USDC",
    assetAvatar: `${CDN}/usdc.png`,
    assetColor: "bg-[#2775CA]",
    id: "usdc-lending",
    kind: "Lending",
    protocol: "Aave",
    risk: "Low",
    tvl: "$12.2B",
  },
  {
    apy: 12.6,
    asset: "ETH-USDC",
    assetAvatar: `${CDN}/eth.png`,
    assetColor: "bg-[#627EEA]",
    id: "eth-usdc-lp",
    kind: "Liquidity",
    protocol: "Uniswap v4",
    risk: "Medium",
    tvl: "$920M",
  },
  {
    apy: 5.3,
    asset: "BTC",
    assetAvatar: `${CDN}/btc.png`,
    assetColor: "bg-[#F7931A]",
    id: "wbtc-vault",
    kind: "Vault",
    protocol: "Yearn",
    risk: "Medium",
    tvl: "$340M",
  },
  {
    apy: 18.2,
    asset: "ARB",
    assetAvatar: `${CDN}/arb.png`,
    assetColor: "bg-[#12AAFF]",
    id: "arb-vault",
    kind: "Vault",
    protocol: "Pendle",
    risk: "High",
    tvl: "$58M",
  },
];
