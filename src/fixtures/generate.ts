import { BURN_ADDRESS, ZERO_ADDRESS, encodeSwap, encodeTransfer } from "@/chain/codec";
import type { Address, Dataset, Hex, RawLog, RawTx, TokenMeta, Verdict } from "@/engine/types";
import { keccak256, toBytes } from "viem";

export const CHAIN_ID = 99801;
export const BLOCK_SECONDS = 0.2;
export const DAY_BLOCKS = 432_000;
export const LAUNCH_TS = Date.UTC(2026, 8, 24) / 1000;
const SUPPLY = 1_000_000_000n * 10n ** 18n;

const H = (s: string): Hex => keccak256(toBytes(s));
export const addr = (label: string): Address => `0x${H(label).slice(26)}` as Address;

/** Ignored funders: exchange hot wallets and the official bridge (shared funding from these is not a link). */
export const CEX: Address[] = [
  "0x00000000000000000000000000000000000c0001",
  "0x00000000000000000000000000000000000c0002",
  "0x00000000000000000000000000000000000c0003",
  "0x00000000000000000000000000000000000c0004",
  "0x00000000000000000000000000000000000b0001",
];
export const QUOTE_USDC: Address = "0x00000000000000000000000000000000005d0c01";

/** Small seeded PRNG so every fixture is byte-identical across runs and machines. */
export function rng(seed: string) {
  let a = parseInt(H(seed).slice(2, 10), 16) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  return {
    next,
    between: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => Math.floor(lo + (hi + 1 - lo) * next()),
    normal,
    lognormal: (sigma: number) => Math.exp(sigma * normal()),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
  };
}

export interface Spec {
  key: string;
  symbol: string;
  name: string;
  summary: string;
  scenario: string;
  seed: string;
  launchBlock: number;
  targetMarketCapUsd: number;
  days?: number;
  organic: { count: number; medianBuyUsd: number; sigma: number; maxChurn: number; freshRate: number; cexRate: number };
  burst?: number;
  friends?: number;
  activeTrader?: boolean;
  heavy?: { label: string; share: number; via: "buy" | "allocation" }[];
  sybil?: { sizes: number[]; buyUsd: [number, number]; batch: [number, number] };
  wash?: { wallets: number; funders: number; trips: number; tripUsd: [number, number]; cycles: number };
  expect: Verdict;
}

export interface GroundTruth {
  scenario: string;
  expectedVerdict: Verdict;
  rawHolders: number;
  organicHolders: number;
  plantedEffectiveHolders: number;
  plantedClusters: { label: string; wallets: Address[] }[];
  plantedWashWallets: Address[];
  plantedBundles: Address[][];
}

interface Action {
  sec: number;
  kind: "buy" | "sell" | "alloc" | "xfer";
  wallet: Address;
  to?: Address;
  tokens: bigint;
  usd?: number;
}

const toUnits = (tokens: number): bigint => BigInt(Math.round(tokens * 1e6)) * 10n ** 12n;
const usdUnits = (usd: number): bigint => BigInt(Math.round(usd * 1e6));
const hype = (x: number): string => (BigInt(Math.floor(x * 1e9)) * 10n ** 9n).toString();

export function generate(spec: Spec): { truth: Dataset; truthInfo: GroundTruth; trueNonces: Record<string, number> } {
  const R = rng(spec.seed);
  const days = spec.days ?? 14;
  const T = days * 86400;
  const launch = spec.launchBlock;
  const token = addr(`${spec.key}:token`);
  const pool = addr(`${spec.key}:pool`);
  const deployer = addr(`${spec.key}:deployer`);
  const supplyAfterBurn = 0.99e9;
  const pEnd = spec.targetMarketCapUsd / supplyAfterBurn;
  const price = (sec: number) => pEnd * (0.25 + 0.75 * Math.pow(Math.min(1, sec / T), 0.7)) * (1 + 0.04 * Math.sin(sec / 9000));
  const blockOf = (sec: number) => launch + Math.max(2, Math.round(sec / BLOCK_SECONDS));

  const actions: Action[] = [];
  const fundingTxs: RawTx[] = [];
  const nonces: Record<string, number> = {};
  const holdings = new Map<string, bigint>();
  const hold = (w: string, d: bigint) => holdings.set(w, (holdings.get(w) ?? 0n) + d);
  let txCounter = 0;
  const nextHash = (): Hex => H(`${spec.key}:tx:${txCounter++}`);

  const fund = (to: Address, from: Address, atBlock: number, amount = R.between(0.05, 3)) => {
    fundingTxs.push({ chainId: CHAIN_ID, hash: nextHash(), blockNumber: Math.max(1, atBlock), from, to, value: hype(amount), input: "0x" });
  };
  const buy = (w: Address, sec: number, usd: number, jitter = 0.01) => {
    const p = price(sec) * (1 + R.normal() * jitter);
    const tokens = toUnits(usd / p);
    actions.push({ sec, kind: "buy", wallet: w, tokens, usd });
    hold(w, tokens);
    return tokens;
  };
  const sell = (w: Address, sec: number, tokens: bigint, jitter = 0.01) => {
    const p = price(sec) * (1 + R.normal() * jitter);
    actions.push({ sec, kind: "sell", wallet: w, tokens, usd: (Number(tokens / 10n ** 12n) / 1e6) * p });
    hold(w, -tokens);
  };

  // --- Organic wallets -----------------------------------------------------
  const organic: Address[] = [];
  const friendsGroups: Address[][] = [];
  const mkFundedWallet = (label: string, entrySec: number, nonce: number, funderLabel?: string) => {
    const w = addr(`${spec.key}:${label}`);
    const entryBlock = blockOf(entrySec);
    if (funderLabel) {
      const f = addr(`${spec.key}:funder:${funderLabel}`);
      if (!fundingTxs.some((t) => t.to === f)) fund(f, R.pick(CEX), entryBlock - R.int(400_000, 3_000_000), R.between(0.3, 6));
      fund(w, f, entryBlock - R.int(5_000, 900_000));
    } else if (R.next() < spec.organic.cexRate) {
      fund(w, R.pick(CEX), entryBlock - R.int(5_000, 1_500_000));
    } else {
      const f = addr(`${spec.key}:funder:${label}`);
      fund(f, R.pick(CEX), entryBlock - R.int(400_000, 3_000_000), R.between(0.3, 6));
      fund(w, f, entryBlock - R.int(5_000, 900_000));
    }
    nonces[w] = nonce;
    return w;
  };

  const organicNonce = () => (R.next() < spec.organic.freshRate ? R.int(1, 3) : Math.round(Math.exp(R.between(Math.log(8), Math.log(1500)))));

  const entrySec = () => {
    const d = Math.min(days - 1, Math.floor(days * Math.pow(R.next(), 1.7)));
    return d * 86400 + R.between(60, 86000);
  };

  const trade = (w: Address, sec0: number, entryUsd: number) => {
    buy(w, sec0, entryUsd);
    const k = R.int(0, spec.organic.maxChurn);
    const secs = Array.from({ length: k }, () => R.between(sec0 + 600, T - 60)).filter((s) => s > sec0).sort((a, b) => a - b);
    for (const s of secs) {
      const h = holdings.get(w) ?? 0n;
      if (R.next() < 0.5 && h > 0n) sell(w, s, (h * BigInt(Math.round(R.between(10, 50)))) / 100n);
      else buy(w, s, entryUsd * R.between(0.1, 0.5));
    }
  };

  let friendIdx = 0;
  const friendSlots = new Set<number>();
  for (let g = 0; g < (spec.friends ?? 0); g++) friendSlots.add(R.int(3, spec.organic.count - 4));

  let burstLeft = spec.burst ?? 0;
  for (let i = 0; i < spec.organic.count; i++) {
    const inBurst = burstLeft > 0;
    if (inBurst) burstLeft--;
    const sec0 = inBurst ? 1 : entrySec();
    const usd = spec.organic.medianBuyUsd * R.lognormal(spec.organic.sigma);
    let w: Address;
    if (friendSlots.has(i)) {
      const gid = friendIdx++;
      const grp: Address[] = [];
      for (let m = 0; m < 3; m++) {
        const ws = mkFundedWallet(`friend${gid}-${m}`, sec0 + m * 3_000, organicNonce() + 20, `friends${gid}`);
        grp.push(ws);
        trade(ws, sec0 + m * 3_000 + 40, usd * R.between(0.6, 1.4));
      }
      friendsGroups.push(grp);
      organic.push(...grp);
      continue;
    }
    w = mkFundedWallet(`org${i}`, sec0, organicNonce());
    organic.push(w);
    trade(w, sec0, usd);
  }

  // A busy, legitimate trader: lots of gross volume but a real net position. Must NOT be flagged as wash.
  if (spec.activeTrader) {
    const w = mkFundedWallet("active-trader", 3 * 86400, 640);
    buy(w, 3 * 86400 + 100, 4000);
    for (let k = 0; k < 4; k++) {
      sell(w, (4 + k) * 86400 + 5000, (holdings.get(w)! * 3n) / 10n);
      buy(w, (4 + k) * 86400 + 9000, 1500);
    }
    sell(w, 10 * 86400, holdings.get(w)! / 6n);
    organic.push(w);
  }

  // --- Sybil clusters (funding trees, same-block batches) -----------------
  const plantedClusters: GroundTruth["plantedClusters"] = [];
  const plantedBundles: Address[][] = [];
  const sybils: Address[] = [];
  if (spec.sybil) {
    spec.sybil.sizes.forEach((size, ci) => {
      const root = addr(`${spec.key}:sybil-root:${ci}`);
      const baseSec = R.between(0.2, 5) * 86400;
      fund(root, CEX[ci % 4], blockOf(baseSec) - 900_000, 40);
      const hubs = Math.max(1, Math.ceil(size / 25));
      const hubAddrs = Array.from({ length: hubs }, (_, h) => addr(`${spec.key}:sybil-hub:${ci}:${h}`));
      hubAddrs.forEach((h) => fund(h, root, blockOf(baseSec) - 400_000, 4));
      const members: Address[] = [];
      let left = size, idx = 0;
      while (left > 0) {
        const bs = Math.min(left, R.int(spec.sybil!.batch[0], spec.sybil!.batch[1]));
        const sec = baseSec + R.between(0, 4 * 86400);
        const base = R.between(spec.sybil!.buyUsd[0], spec.sybil!.buyUsd[1]);
        const batchWallets: Address[] = [];
        for (let b = 0; b < bs; b++) {
          const w = addr(`${spec.key}:sybil:${ci}:${idx}`);
          fund(w, hubAddrs[idx % hubs], blockOf(sec) - R.int(1_000, 30_000), 0.05);
          nonces[w] = R.int(1, 2);
          buy(w, sec, base * (1 + R.between(-0.012, 0.012)), 0);
          batchWallets.push(w);
          members.push(w);
          idx++;
        }
        if (bs >= 5) plantedBundles.push(batchWallets);
        left -= bs;
      }
      sybils.push(...members);
      plantedClusters.push({ label: `sybil-cluster-${ci + 1}`, wallets: members });
    });
  }

  // --- Wash wallets ----------------------------------------------------------
  const washWallets: Address[] = [];
  if (spec.wash) {
    const w = spec.wash;
    for (let i = 0; i < w.wallets; i++) {
      const fl = `wash${i % w.funders}`;
      const wallet = mkFundedWallet(`wash-wallet:${i}`, 0.5 * 86400, R.int(2, 40), fl);
      washWallets.push(wallet);
    }
    for (let g = 0; g < w.funders; g++) {
      plantedClusters.push({ label: `wash-funding-group-${g + 1}`, wallets: washWallets.filter((_, i) => i % w.funders === g) });
    }
    for (const wallet of washWallets) {
      for (let t = 0; t < w.trips; t++) {
        const s = R.between(0.2 * 86400, T - 3600);
        const bought = buy(wallet, s, R.between(w.tripUsd[0], w.tripUsd[1]));
        sell(wallet, s + R.between(3, 90), bought);
      }
    }
    // Cyclic token flow A -> B -> C -> A, then exit.
    for (let c = 0; c < w.cycles; c++) {
      const g = washWallets.slice((c * 3) % washWallets.length, ((c * 3) % washWallets.length) + 3);
      if (g.length < 3) continue;
      const s = R.between(0.3 * 86400, T - 7200);
      const bought = buy(g[0], s, R.between(w.tripUsd[0], w.tripUsd[1]));
      actions.push({ sec: s + 5, kind: "xfer", wallet: g[0], to: g[1], tokens: bought });
      actions.push({ sec: s + 10, kind: "xfer", wallet: g[1], to: g[2], tokens: bought });
      actions.push({ sec: s + 15, kind: "xfer", wallet: g[2], to: g[0], tokens: bought });
      sell(g[0], s + 30, bought);
    }
  }

  // --- Heavy holders (sized relative to everyone else's final balance) -------
  const smallTotal = [...holdings.values()].reduce((a, b) => a + (b > 0n ? b : 0n), 0n);
  const heavy = spec.heavy ?? [{ label: "deployer", share: 0.025, via: "allocation" as const }];
  const heavySum = heavy.reduce((a, h) => a + h.share, 0);
  const circ = Number(smallTotal / 10n ** 12n) / 1e6 / (1 - heavySum);
  for (const h of heavy) {
    const w = h.label === "deployer" ? deployer : addr(`${spec.key}:heavy:${h.label}`);
    const tokens = toUnits(circ * h.share);
    if (h.label === "deployer") fund(w, CEX[0], launch - 200_000, 5);
    else fund(w, addr(`${spec.key}:funder:heavy:${h.label}`), launch + R.int(1_000, 600_000), 20);
    if (h.label !== "deployer") fund(addr(`${spec.key}:funder:heavy:${h.label}`), R.pick(CEX), launch - R.int(10_000, 800_000), 25);
    nonces[w] = R.int(60, 900);
    if (h.via === "allocation") {
      actions.push({ sec: 2, kind: "alloc", wallet: w, tokens });
      hold(w, tokens);
    } else {
      const sec = R.between(0.1, 2.5) * 86400;
      buy(w, sec, (Number(tokens / 10n ** 12n) / 1e6) * price(sec), 0);
    }
  }
  nonces[deployer] ??= 120;

  // --- Emit chain data -----------------------------------------------------------
  const logs: RawLog[] = [];
  const perBlock = new Map<number, number>();
  const idxIn = (b: number) => { const n = perBlock.get(b) ?? 0; perBlock.set(b, n + 1); return n; };
  const base = (blockNumber: number, txHash: Hex, address: Address) => ({ chainId: CHAIN_ID, blockNumber, txHash, logIndex: idxIn(blockNumber), address });

  // Mint to pool, burn 1%.
  logs.push(encodeTransfer(base(launch, nextHash(), token), ZERO_ADDRESS, pool, SUPPLY));
  logs.push(encodeTransfer(base(launch + 1, nextHash(), token), pool, BURN_ADDRESS, SUPPLY / 100n));

  actions.sort((a, b) => a.sec - b.sec);
  for (const a of actions) {
    const block = blockOf(a.sec);
    const tx = nextHash();
    if (a.kind === "alloc") logs.push(encodeTransfer(base(block, tx, token), pool, a.wallet, a.tokens));
    else if (a.kind === "xfer") logs.push(encodeTransfer(base(block, tx, token), a.wallet, a.to!, a.tokens));
    else if (a.kind === "buy") {
      logs.push(encodeTransfer(base(block, tx, token), pool, a.wallet, a.tokens));
      logs.push(encodeSwap(base(block, tx, pool), a.wallet, true, a.tokens, usdUnits(a.usd!)));
    } else {
      logs.push(encodeTransfer(base(block, tx, token), a.wallet, pool, a.tokens));
      logs.push(encodeSwap(base(block, tx, pool), a.wallet, false, a.tokens, usdUnits(a.usd!)));
    }
  }

  const headBlock = launch + days * DAY_BLOCKS;
  const meta: TokenMeta = {
    address: token,
    chainId: CHAIN_ID,
    chainName: "Elysium Testnet",
    symbol: spec.symbol,
    name: spec.name,
    decimals: 18,
    launchBlock: launch,
    poolAddress: pool,
    deployer,
    quoteAsset: { symbol: "USDC", address: QUOTE_USDC, decimals: 6 },
    source: "fixture",
    summary: spec.summary,
    scenario: spec.scenario,
  };

  const truth: Dataset = { token: meta, headBlock, blockSeconds: BLOCK_SECONDS, launchTimestamp: LAUNCH_TS, logs, fundingTxs, nonces: { ...nonces } };
  const finalHolders = [...holdings.entries()].filter(([, v]) => v > 0n);
  const raw = finalHolders.length;
  const clusterWallets = new Set([...plantedClusters.flatMap((c) => c.wallets), ...friendsGroups.flat()]);
  const organicHolders = finalHolders.filter(([w]) => !clusterWallets.has(w as Address)).length;
  const friendClusters = friendsGroups.map((g, i) => ({ label: `friends-${i + 1}`, wallets: g }));
  const allClusters = [...plantedClusters, ...friendClusters];

  return {
    truth,
    trueNonces: { ...nonces },
    truthInfo: {
      scenario: spec.scenario,
      expectedVerdict: spec.expect,
      rawHolders: raw,
      organicHolders,
      plantedEffectiveHolders: organicHolders + allClusters.filter((c) => c.wallets.some((w) => (holdings.get(w) ?? 0n) > 0n)).length,
      plantedClusters: allClusters,
      plantedWashWallets: washWallets,
      plantedBundles,
    },
  };
}
