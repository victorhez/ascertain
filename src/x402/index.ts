import { verifyTypedData, type Address, type Hex } from "viem";

/**
 * x402 pay-per-answer (https://www.x402.org). Scheme "exact": the caller signs an EIP-3009
 * transferWithAuthorization for USDC and sends it in the X-PAYMENT header.
 *
 * Modes
 *  - facilitator: verify + settle through an x402 facilitator (set X402_PAY_TO).
 *  - demo:        verify the EIP-712 signature locally, settle nothing. Funds never move.
 *                 Used when X402_PAY_TO is unset so judges can run the full flow without a funded wallet.
 */

export const X402_VERSION = 1;

const NETWORKS = {
  "base-sepolia": { chainId: 84532, asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address, name: "USDC", version: "2" },
  base: { chainId: 8453, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address, name: "USD Coin", version: "2" },
} as const;

export type X402Network = keyof typeof NETWORKS;

export interface X402Config {
  mode: "facilitator" | "demo";
  network: X402Network;
  payTo: Address;
  facilitatorUrl: string;
}

export const DEMO_PAY_TO: Address = "0x00000000000000000000000000000000d0d0d0d0";

export function x402Config(): X402Config {
  const payTo = process.env.X402_PAY_TO as Address | undefined;
  const network = ((process.env.X402_NETWORK as X402Network) in NETWORKS ? process.env.X402_NETWORK : "base-sepolia") as X402Network;
  return {
    mode: payTo ? "facilitator" : "demo",
    network,
    payTo: payTo ?? DEMO_PAY_TO,
    facilitatorUrl: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator",
  };
}

export interface PaymentRequirements {
  scheme: "exact";
  network: X402Network;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  extra: { name: string; version: string; mode?: string };
}

/** USD price to 6-decimal USDC base units. */
export const usdToUnits = (usd: number) => String(Math.round(usd * 1_000_000));

export function requirementsFor(resource: string, description: string, priceUsd: number, cfg = x402Config()): PaymentRequirements {
  const n = NETWORKS[cfg.network];
  return {
    scheme: "exact",
    network: cfg.network,
    maxAmountRequired: usdToUnits(priceUsd),
    resource,
    description,
    mimeType: "application/json",
    payTo: cfg.payTo,
    maxTimeoutSeconds: 60,
    asset: n.asset,
    extra: { name: n.name, version: n.version, ...(cfg.mode === "demo" ? { mode: "demo-no-settlement" } : {}) },
  };
}

export const paymentRequiredBody = (reqs: PaymentRequirements[], error = "X-PAYMENT header is required") => ({
  x402Version: X402_VERSION,
  error,
  accepts: reqs,
});

export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: X402Network;
  payload: {
    signature: Hex;
    authorization: { from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: Hex };
  };
}

export const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function decodePayment(header: string): PaymentPayload | null {
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const usedNonces = new Set<string>();

export interface VerifyResult { ok: boolean; reason?: string; payer?: Address; payload?: PaymentPayload }

export async function verifyPayment(header: string, reqs: PaymentRequirements, cfg = x402Config()): Promise<VerifyResult> {
  const p = decodePayment(header);
  if (!p || p.scheme !== "exact" || !p.payload?.authorization) return { ok: false, reason: "malformed_payment" };
  if (p.network !== reqs.network) return { ok: false, reason: "wrong_network" };
  const a = p.payload.authorization;
  const now = Math.floor(Date.now() / 1000);
  if (a.to.toLowerCase() !== reqs.payTo.toLowerCase()) return { ok: false, reason: "wrong_recipient" };
  if (BigInt(a.value) < BigInt(reqs.maxAmountRequired)) return { ok: false, reason: "insufficient_amount" };
  if (Number(a.validAfter) > now) return { ok: false, reason: "not_yet_valid" };
  if (Number(a.validBefore) < now + 3) return { ok: false, reason: "expired" };
  if (usedNonces.has(a.nonce.toLowerCase())) return { ok: false, reason: "nonce_reused" };

  if (cfg.mode === "demo") {
    const net = NETWORKS[p.network];
    const valid = await verifyTypedData({
      address: a.from,
      domain: { name: net.name, version: net.version, chainId: net.chainId, verifyingContract: net.asset },
      types: TRANSFER_WITH_AUTH_TYPES,
      primaryType: "TransferWithAuthorization",
      message: { from: a.from, to: a.to, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce },
      signature: p.payload.signature,
    }).catch(() => false);
    if (!valid) return { ok: false, reason: "invalid_signature" };
    return { ok: true, payer: a.from, payload: p };
  }

  const res = await fetch(`${cfg.facilitatorUrl}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x402Version: X402_VERSION, paymentPayload: p, paymentRequirements: reqs }),
  }).catch(() => null);
  if (!res || !res.ok) return { ok: false, reason: "facilitator_unreachable" };
  const j = (await res.json()) as { isValid: boolean; invalidReason?: string; payer?: Address };
  return j.isValid ? { ok: true, payer: j.payer ?? a.from, payload: p } : { ok: false, reason: j.invalidReason ?? "facilitator_rejected" };
}

export interface Settlement { success: boolean; mode: "demo" | "facilitator"; network: X402Network; payer?: Address; transaction?: string; error?: string }

export async function settlePayment(v: VerifyResult, reqs: PaymentRequirements, cfg = x402Config()): Promise<Settlement> {
  const nonce = v.payload!.payload.authorization.nonce.toLowerCase();
  usedNonces.add(nonce);
  if (cfg.mode === "demo") return { success: true, mode: "demo", network: cfg.network, payer: v.payer, transaction: undefined };
  const res = await fetch(`${cfg.facilitatorUrl}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x402Version: X402_VERSION, paymentPayload: v.payload, paymentRequirements: reqs }),
  }).catch(() => null);
  if (!res || !res.ok) return { success: false, mode: "facilitator", network: cfg.network, error: "settle_failed" };
  const j = (await res.json()) as { success: boolean; transaction?: string; payer?: Address; errorReason?: string };
  return { success: j.success, mode: "facilitator", network: cfg.network, payer: j.payer ?? v.payer, transaction: j.transaction, error: j.errorReason };
}

/** Client side helper (used by the MCP server, the CLI demo and the in-site demo). */
export async function signPayment(
  account: { address: Address; signTypedData: (a: any) => Promise<Hex> },
  reqs: PaymentRequirements,
): Promise<string> {
  const net = NETWORKS[reqs.network];
  const now = Math.floor(Date.now() / 1000);
  const nonce = ("0x" + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex;
  const authorization = {
    from: account.address,
    to: reqs.payTo,
    value: reqs.maxAmountRequired,
    validAfter: String(now - 60),
    validBefore: String(now + reqs.maxTimeoutSeconds),
    nonce,
  };
  const signature = await account.signTypedData({
    domain: { name: reqs.extra.name, version: reqs.extra.version, chainId: net.chainId, verifyingContract: reqs.asset },
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
  });
  const payload: PaymentPayload = { x402Version: X402_VERSION, scheme: "exact", network: reqs.network, payload: { signature, authorization } };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
