import { analyze, type Analysis } from "@/engine/analyze";
import { defaultConfig } from "@/engine/config";
import type { Finding, Intent, VerdictResult } from "@/engine/types";
import { findFixture, getWorld, type Fixture } from "@/fixtures";

export const ELYSIUM_RPC = process.env.ELYSIUM_RPC_URL || "https://testnet-rpc.elysium.kinetiq.xyz";
const RPC_LABEL = { 99801: ELYSIUM_RPC, 999: process.env.HYPEREVM_RPC_URL || "https://rpc.hyperliquid.xyz/evm" };

const TTL = 60_000;
const cache = new Map<string, { at: number; value: Promise<Analysis | null> }>();

export interface Resolved { analysis: Analysis; fixture?: Fixture }

/** Look a token up by address or symbol and (re)verify it. `verifier:false` is the "delete the verifier" demo. */
export async function getAnalysis(id: string, opts: { verifier?: boolean; live?: boolean } = {}): Promise<Resolved | null> {
  const verifier = opts.verifier ?? true;
  const key = `${id.toLowerCase()}|${verifier}|${!!opts.live}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    const analysis = await hit.value;
    return analysis ? { analysis, fixture: findFixture(id) } : null;
  }
  const fx = findFixture(id);
  let value: Promise<Analysis | null>;
  if (fx) {
    value = analyze(fx.indexer, { verifier: verifier ? ((opts.live ? fx.liveVerifier : undefined) ?? fx.verifier ?? getWorld().chainB) : null, rpcLabel: RPC_LABEL });
  } else {
    value = Promise.resolve(null);
  }
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  const analysis = await value;
  return analysis ? { analysis, fixture: fx } : null;
}

export async function listTokens() {
  const rows = await Promise.all(getWorld().fixtures.map(async (f) => (await getAnalysis(f.truth.token.address))!));
  return rows.map(({ analysis: a, fixture }) => summarize(a, fixture));
}

export function summarize(a: Analysis, fixture?: Fixture) {
  const g = (s: string) => a.findings.find((f) => f.signal === s && f.status === "published")?.value;
  const v = a.verdicts.creator;
  return {
    address: a.token.address,
    symbol: a.token.symbol,
    name: a.token.name,
    chainId: a.token.chainId,
    chainName: a.token.chainName,
    source: a.token.source,
    scenario: a.token.scenario ?? null,
    summary: a.token.summary,
    verdict: v.verdict,
    score: v.score,
    rawHolders: g("effective_holders")?.raw ?? null,
    effectiveHolders: g("effective_holders")?.effective ?? null,
    marketCapUsd: g("market_cap")?.marketCapUsd ?? null,
    organicVolumeUsd: g("volume_per_wallet")?.weightedOrganicDailyUsd ?? null,
    verifiedAt: a.verifiedAt,
    withheld: a.withheld.length,
    published: a.published.length,
    simulated: !!fixture && !fixture.onchain,
    onchain: !!fixture?.onchain,
  };
}

export async function findFindingById(id: string): Promise<{ finding: Finding; analysis: Analysis; fixture?: Fixture } | null> {
  for (const f of getWorld().fixtures) {
    const r = await getAnalysis(f.truth.token.address);
    const finding = r?.analysis.findings.find((x) => x.id === id);
    if (finding) return { finding, analysis: r!.analysis, fixture: f };
  }
  return null;
}

const DISCLAIMER =
  "Scores and verdicts are estimates derived from public Ascend criteria. Ascend's real thresholds are internal; this is not an official Ascend decision and not financial advice. Findings describe observable on-chain patterns only.";

export function readinessPayload(a: Analysis, intent: Intent, origin: string, fixture?: Fixture) {
  const v: VerdictResult = a.verdicts[intent];
  return {
    token: a.token,
    intent,
    verdict: v.verdict,
    score: v.score,
    scoreIsPartial: v.scoreIsPartial,
    scoreLabel: "estimate",
    reasons: v.reasons,
    breakdown: v.breakdown,
    failedRules: v.failed.map((r) => r.id),
    whatWouldFlipIt: v.flip,
    configVersion: v.configVersion,
    ruleVersions: v.ruleVersions,
    inputsDigest: v.inputsDigest,
    headBlock: a.headBlock,
    verifiedAt: a.verifiedAt,
    verifier: a.verifierEnabled ? "second-source" : "none",
    findings: a.findings.map((f) => ({ id: f.id, signal: f.signal, status: f.status, evidenceUrl: `${origin}/v1/evidence/${f.id}`, withheldReason: f.withheldReason })),
    simulated: !!fixture && !fixture.onchain,
    dataSource: fixture?.onchain ? "Mock launch deployed on Elysium testnet (chain 99801); logs and receipts re-fetched via JSON-RPC." : fixture ? "Simulated Elysium-testnet launch (deterministic fixture with planted ground truth)." : "Live chain read via JSON-RPC.",
    thresholds: { status: defaultConfig.status, basis: defaultConfig.basis },
    disclaimer: DISCLAIMER,
  };
}

export function integrityPayload(a: Analysis, origin: string) {
  const pub = (s: string) => a.findings.find((f) => f.signal === s);
  const strip = (f?: Finding) => (f ? { id: f.id, status: f.status, ruleVersion: f.ruleVersion, summary: f.summary, value: f.status === "published" ? f.value : null, withheldReason: f.withheldReason, evidenceUrl: `${origin}/v1/evidence/${f.id}` } : null);
  return {
    token: { address: a.token.address, symbol: a.token.symbol, chainId: a.token.chainId },
    headBlock: a.headBlock,
    verifiedAt: a.verifiedAt,
    signals: Object.fromEntries(a.findings.map((f) => [f.signal, strip(pub(f.signal))])),
    disclaimer: DISCLAIMER,
  };
}

export { DISCLAIMER };
