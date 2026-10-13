import type { ChainSource } from "@/chain/source";
import { digestOf } from "./canonical";
import { RULE_VERSIONS, configFor, defaultConfig, type EngineConfig } from "./config";
import { buildLedger } from "./ledger";
import { computeVerdict } from "./readiness";
import * as S from "./signals";
import { verifyFindings } from "./verifier";
import type { Dataset, Finding, Intent, SignalId, VerdictResult } from "./types";

export interface Analysis {
  token: Dataset["token"];
  headBlock: number;
  findings: Finding[];
  published: Finding[];
  withheld: Finding[];
  verdicts: Record<Intent, VerdictResult>;
  verifierEnabled: boolean;
  verifiedAt: string;
  configVersion: string;
  /** Raw numbers the UI charts need. */
  chart: {
    holders: { address: string; share: number }[];
    graph: { clusters: { id: string; size: number; root: string }[]; bundles: number; washWallets: number; organic: number };
  };
}

export interface AnalyzeOptions {
  /** Independent chain source for the verifier. `null` means "verifier deleted": nothing is published. */
  verifier: ChainSource | null;
  rpcLabel?: Record<number, string>;
  config?: EngineConfig;
  now?: Date;
}

function make(ds: Dataset, signal: SignalId, out: S.SignalOutput): Finding {
  const ruleVersion = RULE_VERSIONS[signal];
  const id = "fnd_" + digestOf([ds.token.address, signal, ruleVersion, out.value]).slice(0, 12);
  return {
    id,
    token: ds.token.address,
    signal,
    title: out.title,
    ruleVersion,
    summary: out.summary,
    value: out.value,
    evidence: out.evidence,
    evidenceTotal: out.evidence.length,
    evidenceDigest: digestOf(out.evidence.map((e) => e.raw)),
    status: "withheld",
  };
}

/** Compute every signal for a dataset (no verification yet). */
export function computeFindings(ds: Dataset, cfg: EngineConfig = defaultConfig) {
  const L = buildLedger(ds);
  const conc = S.concentration(L);
  const clu = S.fundingClusters(L, cfg);
  const bun = S.sameBlockEntry(L, cfg);
  const wash = S.washLoops(L, cfg);
  const age = S.walletAge(L, cfg);
  const eff = S.effectiveHolders(L, { clusters: clu.clusters, bundles: bun.bundles, washWallets: wash.washWallets }, [...clu.evidence.slice(0, 8), ...bun.evidence.slice(0, 6), ...wash.evidence.slice(0, 8)], cfg);
  const vol = S.volumePerWallet(L, { clusters: clu.clusters, bundles: bun.bundles, washWallets: wash.washWallets, dsu: eff.dsu }, cfg);
  const mc = S.marketCap(L);

  const findings = [
    make(ds, "concentration", conc),
    make(ds, "funding_clusters", clu),
    make(ds, "same_block_entry", bun),
    make(ds, "wash_loops", wash),
    make(ds, "wallet_age", age),
    make(ds, "effective_holders", eff),
    make(ds, "volume_per_wallet", vol),
    make(ds, "market_cap", mc),
  ];
  return { L, findings, clu, bun, wash, eff };
}

export async function analyze(ds: Dataset, opts: AnalyzeOptions): Promise<Analysis> {
  const cfg = opts.config ?? configFor(ds.profile);
  const now = opts.now ?? new Date();
  const { L, findings, clu, bun, wash } = computeFindings(ds, cfg);
  const verified = await verifyFindings(findings, opts.verifier, opts.rpcLabel ?? {}, now);
  if (!ds.token.onchain) for (const f of verified) for (const r of f.receipts ?? []) r.reproduce = "simulated launch: no chain command";
  const published = verified.filter((f) => f.status === "published");
  const withheld = verified.filter((f) => f.status === "withheld");

  const verdicts = {
    creator: computeVerdict(ds.token.address, "creator", published, cfg, now),
    trader: computeVerdict(ds.token.address, "trader", published, cfg, now),
    staker: computeVerdict(ds.token.address, "staker", published, cfg, now),
  };

  const circ = L.circulatingTokens || 1;
  const clustered = new Set(clu.clusters.flatMap((c) => c.wallets));
  const organic = L.holders.filter((h) => !clustered.has(h.address)).length;
  return {
    token: ds.token,
    headBlock: ds.headBlock,
    findings: verified,
    published,
    withheld,
    verdicts,
    verifierEnabled: !!opts.verifier,
    verifiedAt: now.toISOString(),
    configVersion: cfg.version,
    chart: {
      holders: L.holders.slice(0, 20).map((h) => ({ address: h.address, share: h.tokens / circ })),
      graph: {
        clusters: clu.clusters.map((c) => ({ id: c.id, size: c.wallets.length, root: c.root })),
        bundles: bun.bundles.length,
        washWallets: wash.washWallets.size,
        organic,
      },
    },
  };
}
