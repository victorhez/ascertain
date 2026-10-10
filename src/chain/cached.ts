import type { Address, Hex, RawLog, RawTx } from "@/engine/types";
import type { ChainSource } from "./source";

/** Everything a verification pass fetched from a real RPC, saved so the site can show it without hammering a public node. */
export interface Fetches {
  fetchedAt: string;
  rpc: string;
  logs: Record<string, RawLog | null>;
  txs: Record<string, RawTx | null>;
  calls: Record<string, Hex>;
  nonces: Record<string, number>;
}

export const emptyFetches = (rpc: string): Fetches => ({ fetchedAt: new Date().toISOString(), rpc, logs: {}, txs: {}, calls: {}, nonces: {} });

/** Wraps a live source and records every result. */
export class RecordingSource implements ChainSource {
  readonly id: string;
  readonly rec: Fetches;
  constructor(private inner: ChainSource, rpc: string) { this.id = inner.id; this.rec = emptyFetches(rpc); }
  async getLog(c: number, h: Hex, i: number) { const r = await this.inner.getLog(c, h, i); this.rec.logs[`${h}:${i}`] = r; return r; }
  async getTx(c: number, h: Hex) { const r = await this.inner.getTx(c, h); this.rec.txs[h] = r; return r; }
  async call(c: number, to: Address, d: Hex, b: number) { const r = await this.inner.call(c, to, d, b); this.rec.calls[`${to}:${d}`] = r; return r; }
  async nonce(c: number, a: Address, b: number) { const r = await this.inner.nonce(c, a, b); this.rec.nonces[a] = r; return r; }
}

/** Replays recorded RPC results. Honest label: shows when and where they were fetched. */
export class CachedSource implements ChainSource {
  readonly id: string;
  constructor(private f: Fetches, label: string) { this.id = `${label} · fetched ${f.fetchedAt.replace("T", " ").slice(0, 16)} UTC`; }
  async getLog(_c: number, h: Hex, i: number) { return this.f.logs[`${h}:${i}`] ?? null; }
  async getTx(_c: number, h: Hex) { return this.f.txs[h] ?? null; }
  async call(_c: number, to: Address, d: Hex) { const v = this.f.calls[`${to}:${d}`]; if (v === undefined) throw new Error("not recorded"); return v; }
  async nonce(_c: number, a: Address) { const v = this.f.nonces[a]; if (v === undefined) throw new Error("not recorded"); return v; }
}
