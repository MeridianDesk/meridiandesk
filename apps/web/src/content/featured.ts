/**
 * Landing-only highlight list (brief §8.2 / §11.2 rule 1).
 * NOT the support catalog. Dashboard must render the full MarketRegistry.
 * Symbols are a seed pending sync with the official RH assets API
 * (GET https://api.robinhood.com/rhj/assets) — verify each before launch.
 */

export type FeaturedToken = {
  symbol: string;
  name: string;
  cluster: "MAG7" | "Index ETF" | "Liquid";
};

export const featured: FeaturedToken[] = [
  { symbol: "AAPL", name: "Apple", cluster: "MAG7" },
  { symbol: "MSFT", name: "Microsoft", cluster: "MAG7" },
  { symbol: "NVDA", name: "NVIDIA", cluster: "MAG7" },
  { symbol: "GOOGL", name: "Alphabet", cluster: "MAG7" },
  { symbol: "AMZN", name: "Amazon", cluster: "MAG7" },
  { symbol: "META", name: "Meta Platforms", cluster: "MAG7" },
  { symbol: "TSLA", name: "Tesla", cluster: "MAG7" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", cluster: "Index ETF" },
  { symbol: "QQQ", name: "Invesco QQQ", cluster: "Index ETF" },
  { symbol: "AMD", name: "Advanced Micro Devices", cluster: "Liquid" },
  { symbol: "NFLX", name: "Netflix", cluster: "Liquid" },
  { symbol: "COIN", name: "Coinbase", cluster: "Liquid" },
  { symbol: "PLTR", name: "Palantir", cluster: "Liquid" },
  { symbol: "AVGO", name: "Broadcom", cluster: "Liquid" },
];

export const clusters = ["MAG7", "Index ETF", "Liquid"] as const;
