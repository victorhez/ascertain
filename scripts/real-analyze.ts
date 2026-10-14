// Step 2 of real-token replay: build a dataset from the downloaded transfers, look up first funding and nonces for the
// top-K holders, classify infrastructure, run the engine, and record verification receipts against the chain.
//   TOKEN=HWAVE npx tsx scripts/real-analyze.ts
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { RecordingSource } from "../src/chain/cached";
import { BURN_ADDRESS as BURN, ZERO_ADDRESS as ZERO, callBalanceOf, encodeTransfer, lc } from "../src/chain/codec";
import { RpcSource } from "../src/chain/live";
import { computeFindings } from "../src/engine/analyze";
import { configFor } from "../src/engine/config";
import { buildLedger } from "../src/engine/ledger";
import { verifyFindings } from "../src/engine/verifier";
import type { Address, Dataset, Hex, RawLog, RawTx } from "../src/engine/types";
import { REAL_TOKENS } from "../src/real/tokens";

config({ path: ".env.local" });
const RPC = process.env.HYPEREVM_RPC_URL!;
const TOP_K = Number(process.env.TOP_K ?? 1000);
const UNATTRIBUTED = "0x000000000000000000000000000000000000beef";
const SYSTEM_FUNDERS = ["0x2222222222222222222222222222222222222222", "0x0000000000000000000000000000000000000000"];
const client = createPublicClient({ transport: http(RPC, { timeout: 20000, retryCount: 4, retryDelay: 800 }) });

async function rpc(method: string, params: unknown[]) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = (await r.json()) as { result?: any; error?: { message: string } };
      if (j.result !== undefined) return j.result;
      if (i < 10 && /rate|limit|429|capacity/i.test(j.error?.message ?? "")) { await new Promise((s) => setTimeout(s, 700 * (i + 1))); continue; }
      throw new Error(j.error?.message ?? "rpc error");
    } catch (e) {
      if (i < 10 && /JSON|fetch|network|ECONN|timeout/i.test((e as Error).message)) { await new Promise((s) => setTimeout(s, 900 * (i + 1))); continue; }
      throw e;
    }
  }
}
async function mapLimit<T, R>(xs: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const k = i++; out[k] = await fn(xs[k], k); } }));
  return out;
}
const load = <T,>(f: string, d: T): T => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);

const which = process.env.TOKEN;
for (const t of REAL_TOKENS.filter((x) => !which || x.symbol === which)) {
  console.log(`\n=== ${t.symbol} ===`);
  const tf = load<{ done: boolean; rows: [number, string, string, string, string][] }>(`data/real/${t.symbol}.transfers.json`, { done: false, rows: [] });
  if (!tf.done) { console.log("transfers incomplete, skipping"); continue; }
  const perBlock = new Map<number, number>();
  const logs: RawLog[] = tf.rows.map(([block, hash, from, to, val]) => {
    const idx = perBlock.get(block) ?? 0;
    perBlock.set(block, idx + 1);
    return encodeTransfer({ chainId: 999, blockNumber: block, txHash: hash as Hex, logIndex: idx, address: lc(t.address) }, from, to, BigInt(val));
  });
  const S = logs.reduce((m, l) => Math.max(m, l.blockNumber), 0);
  const erc = parseAbi(["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"]);
  const decimals = Number(await client.readContract({ address: t.address, abi: erc, functionName: "decimals" }));
  const name = await client.readContract({ address: t.address, abi: erc, functionName: "name" }).catch(() => t.name);

  const base: Dataset = {
    token: { address: lc(t.address), chainId: 999, chainName: "HyperEVM", symbol: t.symbol, name: String(name), decimals, launchBlock: t.launchBlock, poolAddress: lc(t.pool), deployer: "0x0000000000000000000000000000000000000000", quoteAsset: { symbol: "n/a", address: lc(t.address), decimals: 6 }, source: "rpc", real: true, summary: t.note, scenario: "real" },
    headBlock: S, blockSeconds: 1, launchTimestamp: 0, logs, fundingTxs: [], nonces: {}, partial: "holder-integrity only", excludedHolders: [],
  };

  // 0. Alchemy's transfer index misses some system-originated transfers (HyperCore bridging), so balances for the
  // top candidates are read from chain state at the snapshot block and override the log-derived ledger.
  let L = buildLedger(base);
  console.log("transfers", logs.length, "holders (log-derived)", L.holders.length, "snapshot block", S);
  const blk = "0x" + S.toString(16);
  const cand = new Set<string>([...L.holders.slice(0, 1200).map((h) => h.address), lc(t.pool), BURN, "0x2222222222222222222222222222222222222222"]);
  const chainBal = new Map<string, bigint>();
  await mapLimit([...cand], 6, async (a) => { chainBal.set(a, BigInt(await rpc("eth_call", [{ to: t.address, data: callBalanceOf(a) }, blk]))); });
  const supply = BigInt(await rpc("eth_call", [{ to: t.address, data: "0x18160ddd" }, blk]));
  let corrected = 0;
  const final = new Map<string, bigint>();
  for (const [a, v] of L.balances) if (v > 0n) final.set(a, v);
  for (const [a, v] of chainBal) { if ((final.get(a) ?? 0n) !== v) corrected++; if (v > 0n) final.set(a, v); else final.delete(a); }
  let sum = 0n;
  for (const v of final.values()) sum += v;
  const residual = supply - sum;
  let n0 = 0;
  const snap: RawLog[] = [];
  const mint = (to: string, amt: bigint) => snap.push(encodeTransfer({ chainId: 999, blockNumber: S, txHash: `0x${(++n0).toString(16).padStart(64, "0")}` as Hex, logIndex: n0, address: lc(t.address) }, ZERO, to, amt));
  for (const [a, v] of final) mint(a, v);
  if (residual > 0n) mint(UNATTRIBUTED, residual);
  base.logs = snap;
  base.excludedHolders = [UNATTRIBUTED];
  L = buildLedger(base);
  console.log("balances corrected from chain:", corrected, "of", cand.size, "| unattributed supply:", Number((residual * 10000n) / supply) / 100, "%", "| holders", L.holders.length);

  // 1. classify contract holders among the top 200 as infrastructure
  const top200 = L.holders.slice(0, 200).map((h) => h.address);
  const code = await mapLimit(top200, 4, (a) => rpc("eth_getCode", [a, "latest"]) as Promise<string>);
  const contracts = top200.filter((_, i) => code[i] && code[i] !== "0x");
  // HyperCore spot-token system addresses (0x20000...<index>) escrow bridged supply; they are protocol plumbing, not holders.
  const systemHolders = L.holders.filter((h) => /^0x2000000000000000000000000000/.test(h.address)).map((h) => h.address);
  base.excludedHolders = [UNATTRIBUTED, ...contracts, ...systemHolders];
  L = buildLedger(base);
  console.log("contract holders excluded as infrastructure:", contracts.length, "| HyperCore system addresses:", systemHolders.length);

  // 2. funding + nonces for the top-K holders
  const universe = L.holders.slice(0, TOP_K).map((h) => h.address);
  base.analysisUniverse = universe;
  const fFile = `data/real/${t.symbol}.funding.json`;
  const fund = load<Record<string, RawTx | null>>(fFile, {});
  let done = 0;
  await mapLimit(universe.filter((a) => !(a in fund)), 4, async (a) => {
    try {
      const res = await rpc("alchemy_getAssetTransfers", [{ toAddress: a, category: ["external"], order: "asc", maxCount: "0x1", fromBlock: "0x0" }]);
      const x = res.transfers[0];
      if (!x) { fund[a] = null; return; }
      const tx = await rpc("eth_getTransactionByHash", [x.hash]);
      fund[a] = tx && lc(tx.to) === a ? { chainId: 999, hash: tx.hash, blockNumber: parseInt(tx.blockNumber, 16), from: lc(tx.from), to: lc(tx.to), value: BigInt(tx.value).toString(), input: tx.input } : null;
    } catch { fund[a] = null; }
    if (++done % 100 === 0) { writeFileSync(fFile, JSON.stringify(fund)); console.log("  funding", done); }
  });
  writeFileSync(fFile, JSON.stringify(fund));
  const nFile = `data/real/${t.symbol}.nonces.json`;
  const nonces = load<Record<string, number>>(nFile, {});
  await mapLimit(universe.filter((a) => !(a in nonces)), 6, async (a) => { nonces[a] = parseInt(await rpc("eth_getTransactionCount", [a, "0x" + S.toString(16)]), 16); });
  writeFileSync(nFile, JSON.stringify(nonces));
  base.fundingTxs = Object.values(fund).filter(Boolean) as RawTx[];
  base.nonces = nonces;

  // 3. classify root funders: contracts and very busy accounts are infrastructure, not people
  const cfg = configFor();
  const infra: { address: string; reason: string }[] = SYSTEM_FUNDERS.map((a) => ({ address: a, reason: "system address" }));
  const known = new Set(infra.map((i) => i.address));
  const info = new Map<string, { contract: boolean; nonce: number }>();
  for (let round = 0; round < 4; round++) {
    base.ignoredFunders = [...known];
    const { clu } = computeFindings(base, cfg);
    const roots = clu.clusters.map((c) => c.root).filter((r) => !known.has(r));
    if (!roots.length) break;
    await mapLimit(roots, 4, async (r) => {
      if (info.has(r)) return;
      const [c, n] = await Promise.all([rpc("eth_getCode", [r, "latest"]), rpc("eth_getTransactionCount", [r, "latest"])]);
      info.set(r, { contract: c !== "0x", nonce: parseInt(n, 16) });
    });
    let added = 0;
    for (const r of roots) {
      const i = info.get(r)!;
      if (i.contract || i.nonce > 20000) { known.add(r); infra.push({ address: r, reason: i.contract ? "contract" : `very busy account (nonce ${i.nonce})` }); added++; }
    }
    if (!added) break;
  }
  base.ignoredFunders = [...known];

  // 4. engine + verification receipts recorded at the snapshot block
  const { findings, clu } = computeFindings(base, cfg);
  const rec = new RecordingSource(new RpcSource(999, RPC, "HyperEVM RPC (Alchemy; same provider as indexer)"), RPC.replace(/\/v2\/.*/, "/v2/<key>"));
  const verified = await verifyFindings(findings, rec, { 999: RPC.replace(/\/v2\/.*/, "/v2/<key>") });
  console.log(verified.map((f) => `${f.signal}:${f.status}`).join(" "));
  for (const f of verified.filter((x) => x.status === "withheld")) console.log("  withheld", f.signal, f.withheldReason?.slice(0, 160));
  rec.rec.rpc = "https://hyperliquid-mainnet.g.alchemy.com";

  const flags = clu.clusters.map((c) => ({
    id: c.id, size: c.wallets.length, root: c.root, hops: c.hops,
    rootInfo: info.get(c.root) ?? null,
    rootLink: `https://hypurrscan.io/address/${c.root}`,
    sampleWallets: c.wallets.slice(0, 5).map((w) => ({ wallet: w, link: `https://hypurrscan.io/address/${w}`, firstFundingTx: fund[w]?.hash ? `https://hypurrscan.io/tx/${fund[w]!.hash}` : null })),
    wallets: c.wallets,
    signature: (() => {
      const vals = c.wallets.map((w) => Number(BigInt(fund[w]?.value ?? "0") / 10n ** 12n) / 1e6).filter((x) => x > 0);
      const blocks = c.wallets.map((w) => fund[w]?.blockNumber ?? 0).filter(Boolean);
      const bals = c.wallets.map((w) => Number((L.balances.get(w) ?? 0n) / 10n ** 15n) / 1e3);
      const circ = L.circulatingTokens || 1;
      return {
        fundedAmountHYPE: vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : null,
        fundingBlockSpread: blocks.length ? Math.max(...blocks) - Math.min(...blocks) : null,
        tokenBalanceRange: { min: Math.min(...bals), max: Math.max(...bals) },
        shareOfCirculating: bals.reduce((a, b) => a + b, 0) / circ,
        withNonceUnder5: c.wallets.filter((w) => (nonces[w] ?? 99) < 5).length,
      };
    })(),
    handCheck: "pending",
  }));
  mkdirSync("evidence/real", { recursive: true });
  const snapshot = base.logs;
  const dataset = { ...base, logs: snapshot };
  writeFileSync(`data/real/${t.symbol}.dataset.json`, JSON.stringify({ dataset, report: { infra, flags, topK: TOP_K, holders: L.holders.length, snapshotBlock: S, transfers: logs.length, contractsExcluded: [...contracts, ...systemHolders], balancesCorrectedFromChain: corrected, unattributedSharePct: Number((residual * 10000n) / supply) / 100 } }));
  writeFileSync(`data/real/${t.symbol}.fetches.json`, JSON.stringify(rec.rec));
  writeFileSync(`evidence/real/${t.symbol}-flags.json`, JSON.stringify({ token: t, snapshotBlock: S, holdersTotal: L.holders.length, analyzedTopHolders: universe.length, infra, flags }, null, 2));
  console.log(`clusters flagged: ${flags.length}; infra ignored: ${infra.length}; wrote data/real/${t.symbol}.dataset.json`);
}
