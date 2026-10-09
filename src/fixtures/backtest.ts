import { analyze } from "@/engine/analyze";
import { getWorld } from "./index";

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b);
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i || 1);
};

export interface BacktestRow {
  token: string;
  symbol: string;
  scenario: string;
  expectedVerdict: string;
  verdict: string;
  verdictCorrect: boolean;
  score: number;
  rawHolders: { planted: number; found: number };
  effectiveHolders: { planted: number; found: number; absError: number };
  clusters: { planted: number; detected: number; matched: number; falsePositive: number; walletRecall: number };
  washWallets: { planted: number; detected: number; truePositive: number; falsePositive: number };
  bundles: { planted: number; plantedWallets: number; detectedWallets: number; walletRecall: number };
  findingsPublished: number;
  findingsWithheld: number;
  withheldSignals: string[];
}

export async function runBacktest(now = new Date("2026-10-09T00:00:00Z")) {
  const world = getWorld();
  const rows: BacktestRow[] = [];
  const evidence: Record<string, unknown>[] = [];

  for (const f of world.fixtures) {
    const a = await analyze(f.indexer, { verifier: world.chainB, now, rpcLabel: { 99801: "https://testnet-rpc.elysium.kinetiq.xyz" } });
    const by = (s: string) => a.findings.find((x) => x.signal === s)!;
    const planted = f.info;

    const detectedClusters: string[][] = by("funding_clusters").value.clusters.map((c: any) => c.wallets);
    const plantedClusters = planted.plantedClusters.map((c) => c.wallets as string[]);
    let matched = 0;
    for (const p of plantedClusters) if (detectedClusters.some((d) => jaccard(p, d) >= 0.9)) matched++;
    const fpClusters = detectedClusters.filter((d) => !plantedClusters.some((p) => jaccard(p, d) >= 0.9)).length;
    const plantedClusterWallets = new Set(plantedClusters.flat());
    const detectedClusterWallets = new Set(detectedClusters.flat());
    const rec = plantedClusterWallets.size ? [...plantedClusterWallets].filter((w) => detectedClusterWallets.has(w)).length / plantedClusterWallets.size : 1;

    const detWash = new Set<string>(by("wash_loops").value.washWallets);
    const plWash = new Set<string>(planted.plantedWashWallets);
    const tp = [...detWash].filter((w) => plWash.has(w)).length;

    const plBundleWallets = new Set(planted.plantedBundles.flat() as string[]);
    const detBundleWallets = new Set<string>(by("same_block_entry").value.bundles.flatMap((b: any) => b.wallets));
    const bRec = plBundleWallets.size ? [...plBundleWallets].filter((w) => detBundleWallets.has(w)).length / plBundleWallets.size : 1;

    const eff = by("effective_holders").value;
    const v = a.verdicts.creator;
    rows.push({
      token: f.truth.token.address,
      symbol: f.truth.token.symbol,
      scenario: planted.scenario,
      expectedVerdict: planted.expectedVerdict,
      verdict: v.verdict,
      verdictCorrect: v.verdict === planted.expectedVerdict,
      score: v.score,
      rawHolders: { planted: planted.rawHolders, found: eff.raw },
      effectiveHolders: { planted: planted.plantedEffectiveHolders, found: eff.effective, absError: Math.abs(planted.plantedEffectiveHolders - eff.effective) },
      clusters: { planted: plantedClusters.length, detected: detectedClusters.length, matched, falsePositive: fpClusters, walletRecall: Number(rec.toFixed(4)) },
      washWallets: { planted: plWash.size, detected: detWash.size, truePositive: tp, falsePositive: detWash.size - tp },
      bundles: { planted: planted.plantedBundles.length, plantedWallets: plBundleWallets.size, detectedWallets: detBundleWallets.size, walletRecall: Number(bRec.toFixed(4)) },
      findingsPublished: a.published.length,
      findingsWithheld: a.withheld.length,
      withheldSignals: a.withheld.map((w) => w.signal),
    });
    evidence.push({
      token: f.truth.token.address,
      symbol: f.truth.token.symbol,
      drift: f.drift,
      verdicts: a.verdicts,
      findings: a.findings,
    });
  }

  const sum = <K extends keyof BacktestRow>(sel: (r: BacktestRow) => number) => rows.reduce((acc, r) => acc + sel(r), 0);
  const clean = rows.filter((r) => r.scenario === "clean" || r.scenario === "early-stage");
  const summary = {
    tokens: rows.length,
    verdictAccuracy: `${rows.filter((r) => r.verdictCorrect).length}/${rows.length}`,
    plantedClustersFound: `${sum((r) => r.clusters.matched)}/${sum((r) => r.clusters.planted)}`,
    clusterWalletRecall: Number((rows.filter((r) => r.clusters.planted).reduce((a, r) => a + r.clusters.walletRecall, 0) / Math.max(1, rows.filter((r) => r.clusters.planted).length)).toFixed(4)),
    plantedWashWalletsFound: `${sum((r) => r.washWallets.truePositive)}/${sum((r) => r.washWallets.planted)}`,
    falsePositiveClustersOnCleanTokens: clean.reduce((a, r) => a + r.clusters.falsePositive, 0),
    falsePositiveWashWalletsOnCleanTokens: clean.reduce((a, r) => a + r.washWallets.falsePositive, 0),
    falsePositiveWashWalletsAllTokens: sum((r) => r.washWallets.falsePositive),
    effectiveHolderMaxAbsError: Math.max(...rows.map((r) => r.effectiveHolders.absError)),
    findingsWithheldByVerifier: sum((r) => r.findingsWithheld),
    findingsTotal: sum((r) => r.findingsPublished + r.findingsWithheld),
  };
  return { generatedAt: now.toISOString(), configVersion: world.fixtures.length ? (await import("@/engine/config")).defaultConfig.version : "", note: "Simulated launches with planted ground truth. Not real-token results.", summary, rows, evidence };
}
