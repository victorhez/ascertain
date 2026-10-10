import { canonLog, canonTx, nonceRaw } from "@/chain/codec";
import type { ChainSource } from "@/chain/source";
import { reproduceCommand } from "./evidence";
import type { EvidenceReceipt, EvidenceRef, Finding } from "./types";

/** Re-fetch one cited fact from an independent source and return its canonical form. */
export async function refetch(e: EvidenceRef, src: ChainSource): Promise<string> {
  try {
    switch (e.kind) {
      case "log": {
        const l = await src.getLog(e.chainId, e.txHash!, e.logIndex!);
        return l ? canonLog(l) : "<not found>";
      }
      case "tx": {
        const t = await src.getTx(e.chainId, e.txHash!);
        return t ? canonTx(t) : "<not found>";
      }
      case "call":
        return (await src.call(e.chainId, e.address, e.callData!, e.blockNumber)).toLowerCase();
      case "nonce":
        return nonceRaw(await src.nonce(e.chainId, e.address, e.blockNumber));
    }
  } catch (err) {
    return `<error: ${(err as Error).message}>`;
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const trunc = (s: string, n = 66) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Evidence-first publishing gate. A finding is published only if every cited
 * fact re-fetches from the independent source and matches byte-for-byte.
 */
export async function verifyFindings(
  findings: Finding[],
  source: ChainSource | null,
  rpcLabel: Record<number, string>,
  now = new Date(),
): Promise<Finding[]> {
  const verifiedAt = now.toISOString();
  const cache = new Map<string, Promise<string>>();
  const key = (e: EvidenceRef) => `${e.kind}|${e.chainId}|${e.address}|${e.txHash ?? ""}|${e.logIndex ?? ""}|${e.callData ?? ""}|${e.blockNumber}`;

  return Promise.all(
    findings.map(async (f): Promise<Finding> => {
      if (!source) {
        return { ...f, status: "withheld", withheldReason: "No verifier attached. Evidence-first policy: unverified findings are never published." };
      }
      const rpc = rpcLabel[f.evidence[0]?.chainId ?? 0] ?? "rpc";
      const results = await pool(f.evidence, 8, async (e) => {
        const k = key(e);
        if (!cache.has(k)) cache.set(k, refetch(e, source));
        return { e, got: await cache.get(k)! };
      });
      const receipts: EvidenceReceipt[] = results.map(({ e, got }) => ({
        ...e,
        findingId: f.id,
        verified: got === e.raw,
        verifiedAt,
        verifierRpc: source.id,
        verifierRaw: got,
        reproduce: reproduceCommand(e, rpc),
      }));
      const bad = receipts.filter((r) => !r.verified);
      const errored = bad.filter((r) => r.verifierRaw.startsWith("<error"));
      if (bad.length && errored.length === bad.length) {
        return { ...f, status: "withheld", receipts, verifiedAt, verifierRpc: source.id, withheldReason: `Verifier unavailable: ${errored.length} of ${receipts.length} re-fetches errored (${trunc(errored[0].verifierRaw.replace(/\s+/g, " "), 90)}). This is not a data mismatch; the claim stays withheld until the verifier can re-fetch.` };
      }
      if (bad.length) {
        const first = bad.find((r) => !r.verifierRaw.startsWith("<error")) ?? bad[0];
        const what = first.kind === "call" ? `call ${first.callData?.slice(0, 10)}…@${first.blockNumber}` : first.kind === "nonce" ? `nonce(${first.address.slice(0, 10)}…)@${first.blockNumber}` : `${first.kind} ${first.txHash?.slice(0, 12)}…`;
        return {
          ...f,
          status: "withheld",
          receipts,
          verifiedAt,
          verifierRpc: source.id,
          withheldReason: `${bad.length} of ${receipts.length} cited facts did not re-fetch identically. First mismatch: ${what} — indexer ${trunc(first.raw)} vs verifier ${trunc(first.verifierRaw)}. Likely stale indexer cache or a reorg; the claim is withheld until it re-indexes.`,
        };
      }
      return { ...f, status: "published", receipts, verifiedAt, verifierRpc: source.id };
    }),
  );
}
