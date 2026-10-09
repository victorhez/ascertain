import raw from "@config/thresholds.v1.json";

export interface RuleConfig {
  label: string;
  kind: "growth" | "integrity";
  min?: number;
  max?: number;
  hardMin?: number;
  hardMax?: number;
  hard?: boolean;
  weight: number;
  unit: string;
}

export interface EngineConfig {
  version: string;
  status: string;
  basis: string;
  sources: { label: string; url: string }[];
  rules: Record<string, RuleConfig>;
  intents: Record<"creator" | "trader" | "staker", string[]>;
  signals: {
    ignoredFunders: string[];
    fundingMaxHops: number;
    minClusterSize: number;
    bundleMinWallets: number;
    bundleMaxSpread: number;
    washMinGrossUsd: number;
    washMaxNetRatio: number;
    washMinPairs: number;
    washPairWindowSec: number;
    washPairTolerance: number;
    washCycleMinRatio: number;
    coordinatedMinSize: number;
    freshMaxNonce: number;
    freshWindowBlocks: number;
    volumeWindowDays: number;
    volumeSpikeCap: number;
    evidenceCap: { perFinding: number };
  };
  stalenessLimitMs: number;
  listing: { deployerFeeShare: number; approvedFeeShare: number; tokenTradingFee: number; referralShare: number };
}

export const defaultConfig = raw as unknown as EngineConfig;

/** Rule versions: bump when a signal's definition changes. Verdicts are reproducible per (data, version). */
export const RULE_VERSIONS = {
  concentration: "concentration@1.0.0",
  funding_clusters: "funding-clusters@1.0.0",
  same_block_entry: "same-block-entry@1.0.0",
  wash_loops: "wash-loops@1.0.0",
  wallet_age: "wallet-age@1.0.0",
  volume_per_wallet: "volume-per-wallet@1.0.0",
  effective_holders: "effective-holders@1.0.0",
  market_cap: "market-cap@1.0.0",
} as const;
