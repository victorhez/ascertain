import { SEL_TOTAL_SUPPLY, callBalanceOf, canonLog, canonTx, lc, nonceRaw, word } from "@/chain/codec";
import type { Address, EvidenceRef, Hex, RawLog, RawTx } from "./types";
import type { Ledger } from "./ledger";

export const logRef = (l: RawLog): EvidenceRef => ({
  kind: "log", chainId: l.chainId, blockNumber: l.blockNumber, address: l.address,
  txHash: l.txHash, logIndex: l.logIndex, raw: canonLog(l),
});

export const txRef = (t: RawTx): EvidenceRef => ({
  kind: "tx", chainId: t.chainId, blockNumber: t.blockNumber, address: t.to, txHash: t.hash, raw: canonTx(t),
});

export function totalSupplyRef(L: Ledger): EvidenceRef {
  return {
    kind: "call", chainId: L.ds.token.chainId, blockNumber: L.ds.headBlock, address: L.ds.token.address,
    callData: SEL_TOTAL_SUPPLY, raw: word(L.totalSupply).toLowerCase(),
  };
}

export function balanceRef(L: Ledger, holder: Address): EvidenceRef {
  const bal = L.balances.get(lc(holder)) ?? 0n;
  return {
    kind: "call", chainId: L.ds.token.chainId, blockNumber: L.ds.headBlock, address: L.ds.token.address,
    callData: callBalanceOf(holder), raw: word(bal < 0n ? 0n : bal).toLowerCase(),
  };
}

export function nonceRef(L: Ledger, wallet: Address): EvidenceRef {
  return {
    kind: "nonce", chainId: L.ds.token.chainId, blockNumber: L.ds.headBlock, address: wallet,
    raw: nonceRaw(L.ds.nonces[lc(wallet)] ?? 0),
  };
}

export function swapLogRef(L: Ledger, txHash: Hex, logIndex: number): EvidenceRef | null {
  const l = L.ds.logs.find((x) => x.txHash === txHash && x.logIndex === logIndex);
  return l ? logRef(l) : null;
}

const key = (e: EvidenceRef) => `${e.kind}|${e.address}|${e.txHash ?? ""}|${e.logIndex ?? ""}|${e.callData ?? ""}|${e.blockNumber}`;

export function dedupe(refs: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => (seen.has(key(r)) ? false : (seen.add(key(r)), true)));
}

/** Deterministic, evenly spread sample so evidence stays small but representative. */
export function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.floor((i * items.length) / n)]);
  return out;
}

export function reproduceCommand(e: EvidenceRef, rpc: string): string {
  switch (e.kind) {
    case "call":
      return `cast call ${e.address} ${e.callData} --block ${e.blockNumber} --rpc-url ${rpc}`;
    case "nonce":
      return `cast nonce ${e.address} --block ${e.blockNumber} --rpc-url ${rpc}`;
    case "tx":
      return `cast tx ${e.txHash} --json --rpc-url ${rpc}`;
    case "log":
      return `cast receipt ${e.txHash} --json --rpc-url ${rpc} | jq '.logs[] | select(.logIndex == "${"0x" + (e.logIndex ?? 0).toString(16)}")'`;
  }
}
