#!/usr/bin/env node
// Ascertain MCP server (stdio). Thin client over the public REST API.
// Env: ASCERTAIN_URL (required for non-local use), ASCERTAIN_X402_PRIVATE_KEY (optional, enables auto-pay on 402).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";

const BASE = (process.env.ASCERTAIN_URL || "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.ASCERTAIN_X402_PRIVATE_KEY;
const account = KEY ? privateKeyToAccount(KEY.startsWith("0x") ? KEY : `0x${KEY}`) : null;

const TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
  ],
};
const CHAIN_IDS = { "base-sepolia": 84532, base: 8453 };

async function pay(reqs) {
  const now = Math.floor(Date.now() / 1000);
  const nonce = "0x" + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  const auth = { from: account.address, to: reqs.payTo, value: reqs.maxAmountRequired, validAfter: String(now - 60), validBefore: String(now + reqs.maxTimeoutSeconds), nonce };
  const signature = await account.signTypedData({
    domain: { name: reqs.extra.name, version: reqs.extra.version, chainId: CHAIN_IDS[reqs.network], verifyingContract: reqs.asset },
    types: TYPES, primaryType: "TransferWithAuthorization",
    message: { ...auth, value: BigInt(auth.value), validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore) },
  });
  return Buffer.from(JSON.stringify({ x402Version: 1, scheme: "exact", network: reqs.network, payload: { signature, authorization: auth } })).toString("base64");
}

async function api(path, init = {}) {
  let res = await fetch(BASE + path, init);
  if (res.status === 402) {
    const body = await res.json();
    if (!account) return { paymentRequired: true, hint: "Set ASCERTAIN_X402_PRIVATE_KEY to let this server pay x402 requests automatically.", accepts: body.accepts };
    const header = await pay(body.accepts[0]);
    res = await fetch(BASE + path, { ...init, headers: { ...(init.headers || {}), "x-payment": header } });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json.error || `HTTP ${res.status}`, detail: json.detail };
  const receipt = res.headers.get("x-payment-response");
  return receipt ? { ...json, _payment: JSON.parse(Buffer.from(receipt, "base64").toString()) } : json;
}

const text = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });
const server = new McpServer({ name: "ascertain", version: "0.1.0" });

server.registerTool(
  "ascertain_check_token",
  {
    description: "Fast safety check before acting on a freshly launched token: is its holder base and volume organic? Returns GO / WAIT / NO-GO with the reasons. Estimates based on public Ascend criteria, not official Ascend decisions.",
    inputSchema: { token: z.string().describe("Token address or indexed symbol, e.g. MIRA"), intent: z.enum(["creator", "trader", "staker"]).default("trader") },
  },
  async ({ token, intent }) => {
    const r = await api(`/v1/token/${encodeURIComponent(token)}/readiness?intent=${intent}`);
    if (r.verdict) return text({ verdict: r.verdict, score: r.score, reasons: r.reasons, effectiveHoldersFinding: r.findings?.find((f) => f.signal === "effective_holders"), inputsDigest: r.inputsDigest, verifiedAt: r.verifiedAt, simulated: r.simulated, disclaimer: r.disclaimer, _payment: r._payment });
    return text(r);
  },
);

server.registerTool(
  "ascertain_readiness",
  {
    description: "Full Ascended-readiness breakdown: every rule with measured value and estimated threshold, failed rules, and what change would flip the verdict.",
    inputSchema: { token: z.string(), intent: z.enum(["creator", "trader", "staker"]).default("creator") },
  },
  async ({ token, intent }) => text(await api(`/v1/token/${encodeURIComponent(token)}/readiness?intent=${intent}`)),
);

server.registerTool(
  "ascertain_verify_finding",
  {
    description: "Fetch the raw evidence receipts behind a published finding, with copy-paste cast commands to re-fetch each fact from chain state.",
    inputSchema: { findingId: z.string().describe("A finding id such as fnd_ab12cd34ef56 from a readiness response") },
  },
  async ({ findingId }) => text(await api(`/v1/evidence/${encodeURIComponent(findingId)}`)),
);

await server.connect(new StdioServerTransport());
