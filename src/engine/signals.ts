import { BURN_ADDRESS, ZERO_ADDRESS, lc } from "@/chain/codec";
import type { EngineConfig } from "./config";
import { DSU, type Ledger } from "./ledger";
import { balanceRef, dedupe, logRef, nonceRef, sample, totalSupplyRef, txRef } from "./evidence";
import type { Address, EvidenceRef, Swap } from "./types";

export interface SignalOutput {
  title: string;
  summary: string;
  value: Record<string, any>;
  evidence: EvidenceRef[];
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function logOf(L: Ledger, txHash: string, logIndex: number) {
  return L.ds.logs.find((x) => x.txHash === txHash && x.logIndex === logIndex);
}

/* ------------------------------------------------------------------ concentration */

export function concentration(L: Ledger): SignalOutput {
  const hs = L.holders;
  const circ = L.circulatingTokens || 1;
  const share = (n: number) => hs.slice(0, n).reduce((a, h) => a + h.tokens, 0) / circ;
  const hhi = hs.reduce((a, h) => a + (h.tokens / circ) ** 2, 0);
  const asc = hs.map((h) => h.tokens).sort((a, b) => a - b);
  const n = asc.length;
  let cum = 0;
  asc.forEach((x, i) => (cum += (i + 1) * x));
  const gini = n ? (2 * cum) / (n * circ) - (n + 1) / n : 0;

  const top = hs.slice(0, 10);
  const evidence = dedupe([
    totalSupplyRef(L),
    balanceRef(L, L.pool),
    balanceRef(L, BURN_ADDRESS),
    ...top.map((h) => balanceRef(L, h.address)),
  ]);
  const value = {
    holders: n,
    circulatingTokens: round(circ, 2),
    top1: round(share(1)),
    top5: round(share(5)),
    top10: round(share(10)),
    hhi: round(hhi),
    gini: round(gini),
    topHolders: top.map((h) => ({ address: h.address, share: round(h.tokens / circ) })),
  };
  return {
    title: "Holder concentration",
    summary: `Top-1 holds ${(value.top1 * 100).toFixed(1)}%, top-10 hold ${(value.top10 * 100).toFixed(1)}% of circulating supply across ${n} holders (pool and burn excluded).`,
    value,
    evidence,
  };
}

/* ------------------------------------------------------------------ funding clusters */

export interface Cluster {
  id: string;
  wallets: Address[];
  root: Address;
  hops: number;
  reason: string;
}

export function fundingClusters(L: Ledger, cfg: EngineConfig): SignalOutput & { clusters: Cluster[] } {
  const ignored = new Set([...cfg.signals.ignoredFunders, ...(L.ds.ignoredFunders ?? [])].map(lc));
  const maxHops = cfg.signals.fundingMaxHops;
  const dsu = new DSU();
  const ancestors = new Map<string, string[]>();

  for (const w of L.wallets) {
    const chain: string[] = [];
    let cur = w;
    for (let h = 0; h < maxHops; h++) {
      const tx = L.firstFunding.get(cur);
      if (!tx) break;
      const f = lc(tx.from);
      if (ignored.has(f) || f === w) break;
      chain.push(f);
      cur = f;
    }
    ancestors.set(w, chain);
    for (const a of chain) dsu.union(w, `anc:${a}`);
  }

  const groups = new Map<string, string[]>();
  for (const w of L.wallets) {
    if (!ancestors.get(w)?.length) continue;
    const r = dsu.find(w);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(w);
  }

  const clusters: Cluster[] = [];
  for (const members of groups.values()) {
    if (members.length < cfg.signals.minClusterSize) continue;
    members.sort();
    const count = new Map<string, number>();
    let hops = 1;
    for (const m of members) {
      const ch = ancestors.get(m)!;
      hops = Math.max(hops, ch.length);
      for (const a of ch) count.set(a, (count.get(a) ?? 0) + 1);
    }
    const root = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] as Address;
    clusters.push({ id: "", wallets: members as Address[], root, hops, reason: "linked by funding source" });
  }
  clusters.sort((a, b) => b.wallets.length - a.wallets.length || a.root.localeCompare(b.root));
  clusters.forEach((c, i) => (c.id = `C${i + 1}`));

  const per = Math.max(2, Math.floor((cfg.signals.evidenceCap.perFinding - 1) / Math.max(1, clusters.length) / 2));
  const ev: EvidenceRef[] = [totalSupplyRef(L)];
  for (const c of clusters) {
    for (const w of sample(c.wallets, per)) {
      let cur: string = w;
      for (let h = 0; h < maxHops; h++) {
        const tx = L.firstFunding.get(cur);
        if (!tx || ignored.has(lc(tx.from))) break;
        ev.push(txRef(tx));
        cur = lc(tx.from);
      }
    }
  }
  const evidence = dedupe(ev).slice(0, cfg.signals.evidenceCap.perFinding);

  const clustered = clusters.reduce((a, c) => a + c.wallets.length, 0);
  const value = {
    clusterCount: clusters.length,
    clusteredWallets: clustered,
    clusters: clusters.map((c) => ({ id: c.id, size: c.wallets.length, root: c.root, hops: c.hops, reason: c.reason, wallets: c.wallets })),
  };
  return {
    title: "Funding-source clusters",
    summary: clusters.length
      ? `${clustered} wallets fall into ${clusters.length} group${clusters.length > 1 ? "s" : ""} linked by a shared funding source within ${maxHops} hops.`
      : "No wallet group shares a funding source above the minimum cluster size.",
    value,
    evidence,
    clusters,
  };
}

/* ------------------------------------------------------------------ same-block entry */

export interface Bundle { block: number; wallets: Address[]; medianBuyUsd: number }

export function sameBlockEntry(L: Ledger, cfg: EngineConfig): SignalOutput & { bundles: Bundle[] } {
  const byBlock = new Map<number, Swap[]>();
  for (const s of L.firstBuy.values()) {
    if (!byBlock.has(s.blockNumber)) byBlock.set(s.blockNumber, []);
    byBlock.get(s.blockNumber)!.push(s);
  }

  const bundles: Bundle[] = [];
  for (const [block, buys] of byBlock) {
    if (buys.length < cfg.signals.bundleMinWallets) continue;
    const sorted = [...buys].sort((a, b) => a.usd - b.usd);
    let best: Swap[] = [];
    for (let i = 0; i < sorted.length; i++) {
      let j = i;
      while (
        j + 1 < sorted.length &&
        (sorted[j + 1].usd - sorted[i].usd) / Math.max(1e-9, median(sorted.slice(i, j + 2).map((x) => x.usd))) <= cfg.signals.bundleMaxSpread
      ) j++;
      if (j - i + 1 > best.length) best = sorted.slice(i, j + 1);
    }
    if (best.length >= cfg.signals.bundleMinWallets) {
      bundles.push({ block, wallets: best.map((b) => b.trader).sort() as Address[], medianBuyUsd: round(median(best.map((b) => b.usd)), 2) });
    }
  }
  bundles.sort((a, b) => a.block - b.block);

  const refs: EvidenceRef[] = [totalSupplyRef(L)];
  const perBundle = Math.max(2, Math.floor((cfg.signals.evidenceCap.perFinding - 1) / Math.max(1, bundles.length)));
  for (const b of bundles) {
    for (const w of sample(b.wallets, perBundle)) {
      const s = L.firstBuy.get(w)!;
      const l = logOf(L, s.txHash, s.logIndex);
      if (l) refs.push(logRef(l));
    }
  }
  const bundled = new Set(bundles.flatMap((b) => b.wallets)).size;
  return {
    title: "Same-block entry",
    summary: bundles.length
      ? `${bundled} wallets entered in ${bundles.length} synchronized batch${bundles.length > 1 ? "es" : ""} (≥${cfg.signals.bundleMinWallets} wallets, same block, near-identical size).`
      : "No synchronized same-block entry batches detected.",
    value: { bundleCount: bundles.length, bundledWallets: bundled, bundles: bundles.map((b) => ({ ...b })) },
    evidence: dedupe(refs).slice(0, cfg.signals.evidenceCap.perFinding),
    bundles,
  };
}

/* ------------------------------------------------------------------ wash loops */

export interface Loop { type: "pool_round_trip" | "transfer_cycle"; wallets: Address[]; grossUsd: number }

export function washLoops(L: Ledger, cfg: EngineConfig): SignalOutput & { washWallets: Set<string>; loops: Loop[] } {
  const per = new Map<string, { buy: number; sell: number; trades: number; pairs: number; last?: { tokens: number; block: number } }>();
  const windowBlocks = cfg.signals.washPairWindowSec / L.ds.blockSeconds;
  for (const s of L.swaps) {
    const r = per.get(s.trader) ?? { buy: 0, sell: 0, trades: 0, pairs: 0 };
    if (s.side === "buy") {
      r.buy += s.usd;
      r.last = { tokens: s.tokens, block: s.blockNumber };
    } else {
      r.sell += s.usd;
      // A round trip: sells back (almost exactly) what it just bought, within minutes.
      if (r.last && s.blockNumber - r.last.block <= windowBlocks && Math.abs(s.tokens - r.last.tokens) / r.last.tokens <= cfg.signals.washPairTolerance) r.pairs++;
      r.last = undefined;
    }
    r.trades++;
    per.set(s.trader, r);
  }
  const loops: Loop[] = [];
  const washWallets = new Set<string>();
  for (const [w, r] of per) {
    const gross = r.buy + r.sell;
    if (
      gross >= cfg.signals.washMinGrossUsd &&
      r.pairs >= cfg.signals.washMinPairs &&
      Math.abs(r.buy - r.sell) / gross <= cfg.signals.washMaxNetRatio
    ) {
      washWallets.add(w);
      loops.push({ type: "pool_round_trip", wallets: [w as Address], grossUsd: round(gross, 2) });
    }
  }

  // Wallet-to-wallet cyclic flows (A->B->A, A->B->C->A) with near-zero net position change.
  const infra = new Set<string>([L.pool, BURN_ADDRESS, ZERO_ADDRESS]);
  const edges = new Map<string, number>();
  for (const t of L.transfers) {
    if (infra.has(t.from) || infra.has(t.to) || t.from === t.to) continue;
    const k = `${t.from}>${t.to}`;
    edges.set(k, (edges.get(k) ?? 0) + Number(t.amount / 10n ** 12n));
  }
  const out = new Map<string, string[]>();
  for (const k of edges.keys()) {
    const [a, b] = k.split(">");
    if (!out.has(a)) out.set(a, []);
    out.get(a)!.push(b);
  }
  const minRatio = cfg.signals.washCycleMinRatio;
  const ratio = (xs: number[]) => Math.min(...xs) / Math.max(...xs);
  const seen = new Set<string>();
  const addCycle = (ws: string[]) => {
    const key = [...ws].sort().join();
    if (seen.has(key)) return;
    seen.add(key);
    loops.push({ type: "transfer_cycle", wallets: [...ws].sort() as Address[], grossUsd: 0 });
    ws.forEach((w) => washWallets.add(w));
  };
  for (const [a, bs] of out) {
    for (const b of bs) {
      const ab = edges.get(`${a}>${b}`)!;
      const ba = edges.get(`${b}>${a}`);
      if (ba && ratio([ab, ba]) >= minRatio) addCycle([a, b]);
      for (const c of out.get(b) ?? []) {
        if (c === a || c === b) continue;
        const bc = edges.get(`${b}>${c}`)!;
        const ca = edges.get(`${c}>${a}`);
        if (ca && ratio([ab, bc, ca]) >= minRatio) addCycle([a, b, c]);
      }
    }
  }

  const totalUsd = L.swaps.reduce((a, s) => a + s.usd, 0);
  const washUsd = L.swaps.filter((s) => washWallets.has(s.trader)).reduce((a, s) => a + s.usd, 0);

  const refs: EvidenceRef[] = [totalSupplyRef(L)];
  const walletsSorted = [...washWallets].sort();
  const sampleWallets = sample(walletsSorted, 6);
  const perWallet = Math.max(2, Math.floor((cfg.signals.evidenceCap.perFinding - 7) / Math.max(1, sampleWallets.length)));
  for (const w of sampleWallets) {
    for (const s of sample(L.swaps.filter((x) => x.trader === w), perWallet)) {
      const l = logOf(L, s.txHash, s.logIndex);
      if (l) refs.push(logRef(l));
    }
  }
  const cyc = loops.filter((l) => l.type === "transfer_cycle");
  const cycleTransfers = L.transfers.filter((t) => cyc.some((l) => l.wallets.includes(t.from) && l.wallets.includes(t.to)));
  for (const t of sample(cycleTransfers, 6)) {
    const l = logOf(L, t.txHash, t.logIndex);
    if (l) refs.push(logRef(l));
  }
  const share = totalUsd ? washUsd / totalUsd : 0;
  return {
    title: "Wash loops and round trips",
    summary: washWallets.size
      ? `${washWallets.size} wallets show round-trip or cyclic flow with near-zero net position, accounting for ${(share * 100).toFixed(1)}% of volume.`
      : "No round-trip or cyclic wallet flows detected.",
    value: {
      washWalletCount: washWallets.size,
      washWallets: walletsSorted,
      washVolumeUsd: round(washUsd, 2),
      totalVolumeUsd: round(totalUsd, 2),
      washShare: round(share),
      loops,
    },
    evidence: dedupe(refs).slice(0, cfg.signals.evidenceCap.perFinding),
    washWallets,
    loops,
  };
}

/* ------------------------------------------------------------------ wallet age */

export function walletAge(L: Ledger, cfg: EngineConfig): SignalOutput & { freshWallets: Set<string> } {
  const fresh = new Set<string>();
  const nonces: number[] = [];
  const uni = L.ds.analysisUniverse ? new Set(L.ds.analysisUniverse.map(lc)) : null;
  const pool = uni ? L.holders.filter((h) => uni.has(h.address)) : L.holders;
  for (const h of pool) {
    const nonce = L.ds.nonces[h.address] ?? 0;
    nonces.push(nonce);
    const fund = L.firstFunding.get(h.address);
    const buy = L.firstBuy.get(h.address);
    const recent = !fund || !buy ? true : buy.blockNumber - fund.blockNumber <= cfg.signals.freshWindowBlocks;
    if (nonce <= cfg.signals.freshMaxNonce && recent) fresh.add(h.address);
  }
  const sorted = pool.map((h) => h.address).sort();
  const freshList = sorted.filter((a) => fresh.has(a));
  const otherList = sorted.filter((a) => !fresh.has(a));
  const refs = [
    totalSupplyRef(L),
    ...sample(freshList, 16).map((a) => nonceRef(L, a)),
    ...sample(otherList, 7).map((a) => nonceRef(L, a)),
  ];
  const share = pool.length ? fresh.size / pool.length : 0;
  return {
    title: "Wallet age and activity",
    summary: `${(share * 100).toFixed(1)}% of holders are fresh wallets (≤${cfg.signals.freshMaxNonce} lifetime transactions, funded shortly before first buy).`,
    value: { freshCount: fresh.size, holders: pool.length, freshShare: round(share), medianNonce: median(pool.map((h) => L.ds.nonces[h.address] ?? 0)) },
    evidence: dedupe(refs),
    freshWallets: fresh,
  };
}

/* ------------------------------------------------------------------ effective holders */

export function effectiveHolders(
  L: Ledger,
  parts: { clusters: Cluster[]; bundles: Bundle[]; washWallets: Set<string> },
  upstreamEvidence: EvidenceRef[],
  cfg: EngineConfig,
): SignalOutput & { dsu: DSU; effective: number } {
  const dsu = new DSU();
  for (const c of parts.clusters) for (const w of c.wallets) dsu.union(c.wallets[0], w);
  for (const b of parts.bundles) for (const w of b.wallets) dsu.union(b.wallets[0], w);
  const wash = [...parts.washWallets].sort();
  for (const w of wash) dsu.union(wash[0], w);

  const comps = new Set<string>();
  for (const h of L.holders) comps.add(dsu.find(h.address));
  let raw = L.holders.length;
  let effective = comps.size;
  let ratio = raw ? effective / raw : 1;
  let analyzed: number | undefined;
  if (L.ds.analysisUniverse) {
    const uni = new Set(L.ds.analysisUniverse.map(lc));
    const inU = L.holders.filter((h) => uni.has(h.address));
    analyzed = inU.length;
    const compsU = new Set(inU.map((h) => dsu.find(h.address)));
    ratio = analyzed ? compsU.size / analyzed : 1;
    effective = raw - (analyzed - compsU.size);
  }

  const reductions = [
    ...parts.clusters.map((c) => ({ reason: "funding cluster", id: c.id, wallets: c.wallets.filter((w) => (L.balances.get(w) ?? 0n) > 0n).length })),
    ...(parts.bundles.length
      ? [{ reason: "same-block entry batches", id: "B*", wallets: new Set(parts.bundles.flatMap((b) => b.wallets)).size }]
      : []),
    ...(wash.length ? [{ reason: "wash loops", id: "W*", wallets: wash.filter((w) => (L.balances.get(w) ?? 0n) > 0n).length }] : []),
  ].filter((r) => r.wallets > 1);

  return {
    title: "Effective holders",
    summary: `${raw} raw holders collapse to ${effective} effective holders after merging linked wallets.`,
    value: { raw, effective, ratio: round(ratio), reductions, ...(analyzed !== undefined ? { analyzedTopHolders: analyzed } : {}) },
    evidence: dedupe([totalSupplyRef(L), ...upstreamEvidence]).slice(0, cfg.signals.evidenceCap.perFinding),
    dsu,
    effective,
  };
}

/* ------------------------------------------------------------------ volume per wallet */

export function volumePerWallet(
  L: Ledger,
  ctx: { clusters: Cluster[]; bundles: Bundle[]; washWallets: Set<string>; dsu: DSU },
  cfg: EngineConfig,
): SignalOutput {
  const blocksPerDay = Math.round(86400 / L.ds.blockSeconds);
  const inflated = new Set<string>(ctx.washWallets);
  for (const c of ctx.clusters) if (c.wallets.length >= cfg.signals.coordinatedMinSize) c.wallets.forEach((w) => inflated.add(w));
  for (const b of ctx.bundles) b.wallets.forEach((w) => inflated.add(w));

  const lastDay = Math.floor((L.ds.headBlock - L.ds.token.launchBlock) / blocksPerDay);
  const days = Array.from({ length: lastDay + 1 }, (_, d) => ({ day: d, totalUsd: 0, inflatedUsd: 0, organicUsd: 0, effectiveHolders: 0, volumePerEffective: 0 }));
  for (const s of L.swaps) {
    const d = Math.min(lastDay, Math.max(0, Math.floor((s.blockNumber - L.ds.token.launchBlock) / blocksPerDay)));
    days[d].totalUsd += s.usd;
    if (inflated.has(s.trader)) days[d].inflatedUsd += s.usd;
  }
  const entered: { day: number; comp: string }[] = [];
  for (const h of L.holders) {
    const b = L.firstBuy.get(h.address);
    if (!b) continue;
    entered.push({ day: Math.min(lastDay, Math.floor((b.blockNumber - L.ds.token.launchBlock) / blocksPerDay)), comp: ctx.dsu.find(h.address) });
  }
  for (const d of days) {
    d.organicUsd = d.totalUsd - d.inflatedUsd;
    d.effectiveHolders = new Set(entered.filter((e) => e.day <= d.day).map((e) => e.comp)).size;
    d.volumePerEffective = d.effectiveHolders ? d.organicUsd / d.effectiveHolders : 0;
  }

  const win = days.slice(-cfg.signals.volumeWindowDays);
  const med = median(win.map((d) => d.organicUsd));
  const cap = med > 0 ? med * cfg.signals.volumeSpikeCap : Infinity;
  let num = 0, den = 0;
  win.forEach((d, i) => { const w = i + 1; num += Math.min(d.organicUsd, cap) * w; den += w; });
  const weighted = den ? num / den : 0;

  const totalUsd = days.reduce((a, d) => a + d.totalUsd, 0);
  const inflatedUsd = days.reduce((a, d) => a + d.inflatedUsd, 0);
  const biggest = [...L.swaps].sort((a, b) => b.usd - a.usd || a.txHash.localeCompare(b.txHash)).slice(0, 10);
  const refs = [totalSupplyRef(L), ...biggest.map((s) => logOf(L, s.txHash, s.logIndex)).filter(Boolean).map((l) => logRef(l!))];
  const share = totalUsd ? inflatedUsd / totalUsd : 0;
  const lastRatio = days.length ? days[days.length - 1].volumePerEffective : 0;

  return {
    title: "Volume per unique wallet",
    summary: `$${Math.round(totalUsd).toLocaleString("en-US")} traded; ${(share * 100).toFixed(1)}% attributable to wash or coordinated wallets. Time-weighted organic volume: $${Math.round(weighted).toLocaleString("en-US")}/day.`,
    value: {
      totalUsd: round(totalUsd, 2),
      inflatedUsd: round(inflatedUsd, 2),
      inflatedShare: round(share),
      weightedOrganicDailyUsd: round(weighted, 2),
      latestVolumePerEffective: round(lastRatio, 2),
      days: days.map((d) => ({ ...d, totalUsd: round(d.totalUsd, 2), inflatedUsd: round(d.inflatedUsd, 2), organicUsd: round(d.organicUsd, 2), volumePerEffective: round(d.volumePerEffective, 2) })),
    },
    evidence: dedupe(refs),
  };
}

/* ------------------------------------------------------------------ market cap */

export function marketCap(L: Ledger): SignalOutput {
  const last = L.swaps.slice(-5);
  const prices = last.filter((s) => s.tokens > 0).map((s) => s.usd / s.tokens);
  const price = median(prices);
  const supplyTokens = Number((L.totalSupply - L.burnBalance) / 10n ** BigInt(Math.max(0, L.ds.token.decimals - 6))) / 1e6;
  const cap = price * supplyTokens;
  const refs = [totalSupplyRef(L), balanceRef(L, BURN_ADDRESS), ...last.map((s) => logOf(L, s.txHash, s.logIndex)).filter(Boolean).map((l) => logRef(l!))];
  return {
    title: "Market capitalization",
    summary: `Median of last ${last.length} swaps prices the token at $${price.toPrecision(3)}; market cap ≈ $${Math.round(cap).toLocaleString("en-US")}.`,
    value: { priceUsd: Number(price.toPrecision(6)), supplyTokens: round(supplyTokens, 2), marketCapUsd: Math.round(cap) },
    evidence: dedupe(refs),
  };
}
