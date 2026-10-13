import { SEL_BALANCE_OF, SEL_TOTAL_SUPPLY, decodeTransfer, lc, word, ZERO_ADDRESS } from "@/chain/codec";
import type { ChainSource } from "@/chain/source";
import type { Address, Dataset, Hex, RawLog, RawTx, Transfer } from "@/engine/types";

/**
 * A simulated replica of the canonical (truth) chain state.
 * Plays the role of "RPC provider B" in the verifier.
 */
export class FixtureChain implements ChainSource {
  readonly id: string;
  private logs = new Map<string, RawLog>();
  private txs = new Map<string, RawTx>();
  private transfers: { t: Transfer; token: string }[] = [];

  constructor(truth: Dataset[], private nonces: Record<string, number>, id = "elysium-testnet · replica B (simulated replica)") {
    this.id = id;
    for (const ds of truth) {
      for (const l of ds.logs) {
        this.logs.set(`${l.txHash}:${l.logIndex}`, l);
        const t = decodeTransfer(l);
        if (t) this.transfers.push({ t, token: lc(l.address) });
      }
      for (const t of ds.fundingTxs) this.txs.set(t.hash, t);
    }
  }

  async getLog(_c: number, txHash: Hex, logIndex: number) { return this.logs.get(`${txHash}:${logIndex}`) ?? null; }
  async getTx(_c: number, hash: Hex) { return this.txs.get(hash) ?? null; }
  async nonce(_c: number, a: Address) { return this.nonces[lc(a)] ?? 0; }

  async call(_c: number, to: Address, data: Hex, block: number): Promise<Hex> {
    const token = lc(to);
    const sel = data.slice(0, 10);
    let supply = 0n;
    const bal = new Map<string, bigint>();
    for (const { t, token: tk } of this.transfers) {
      if (tk !== token || t.blockNumber > block) continue;
      if (t.from === ZERO_ADDRESS) supply += t.amount; else bal.set(t.from, (bal.get(t.from) ?? 0n) - t.amount);
      if (t.to === ZERO_ADDRESS) supply -= t.amount; else bal.set(t.to, (bal.get(t.to) ?? 0n) + t.amount);
    }
    if (sel === SEL_TOTAL_SUPPLY) return word(supply);
    if (sel === SEL_BALANCE_OF) {
      const holder = lc(`0x${data.slice(34, 74)}`);
      const v = bal.get(holder) ?? 0n;
      return word(v < 0n ? 0n : v);
    }
    throw new Error(`unsupported selector ${sel}`);
  }
}
