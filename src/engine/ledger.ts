import { BURN_ADDRESS, ZERO_ADDRESS, decodeSwap, decodeTransfer, lc, scaled } from "@/chain/codec";
import type { Address, Dataset, RawTx, Swap, Transfer } from "./types";

export interface Holder { address: Address; balance: bigint; tokens: number }

export interface Ledger {
  ds: Dataset;
  pool: Address;
  transfers: Transfer[];
  swaps: Swap[];
  balances: Map<string, bigint>;
  totalSupply: bigint;
  poolBalance: bigint;
  burnBalance: bigint;
  holders: Holder[]; // desc by balance, excludes pool/burn/zero
  circulatingTokens: number;
  firstBuy: Map<string, Swap>;
  firstFunding: Map<string, RawTx>;
  txsByTo: Map<string, RawTx[]>;
  wallets: Set<string>; // every non-infrastructure wallet seen trading or holding
}

export function buildLedger(ds: Dataset): Ledger {
  const dec = ds.token.decimals;
  const qdec = ds.token.quoteAsset.decimals;
  const pool = lc(ds.token.poolAddress);
  const tokenAddr = lc(ds.token.address);

  const transfers: Transfer[] = [];
  const swaps: Swap[] = [];
  for (const l of ds.logs) {
    if (lc(l.address) === tokenAddr) {
      const t = decodeTransfer(l);
      if (t) transfers.push(t);
    } else if (lc(l.address) === pool) {
      const s = decodeSwap(l, dec, qdec);
      if (s) swaps.push(s);
    }
  }
  const order = (a: { blockNumber: number; logIndex: number }, b: { blockNumber: number; logIndex: number }) =>
    a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;
  transfers.sort(order);
  swaps.sort(order);

  const balances = new Map<string, bigint>();
  let totalSupply = 0n;
  for (const t of transfers) {
    if (t.from === ZERO_ADDRESS) totalSupply += t.amount;
    else balances.set(t.from, (balances.get(t.from) ?? 0n) - t.amount);
    if (t.to === ZERO_ADDRESS) totalSupply -= t.amount;
    else balances.set(t.to, (balances.get(t.to) ?? 0n) + t.amount);
  }

  const infra = new Set<string>([pool, BURN_ADDRESS, ZERO_ADDRESS, ...(ds.excludedHolders ?? []).map(lc)]);
  const holders: Holder[] = [];
  for (const [address, balance] of balances) {
    if (balance > 0n && !infra.has(address)) holders.push({ address: address as Address, balance, tokens: scaled(balance, dec) });
  }
  holders.sort((a, b) => (a.balance === b.balance ? a.address.localeCompare(b.address) : a.balance > b.balance ? -1 : 1));

  const firstBuy = new Map<string, Swap>();
  for (const s of swaps) if (s.side === "buy" && !firstBuy.has(s.trader)) firstBuy.set(s.trader, s);

  const firstFunding = new Map<string, RawTx>();
  const txsByTo = new Map<string, RawTx[]>();
  const sortedTxs = [...ds.fundingTxs].sort((a, b) => a.blockNumber - b.blockNumber || a.hash.localeCompare(b.hash));
  for (const t of sortedTxs) {
    const to = lc(t.to);
    if (BigInt(t.value) <= 0n) continue;
    if (!firstFunding.has(to)) firstFunding.set(to, t);
    const arr = txsByTo.get(to) ?? [];
    arr.push(t);
    txsByTo.set(to, arr);
  }

  const wallets = new Set<string>();
  for (const h of holders) wallets.add(h.address);
  for (const s of swaps) wallets.add(s.trader);
  for (const t of transfers) for (const a of [t.from, t.to]) if (!infra.has(a)) wallets.add(a);

  return {
    ds, pool, transfers, swaps, balances, totalSupply,
    poolBalance: balances.get(pool) ?? 0n,
    burnBalance: balances.get(BURN_ADDRESS) ?? 0n,
    holders,
    circulatingTokens: holders.reduce((a, h) => a + h.tokens, 0),
    firstBuy, firstFunding, txsByTo, wallets,
  };
}

/** Union-find over string keys. */
export class DSU {
  private p = new Map<string, string>();
  find(x: string): string {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r)!;
    let c = x;
    while (this.p.get(c) !== r) { const n = this.p.get(c)!; this.p.set(c, r); c = n; }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.p.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
}
