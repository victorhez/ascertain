// Plants three mock Ascend-style launches on Elysium testnet (chain 99801) and snapshots them for Ascertain.
//
//   DEPLOYER_PRIVATE_KEY in .env.local (funded with testnet HYPE), then:
//   npm run plant              # all three: LUMT (clean), WAVT (wash-traded), MIRT (clustered)
//   ONLY=LUMT npm run plant    # one scenario
//
// What it does, per launch: compile + deploy MockToken and MockPool, fund wallets through real funding trees,
// trade through the pool, then read everything back from chain into data/testnet/<SYMBOL>.json.
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import solc from "solc";
import {
  createPublicClient, createWalletClient, defineChain, encodeDeployData, encodeFunctionData, http, keccak256, toBytes, parseEther, formatEther, maxUint256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildLedger } from "../src/engine/ledger";
import { rng } from "../src/fixtures/generate";
import { SWAP_TOPIC, TRANSFER_TOPIC, lc } from "../src/chain/codec";
import type { Address, Dataset, Hex, RawLog, RawTx } from "../src/engine/types";

config({ path: ".env.local" });
const RPC = process.env.ELYSIUM_RPC_URL || "https://testnet-rpc.elysium.kinetiq.xyz";
const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!pk) throw new Error("Set DEPLOYER_PRIVATE_KEY in .env.local");

const chain = defineChain({ id: 99801, name: "Elysium Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const deployer = privateKeyToAccount(pk.startsWith("0x") ? pk : (`0x${pk}` as Hex));
const dw = createWalletClient({ account: deployer, chain, transport: http(RPC) });

/* ---------------------------------------------------------------- compile */
const src = (f: string) => readFileSync(`contracts/src/${f}`, "utf8");
const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "MockToken.sol": { content: src("MockToken.sol") }, "MockPool.sol": { content: src("MockPool.sol") } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
}))) as any;
for (const e of out.errors ?? []) if (e.severity === "error") throw new Error(e.formattedMessage);
const tokenArt = out.contracts["MockToken.sol"].MockToken;
const poolArt = out.contracts["MockPool.sol"].MockPool;
const tokenBytecode = `0x${tokenArt.evm.bytecode.object}` as Hex;
const poolBytecode = `0x${poolArt.evm.bytecode.object}` as Hex;
console.log("compiled MockToken + MockPool with solc", solc.version());

/* ---------------------------------------------------------------- tx plumbing */
let dnonce = await pub.getTransactionCount({ address: deployer.address, blockTag: "pending" });
const pending: { hash: Hex; what: string }[] = [];
const wnonce = new Map<string, number>();

async function flush() {
  const batch = pending.splice(0);
  await Promise.all(batch.map(async (p) => {
    const r = await pub.waitForTransactionReceipt({ hash: p.hash, timeout: 120_000 });
    if (r.status !== "success") console.warn(`  ! reverted: ${p.what} ${p.hash}`);
  }));
}

let lastSend = 0;
async function throttle() {
  const wait = lastSend + 150 - Date.now();
  lastSend = Math.max(Date.now(), lastSend) + (wait > 0 ? 150 : 0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    await throttle();
    try { return await fn(); } catch (e) {
      if (i < 8 && /rate limit/i.test((e as Error).message)) { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); continue; }
      throw e;
    }
  }
}

async function dsend(to: Address | undefined, data: Hex | undefined, value: bigint | undefined, gas: bigint, what: string) {
  const nonce = dnonce++;
  const hash = await retry(() => dw.sendTransaction({ to, data, value, gas, nonce } as any));
  pending.push({ hash, what });
  return hash;
}

const accountFor = (label: string) => privateKeyToAccount(keccak256(toBytes(`ascertain-testnet:${process.env.SALT ?? ""}${label}`)));
async function wsend(acct: ReturnType<typeof accountFor>, to: Address, data: Hex | undefined, value: bigint | undefined, gas: bigint, what: string) {
  const n = wnonce.get(acct.address) ?? 0;
  wnonce.set(acct.address, n + 1);
  const w = createWalletClient({ account: acct, chain, transport: http(RPC) });
  const hash = await retry(() => w.sendTransaction({ to, data, value, gas, nonce: n } as any));
  pending.push({ hash, what });
  return hash;
}

const GAS = { transfer: 21_000n, call: 200_000n, approve: 80_000n };
const SUPPLY = 1_000_000_000n * 10n ** 18n;
const FUND = parseEther("0.00006");
const FUNDER = parseEther("0.0004");

/* ---------------------------------------------------------------- scenarios */
interface Spec { sym: string; name: string; scenario: string; summary: string; priceE6: number; organic: number; friends?: number; wash?: { wallets: number; funders: number; trips: number; cycles: number }; sybil?: number[]; expect: string }
const SPECS: Spec[] = [
  { sym: "LUMT", name: "Lumen Testnet", scenario: "clean", summary: "On-chain mock launch: wide holder base, varied sizes, one small family group.", priceE6: 700, organic: 45, friends: 1, expect: "GO" },
  { sym: "WAVT", name: "Wavecrest Testnet", scenario: "wash-traded", summary: "On-chain mock launch: six wallets round-trip the pool and cycle tokens between themselves.", priceE6: 400, organic: 25, wash: { wallets: 6, funders: 2, trips: 8, cycles: 2 }, expect: "NO-GO" },
  { sym: "MIRT", name: "Mirage Testnet", scenario: "sybil-clustered", summary: "On-chain mock launch: most holders trace to three root funders via hub wallets.", priceE6: 400, organic: 6, sybil: [24, 16, 10], expect: "NO-GO" },
];

async function plant(s: Spec) {
  console.log(`\n=== ${s.sym} (${s.scenario}) ===`);
  const R = rng(`ascertain-testnet/${s.sym}`);
  const hype = (x: number) => parseEther(x.toFixed(9));
  const tok = (usd: number) => BigInt(Math.round((usd / (s.priceE6 / 1e6)) * 1e4)) * 10n ** 14n;

  // A. deploy
  const tokenHash = await dsend(undefined, encodeDeployData({ abi: tokenArt.abi, bytecode: tokenBytecode, args: [s.name, s.sym, deployer.address, SUPPLY] }), undefined, 1_500_000n, "deploy token");
  await flush();
  const token = (await pub.getTransactionReceipt({ hash: tokenHash })).contractAddress!;
  const poolHash = await dsend(undefined, encodeDeployData({ abi: poolArt.abi, bytecode: poolBytecode, args: [token, BigInt(s.priceE6)] }), undefined, 1_200_000n, "deploy pool");
  await flush();
  const pool = (await pub.getTransactionReceipt({ hash: poolHash })).contractAddress!;
  await dsend(token, encodeFunctionData({ abi: tokenArt.abi, functionName: "transfer", args: [pool, SUPPLY] }), undefined, 120_000n, "supply to pool");
  await flush();
  const deployBlock = Number((await pub.getTransactionReceipt({ hash: tokenHash })).blockNumber);
  console.log("token", token, "pool", pool, "block", deployBlock);

  // B. wallets and funding trees
  type W = { acct: ReturnType<typeof accountFor>; role: string; group?: string; usd: number };
  const wallets: W[] = [];
  const fundingHashes: Hex[] = [];
  const funderOf = new Map<string, ReturnType<typeof accountFor>>();
  const level1: { to: Address; value: bigint }[] = [];   // deployer -> funders / direct wallets
  const level2: { from: ReturnType<typeof accountFor>; to: Address }[] = []; // funder -> wallet
  const plantedClusters: { label: string; wallets: Address[] }[] = [];
  const plantedWash: Address[] = [];

  const mkOrganic = (i: number, funderLabel?: string, group?: string) => {
    const acct = accountFor(`${s.sym}:org:${i}`);
    wallets.push({ acct, role: "organic", group, usd: Math.min(1400, 350 * R.lognormal(0.7)) });
    if (funderLabel) {
      const f = accountFor(`${s.sym}:funder:${funderLabel}`);
      if (!funderOf.has(f.address)) level1.push({ to: f.address, value: FUNDER });
      funderOf.set(f.address, f);
      level2.push({ from: f, to: acct.address });
    } else level1.push({ to: acct.address, value: FUND });
    return acct;
  };
  let oi = 0;
  const friendsWallets: Address[] = [];
  for (let g = 0; g < (s.friends ?? 0); g++) for (let m = 0; m < 3; m++) friendsWallets.push(mkOrganic(oi++, `friends${g}`, `friends${g}`).address);
  if (friendsWallets.length) plantedClusters.push({ label: "friends-1", wallets: friendsWallets });
  for (; oi < s.organic; oi++) mkOrganic(oi, R.next() < 0.55 ? `solo${oi}` : undefined);

  const sybilGroups: { root: ReturnType<typeof accountFor>; hubs: ReturnType<typeof accountFor>[]; members: W[] }[] = [];
  (s.sybil ?? []).forEach((size, k) => {
    const root = accountFor(`${s.sym}:root:${k}`);
    level1.push({ to: root.address, value: parseEther("0.003") });
    const hubs = Array.from({ length: Math.ceil(size / 12) }, (_, h) => accountFor(`${s.sym}:hub:${k}:${h}`));
    const members: W[] = Array.from({ length: size }, (_, i) => ({ acct: accountFor(`${s.sym}:sybil:${k}:${i}`), role: "sybil", group: `sybil${k}`, usd: R.between(40, 70) }));
    sybilGroups.push({ root, hubs, members });
    wallets.push(...members);
    plantedClusters.push({ label: `sybil-cluster-${k + 1}`, wallets: members.map((m) => m.acct.address) });
  });

  const washW: W[] = [];
  const washFunders: ReturnType<typeof accountFor>[] = [];
  if (s.wash) {
    for (let f = 0; f < s.wash.funders; f++) {
      const fa = accountFor(`${s.sym}:washfunder:${f}`);
      washFunders.push(fa);
      level1.push({ to: fa.address, value: FUNDER });
    }
    for (let i = 0; i < s.wash.wallets; i++) {
      const w: W = { acct: accountFor(`${s.sym}:wash:${i}`), role: "wash", group: `wash${i % s.wash.funders}`, usd: 0 };
      washW.push(w);
      level2.push({ from: washFunders[i % s.wash.funders], to: w.acct.address });
      plantedWash.push(w.acct.address);
    }
    for (let f = 0; f < s.wash.funders; f++) plantedClusters.push({ label: `wash-funding-group-${f + 1}`, wallets: washW.filter((_, i) => i % s.wash!.funders === f).map((w) => w.acct.address) });
  }

  // level 1: deployer funds funders / roots / direct wallets
  for (const l of level1) fundingHashes.push(await dsend(l.to, undefined, l.value, GAS.transfer, "fund L1"));
  await flush();
  // level 2: funders fund wallets (and sybil roots fund hubs)
  for (const l of level2) fundingHashes.push(await wsend(l.from, l.to, undefined, FUND, GAS.transfer, "fund L2"));
  for (const g of sybilGroups) for (const h of g.hubs) fundingHashes.push(await wsend(g.root, h.address, undefined, parseEther("0.001"), GAS.transfer, "root->hub"));
  await flush();
  // level 3: hubs fund sybils
  // One account's txs must be sent in nonce order, so each hub sends sequentially; hubs run in parallel.
  await Promise.all(sybilGroups.flatMap((g) => g.hubs.map(async (hub, hi) => {
    for (const m of g.members.filter((_, i) => i % g.hubs.length === hi)) fundingHashes.push(await wsend(hub, m.acct.address, undefined, FUND, GAS.transfer, "hub->sybil"));
  })));
  await flush();
  console.log("funding done:", fundingHashes.length, "txs");

  // C. wallet prep: approve the pool, and give organic wallets some history so they are not "fresh"
  const approve = encodeFunctionData({ abi: tokenArt.abi, functionName: "approve", args: [pool, maxUint256] });
  const all = [...wallets, ...washW];
  for (const w of all) {
    await wsend(w.acct, token, approve, undefined, GAS.approve, "approve");
    if (w.role === "organic") for (let k = 0; k < 4; k++) await wsend(w.acct, w.acct.address, undefined, 0n, GAS.transfer, "history");
  }
  await flush();

  // D. trades through the pool (operator = deployer)
  const buyData = (to: Address, amt: bigint) => encodeFunctionData({ abi: poolArt.abi, functionName: "buy", args: [to, amt] });
  const sellData = (from: Address, amt: bigint) => encodeFunctionData({ abi: poolArt.abi, functionName: "sell", args: [from, amt] });
  const holdings = new Map<string, bigint>();
  const add = (a: string, d: bigint) => holdings.set(a, (holdings.get(a) ?? 0n) + d);

  for (const w of wallets.filter((x) => x.role === "organic")) { const t = tok(w.usd); await dsend(pool, buyData(w.acct.address, t), undefined, GAS.call, "buy"); add(w.acct.address, t); }
  for (const g of sybilGroups) for (const m of g.members) { const t = tok(m.usd * (1 + R.between(-0.01, 0.01))); await dsend(pool, buyData(m.acct.address, t), undefined, GAS.call, "sybil buy"); add(m.acct.address, t); }
  await flush();
  // organic churn: some wallets sell a slice
  for (const w of wallets.filter((x) => x.role === "organic" && R.next() < 0.4)) {
    const h = holdings.get(w.acct.address)!;
    const t = (h * BigInt(Math.round(R.between(15, 45)))) / 100n;
    await dsend(pool, sellData(w.acct.address, t), undefined, GAS.call, "sell");
    add(w.acct.address, -t);
  }
  await flush();

  if (s.wash) {
    for (const w of washW) {
      for (let t = 0; t < s.wash.trips; t++) {
        const amt = tok(R.between(900, 1900));
        await dsend(pool, buyData(w.acct.address, amt), undefined, GAS.call, "wash buy");
        await dsend(pool, sellData(w.acct.address, amt), undefined, GAS.call, "wash sell");
      }
    }
    await flush();
    for (let c = 0; c < s.wash.cycles; c++) {
      const g = washW.slice(c * 3, c * 3 + 3);
      const amt = tok(R.between(900, 1900));
      await dsend(pool, buyData(g[0].acct.address, amt), undefined, GAS.call, "cycle buy");
      await flush();
      const xfer = (to: Address) => encodeFunctionData({ abi: tokenArt.abi, functionName: "transfer", args: [to, amt] });
      await wsend(g[0].acct, token, xfer(g[1].acct.address), undefined, 80_000n, "cycle 1"); await flush();
      await wsend(g[1].acct, token, xfer(g[2].acct.address), undefined, 80_000n, "cycle 2"); await flush();
      await wsend(g[2].acct, token, xfer(g[0].acct.address), undefined, 80_000n, "cycle 3"); await flush();
      await dsend(pool, sellData(g[0].acct.address, amt), undefined, GAS.call, "cycle sell");
      await flush();
    }
  }
  console.log("trading done");

  // E. read everything back from chain
  const head = await pub.getBlockNumber();
  const toLog = (l: any): RawLog => ({ chainId: 99801, blockNumber: Number(l.blockNumber), txHash: l.transactionHash, logIndex: l.logIndex, address: lc(l.address), topics: [...l.topics] as Hex[], data: l.data });
  const getAll = async (address: Address, topic: Hex) => {
    const rows: RawLog[] = [];
    for (let b = BigInt(deployBlock); b <= head; b += 20_000n) {
      const ls = await pub.request({ method: "eth_getLogs", params: [{ address, topics: [topic], fromBlock: `0x${b.toString(16)}`, toBlock: `0x${(b + 19_999n > head ? head : b + 19_999n).toString(16)}` }] }) as any[];
      rows.push(...ls.map((l) => toLog({ ...l, blockNumber: BigInt(l.blockNumber), logIndex: Number(l.logIndex) })));
    }
    return rows;
  };
  const logs = [...(await getAll(token, TRANSFER_TOPIC)), ...(await getAll(pool, SWAP_TOPIC))];
  const lastBlock = Math.max(...logs.map((l) => l.blockNumber)) + 1;
  const fundingTxs: RawTx[] = [];
  for (const h of fundingHashes) {
    const t = await pub.getTransaction({ hash: h });
    fundingTxs.push({ chainId: 99801, hash: h, blockNumber: Number(t.blockNumber), from: lc(t.from), to: lc(t.to!), value: t.value.toString(), input: t.input });
  }
  const nonces: Record<string, number> = {};
  for (const w of all) nonces[lc(w.acct.address)] = await pub.getTransactionCount({ address: w.acct.address });
  nonces[lc(deployer.address)] = await pub.getTransactionCount({ address: deployer.address });
  const b0 = await pub.getBlock({ blockNumber: BigInt(deployBlock) });
  const b1 = await pub.getBlock({ blockNumber: head });
  const blockSeconds = Math.max(0.05, Number(b1.timestamp - b0.timestamp) / Math.max(1, Number(head) - deployBlock));

  const ds: Dataset = {
    token: { address: lc(token), chainId: 99801, chainName: "Elysium Testnet", symbol: s.sym, name: s.name, decimals: 18, launchBlock: deployBlock, poolAddress: lc(pool), deployer: lc(deployer.address), quoteAsset: { symbol: "USDC", address: "0x00000000000000000000000000000000005d0c01", decimals: 6 }, source: "rpc", onchain: true, summary: s.summary, scenario: s.scenario },
    headBlock: lastBlock, blockSeconds, launchTimestamp: Number(b0.timestamp), logs, fundingTxs, nonces,
    ignoredFunders: [lc(deployer.address)], profile: "testnet-scale",
  };
  const L = buildLedger(ds);
  const clusterSet = new Set(plantedClusters.flatMap((c) => c.wallets.map(lc)));
  const organicHolders = L.holders.filter((h) => !clusterSet.has(h.address)).length;
  const info = {
    scenario: s.scenario, expectedVerdict: s.expect, rawHolders: L.holders.length, organicHolders,
    plantedEffectiveHolders: organicHolders + plantedClusters.filter((c) => c.wallets.some((w) => (L.balances.get(lc(w)) ?? 0n) > 0n)).length,
    plantedClusters: plantedClusters.map((c) => ({ ...c, wallets: c.wallets.map(lc) })), plantedWashWallets: plantedWash.map(lc), plantedBundles: [],
  };
  mkdirSync("data/testnet", { recursive: true });
  writeFileSync(`data/testnet/${s.sym}.json`, JSON.stringify({ dataset: ds, info, plantedAt: new Date().toISOString(), rpc: RPC }, null, 1));
  console.log(`wrote data/testnet/${s.sym}.json  logs=${logs.length} holders=${L.holders.length} funding=${fundingTxs.length}`);
  console.log(`explorer: https://elysium.kinetiq.xyz/address/${token}`);
}

const bal0 = await pub.getBalance({ address: deployer.address });
console.log("deployer", deployer.address, "balance", formatEther(bal0), "HYPE");
for (const s of SPECS) if (!process.env.ONLY || process.env.ONLY === s.sym) await plant(s);
console.log("remaining balance", formatEther(await pub.getBalance({ address: deployer.address })), "HYPE");
