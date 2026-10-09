import { keccak256, toBytes, pad, toHex, concatHex, hexToBigInt, getAddress } from "viem";
import type { Address, Hex, RawLog, RawTx, Transfer, Swap } from "@/engine/types";

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
export const BURN_ADDRESS: Address = "0x000000000000000000000000000000000000dead";

export const TRANSFER_TOPIC = keccak256(toBytes("Transfer(address,address,uint256)"));
/** Event emitted by the mock closed pool in /contracts and by the generic adapter. */
export const SWAP_TOPIC = keccak256(toBytes("Swap(address,bool,uint256,uint256)"));

export const SEL_BALANCE_OF: Hex = "0x70a08231";
export const SEL_TOTAL_SUPPLY: Hex = "0x18160ddd";

export const lc = (a: string) => a.toLowerCase() as Address;

export const topicAddress = (a: string): Hex => pad(lc(a) as Hex, { size: 32 });
const addrFromTopic = (t: Hex): Address => lc(`0x${t.slice(26)}`);
export const word = (n: bigint | number): Hex => pad(toHex(n), { size: 32 });

export function encodeTransfer(base: Omit<RawLog, "topics" | "data">, from: string, to: string, amount: bigint): RawLog {
  return { ...base, topics: [TRANSFER_TOPIC, topicAddress(from), topicAddress(to)], data: word(amount) };
}

export function encodeSwap(base: Omit<RawLog, "topics" | "data">, trader: string, isBuy: boolean, tokenAmount: bigint, quoteAmount: bigint): RawLog {
  return {
    ...base,
    topics: [SWAP_TOPIC, topicAddress(trader)],
    data: concatHex([word(isBuy ? 1n : 0n), word(tokenAmount), word(quoteAmount)]),
  };
}

export function decodeTransfer(l: RawLog): Transfer | null {
  if (l.topics[0] !== TRANSFER_TOPIC || l.topics.length < 3) return null;
  return {
    from: addrFromTopic(l.topics[1]),
    to: addrFromTopic(l.topics[2]),
    amount: hexToBigInt(l.data),
    blockNumber: l.blockNumber,
    txHash: l.txHash,
    logIndex: l.logIndex,
  };
}

export function decodeSwap(l: RawLog, tokenDecimals: number, quoteDecimals: number): Swap | null {
  if (l.topics[0] !== SWAP_TOPIC || l.topics.length < 2) return null;
  const d = l.data.slice(2);
  const isBuy = BigInt("0x" + d.slice(0, 64)) === 1n;
  const tokenAmount = BigInt("0x" + d.slice(64, 128));
  const quoteAmount = BigInt("0x" + d.slice(128, 192));
  return {
    trader: addrFromTopic(l.topics[1]),
    side: isBuy ? "buy" : "sell",
    tokenAmount,
    quoteAmount,
    tokens: scaled(tokenAmount, tokenDecimals),
    usd: scaled(quoteAmount, quoteDecimals),
    blockNumber: l.blockNumber,
    txHash: l.txHash,
    logIndex: l.logIndex,
  };
}

/** bigint base units to a JS number, keeping 6 fractional digits. */
export function scaled(amount: bigint, decimals: number): number {
  if (decimals <= 6) return Number(amount) / 10 ** decimals;
  return Number(amount / 10n ** BigInt(decimals - 6)) / 1e6;
}

export const canonLog = (l: RawLog): string =>
  `log|${l.chainId}|${l.blockNumber}|${l.txHash}|${l.logIndex}|${l.address}|${l.topics.join(",")}|${l.data}`.toLowerCase();

export const canonTx = (t: RawTx): string =>
  `tx|${t.chainId}|${t.hash}|${t.blockNumber}|${t.from}|${t.to}|${t.value}|${t.input}`.toLowerCase();

export const callBalanceOf = (holder: string): Hex => `${SEL_BALANCE_OF}${topicAddress(holder).slice(2)}` as Hex;

export const nonceRaw = (n: number): string => toHex(n);

export const checksum = (a: string) => {
  try { return getAddress(a); } catch { return a; }
};

export const short = (a: string, l = 6, r = 4) => (a.length > l + r + 2 ? `${a.slice(0, l)}…${a.slice(-r)}` : a);
