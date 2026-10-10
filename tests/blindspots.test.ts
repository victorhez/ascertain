import { describe, expect, it } from "vitest";
import { ZERO_ADDRESS, encodeSwap, encodeTransfer } from "@/chain/codec";
import { computeFindings } from "@/engine/analyze";
import { defaultConfig } from "@/engine/config";
import type { Address, Dataset, Hex, RawLog, RawTx } from "@/engine/types";

/** Tiny synthetic chains for the blind spots listed on /methodology. Each test records how the case is handled. */
const T = "0x00000000000000000000000000000000000000a1" as Address;
const P = "0x00000000000000000000000000000000000000b1" as Address;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const E18 = 10n ** 18n;

function chain(build: (c: { buy: (w: Address, tok: number, usd: number, block: number) => void; sell: (w: Address, tok: number, usd: number, block: number) => void; fund: (from: Address, to: Address, block: number) => void; nonce: (w: Address, n: number) => void }) => void): Dataset {
  const logs: RawLog[] = [];
  const txs: RawTx[] = [];
  const nonces: Record<string, number> = {};
  let i = 0;
  const base = (block: number, address: Address) => ({ chainId: 1, blockNumber: block, txHash: `0x${(++i).toString(16).padStart(64, "0")}` as Hex, logIndex: i, address });
  logs.push(encodeTransfer(base(1, T), ZERO_ADDRESS, P, 1_000_000_000n * E18));
  const trade = (isBuy: boolean) => (w: Address, tok: number, usd: number, block: number) => {
    const b = base(block, T);
    const amt = BigInt(tok) * E18;
    logs.push(isBuy ? encodeTransfer(b, P, w, amt) : encodeTransfer(b, w, P, amt));
    logs.push(encodeSwap({ ...b, address: P, logIndex: ++i }, w, isBuy, amt, BigInt(Math.round(usd * 1e6))));
  };
  build({
    buy: trade(true), sell: trade(false), nonce: (w, n) => (nonces[w] = n),
    fund: (from, to, block) => txs.push({ chainId: 1, hash: `0x${(++i).toString(16).padStart(64, "0")}` as Hex, blockNumber: block, from, to, value: "1000000000000000", input: "0x" }),
  });
  return {
    token: { address: T, chainId: 1, chainName: "test", symbol: "T", name: "T", decimals: 18, launchBlock: 1, poolAddress: P, deployer: addr(9), quoteAsset: { symbol: "USDC", address: addr(8), decimals: 6 }, source: "fixture", summary: "" },
    headBlock: 500_000, blockSeconds: 0.2, launchTimestamp: 0, logs, fundingTxs: txs, nonces,
  };
}
const find = (ds: Dataset, s: string) => computeFindings(ds, defaultConfig).findings.find((f) => f.signal === s)!.value;

describe("known blind spots: how each case is handled", () => {
  it("market maker trading varied sizes with a real net position is NOT flagged as wash", () => {
    const mm = addr(100);
    const ds = chain((c) => {
      c.nonce(mm, 5000);
      let b = 100;
      for (let k = 0; k < 20; k++) { c.buy(mm, 1000 + k * 37, 900 + k * 41, b += 50); c.sell(mm, 600 + k * 11, 520 + k * 13, b += 50); }
    });
    expect(find(ds, "wash_loops").washWalletCount).toBe(0);
  });

  it("a bot that trades exact-size round trips IS flagged (documented false positive, described neutrally)", () => {
    const bot = addr(101);
    const ds = chain((c) => { c.nonce(bot, 9000); for (let k = 0; k < 8; k++) { c.buy(bot, 2_000_000, 1500, 100 + k * 400); c.sell(bot, 2_000_000, 1500, 105 + k * 400); } });
    const v = find(ds, "wash_loops");
    expect(v.washWalletCount).toBe(1);
    expect(v.loops[0].type).toBe("pool_round_trip");
  });

  it("a new exchange hot wallet over-links unrelated wallets until it is added to the ignored-funder list", () => {
    const hot = addr(500);
    const ds = chain((c) => { for (let k = 0; k < 15; k++) { const w = addr(1000 + k); c.fund(hot, w, 10); c.buy(w, 1000 + k, 100 + k, 100 + k * 90); c.nonce(w, 50); } });
    expect(find(ds, "funding_clusters").clusterCount).toBe(1);
    const handled = { ...ds, ignoredFunders: [hot] };
    expect(find(handled, "funding_clusters").clusterCount).toBe(0);
  });

  it("an airdrop cohort funded by one distributor is clustered (documented; shown as linked, not malicious)", () => {
    const dist = addr(501);
    const ds = chain((c) => { for (let k = 0; k < 12; k++) { const w = addr(2000 + k); c.fund(dist, w, 10); c.buy(w, 1000, 100, 100 + k * 90); c.nonce(w, 40); } });
    const v = find(ds, "funding_clusters");
    expect(v.clusterCount).toBe(1);
    expect(v.clusters[0].reason).toBe("linked by funding source");
  });

  it("smart-contract wallets with a zero nonce are counted as fresh (documented limitation)", () => {
    const ds = chain((c) => { for (let k = 0; k < 10; k++) { const w = addr(3000 + k); c.fund(addr(600 + k), w, 10); c.buy(w, 1000, 100, 100 + k * 90); c.nonce(w, 0); } });
    expect(find(ds, "wallet_age").freshShare).toBe(1);
  });

  it("wallets that enter in one block with very different sizes are NOT a bundle", () => {
    const ds = chain((c) => { for (let k = 0; k < 8; k++) { const w = addr(4000 + k); c.buy(w, 1000 * (k + 1), 50 * (k + 1) ** 2, 200); c.nonce(w, 30); } });
    expect(find(ds, "same_block_entry").bundleCount).toBe(0);
  });
});
