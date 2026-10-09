import type { Address, Hex, RawLog, RawTx } from "@/engine/types";

/**
 * A read-only view of chain state. The indexer reads from one; the verifier
 * re-fetches every cited fact from a *different* one.
 */
export interface ChainSource {
  readonly id: string;
  getLog(chainId: number, txHash: Hex, logIndex: number): Promise<RawLog | null>;
  getTx(chainId: number, hash: Hex): Promise<RawTx | null>;
  call(chainId: number, to: Address, data: Hex, blockNumber: number): Promise<Hex>;
  nonce(chainId: number, address: Address, blockNumber: number): Promise<number>;
}
