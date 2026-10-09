import { createPublicClient, defineChain, http, parseAbi, type PublicClient } from "viem";
import { lc } from "./codec";
import type { ChainSource } from "./source";
import type { Address, Hex, RawLog, RawTx } from "@/engine/types";

export const isAddress = (s: string): s is Address => /^0x[0-9a-fA-F]{40}$/.test(s);

export const CHAINS = {
  99801: {
    id: 99801,
    name: "Elysium Testnet",
    rpc: process.env.ELYSIUM_RPC_URL || "https://testnet-rpc.elysium.kinetiq.xyz",
    verifierRpc: process.env.ELYSIUM_VERIFIER_RPC_URL || "",
    explorer: "https://elysium.kinetiq.xyz",
  },
  999: {
    id: 999,
    name: "HyperEVM",
    rpc: process.env.HYPEREVM_RPC_URL || "https://rpc.hyperliquid.xyz/evm",
    verifierRpc: process.env.HYPEREVM_VERIFIER_RPC_URL || "",
    explorer: "https://hyperevmscan.io",
  },
} as const;

export function clientFor(chainId: keyof typeof CHAINS, url?: string): PublicClient {
  const c = CHAINS[chainId];
  return createPublicClient({
    chain: defineChain({ id: c.id, name: c.name, nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [c.rpc] } } }),
    transport: http(url ?? c.rpc, { timeout: 8000, retryCount: 1 }),
  }) as PublicClient;
}

/** ChainSource over standard EVM JSON-RPC (viem). Used by the replay CLI and by production verification. */
export class RpcSource implements ChainSource {
  readonly id: string;
  private client: PublicClient;
  constructor(chainId: keyof typeof CHAINS, url: string, label?: string) {
    this.client = clientFor(chainId, url);
    this.id = label ?? url;
  }
  async getLog(_c: number, txHash: Hex, logIndex: number): Promise<RawLog | null> {
    const r = await this.client.getTransactionReceipt({ hash: txHash });
    const l = r.logs.find((x) => x.logIndex === logIndex);
    if (!l) return null;
    return { chainId: _c, blockNumber: Number(l.blockNumber), txHash, logIndex, address: lc(l.address), topics: [...l.topics] as Hex[], data: l.data };
  }
  async getTx(_c: number, hash: Hex): Promise<RawTx | null> {
    const t = await this.client.getTransaction({ hash });
    if (!t) return null;
    return { chainId: _c, hash, blockNumber: Number(t.blockNumber), from: lc(t.from), to: lc(t.to ?? "0x0000000000000000000000000000000000000000"), value: t.value.toString(), input: t.input };
  }
  async call(_c: number, to: Address, data: Hex, blockNumber: number): Promise<Hex> {
    const r = await this.client.call({ to, data, blockNumber: BigInt(blockNumber) });
    return (r.data ?? "0x") as Hex;
  }
  async nonce(_c: number, address: Address, blockNumber: number): Promise<number> {
    return this.client.getTransactionCount({ address, blockNumber: BigInt(blockNumber) });
  }
}

const erc20 = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);

export interface Probe {
  found: boolean;
  chainId?: number;
  chainName?: string;
  isContract?: boolean;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  error?: string;
}

/** Read-only look at an address on each supported chain. Never throws. */
export async function probeToken(address: Address): Promise<Probe> {
  for (const id of [99801, 999] as const) {
    try {
      const client = clientFor(id);
      const code = await client.getCode({ address });
      if (!code || code === "0x") continue;
      const read = async <T,>(fn: "name" | "symbol" | "decimals" | "totalSupply") =>
        client.readContract({ address, abi: erc20, functionName: fn }).catch(() => undefined) as Promise<T | undefined>;
      const [name, symbol, decimals, supply] = await Promise.all([read<string>("name"), read<string>("symbol"), read<number>("decimals"), read<bigint>("totalSupply")]);
      return { found: true, chainId: id, chainName: CHAINS[id].name, isContract: true, name, symbol, decimals, totalSupply: supply?.toString() };
    } catch (e) {
      if (id === 999) return { found: false, error: (e as Error).message.slice(0, 160) };
    }
  }
  return { found: false };
}
