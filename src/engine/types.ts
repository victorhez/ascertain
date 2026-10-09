export type Hex = `0x${string}`;
export type Address = Hex;
export type Verdict = "GO" | "WAIT" | "NO-GO";
export type Intent = "creator" | "trader" | "staker";

export interface TokenMeta {
  address: Address;
  chainId: number;
  chainName: string;
  symbol: string;
  name: string;
  decimals: number;
  launchBlock: number;
  poolAddress: Address;
  deployer: Address;
  quoteAsset: { symbol: string; address: Address; decimals: number };
  source: "fixture" | "rpc";
  summary: string;
  /** Present for fixtures only: what the generator planted. */
  scenario?: string;
}

/** A log exactly as eth_getLogs / receipts return it. */
export interface RawLog {
  chainId: number;
  blockNumber: number;
  txHash: Hex;
  logIndex: number;
  address: Address;
  topics: Hex[];
  data: Hex;
}

/** The fields of a transaction Ascertain cites (native HYPE funding transfers). */
export interface RawTx {
  chainId: number;
  hash: Hex;
  blockNumber: number;
  from: Address;
  to: Address;
  value: string; // decimal wei
  input: Hex;
}

/** Everything the engine reads. A strict superset of "raw logs" so nothing derived is stored alone. */
export interface Dataset {
  token: TokenMeta;
  headBlock: number;
  /** Seconds per block, used to map blocks to wall-clock time. */
  blockSeconds: number;
  launchTimestamp: number;
  logs: RawLog[];
  fundingTxs: RawTx[];
  /** eth_getTransactionCount at head, per wallet that appears as a holder or trader. */
  nonces: Record<string, number>;
}

export interface Transfer { from: Address; to: Address; amount: bigint; blockNumber: number; txHash: Hex; logIndex: number }
export interface Swap { trader: Address; side: "buy" | "sell"; tokenAmount: bigint; quoteAmount: bigint; usd: number; tokens: number; blockNumber: number; txHash: Hex; logIndex: number }

export type EvidenceKind = "log" | "tx" | "call" | "nonce";

/** One re-fetchable fact. `raw` is the canonical string the verifier must reproduce byte-for-byte. */
export interface EvidenceRef {
  kind: EvidenceKind;
  chainId: number;
  blockNumber: number;
  address: Address;
  txHash?: Hex;
  logIndex?: number;
  callData?: Hex;
  raw: string;
}

export interface EvidenceReceipt extends EvidenceRef {
  findingId: string;
  verified: boolean;
  verifiedAt: string;
  verifierRpc: string;
  verifierRaw: string;
  reproduce: string;
}

export type SignalId =
  | "concentration"
  | "funding_clusters"
  | "same_block_entry"
  | "wash_loops"
  | "wallet_age"
  | "volume_per_wallet"
  | "effective_holders"
  | "market_cap";

export interface Finding {
  id: string;
  token: Address;
  signal: SignalId;
  title: string;
  ruleVersion: string;
  summary: string;
  value: Record<string, any>;
  evidence: EvidenceRef[];
  evidenceTotal: number;
  evidenceDigest: string;
  status: "published" | "withheld";
  withheldReason?: string;
  verifiedAt?: string;
  verifierRpc?: string;
  receipts?: EvidenceReceipt[];
}

export interface RuleResult {
  id: string;
  label: string;
  kind: "growth" | "integrity";
  value: number | null;
  threshold: number;
  hardThreshold?: number;
  op: ">=" | "<=";
  unit: string;
  status: "pass" | "fail" | "hard-fail" | "unverified";
  weight: number;
  subScore: number;
  flip?: string;
  signal: SignalId;
}

export interface VerdictResult {
  token: Address;
  intent: Intent;
  verdict: Verdict;
  score: number;
  scoreIsPartial: boolean;
  breakdown: RuleResult[];
  failed: RuleResult[];
  flip: string[];
  reasons: string[];
  configVersion: string;
  ruleVersions: Record<string, string>;
  inputsDigest: string;
  computedAt: string;
}
