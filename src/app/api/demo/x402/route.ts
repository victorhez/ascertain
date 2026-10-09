import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { json, originOf, problem, rateLimit } from "@/lib/api";
import { GET as readiness } from "@/app/api/v1/token/[address]/readiness/route";
import { requirementsFor, signPayment, x402Config } from "@/x402";

export const maxDuration = 30;

/**
 * Live walkthrough of the pay-per-answer flow, run in-process:
 * request -> 402 -> sign EIP-3009 authorization with a throwaway key -> retry -> 200 + receipt.
 */
export async function POST(req: Request) {
  const rl = rateLimit(req, 12);
  if (!rl.ok) return problem(429, "rate_limited");
  if (x402Config().mode === "facilitator") return problem(409, "demo_disabled", "This deployment settles real payments through a facilitator. Use scripts/x402-client.ts with a funded wallet.");
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = (body.token || "MIRA").slice(0, 66);
  const origin = originOf(req);
  const url = `${origin}/v1/token/${token}/readiness?tier=paid`;
  const call = (headers: Record<string, string> = {}) => readiness(new Request(url, { headers: { "x-forwarded-for": "demo-x402", ...headers } }), { params: Promise.resolve({ address: token }) });
  const slim = (j: any) => (j?.token ? { token: j.token.symbol, verdict: j.verdict, score: j.score, reasons: j.reasons?.slice(0, 2), inputsDigest: j.inputsDigest, findings: j.findings?.length } : j);

  const steps: any[] = [];
  const first = await call();
  const firstBody = await first.json();
  steps.push({ n: 1, label: "Agent calls the endpoint with no payment", request: `GET /v1/token/${token}/readiness?tier=paid`, status: first.status, response: firstBody });

  const cfg = x402Config();
  const reqs = firstBody.accepts?.[0] ?? requirementsFor(url, "readiness", 0.01, cfg);
  const account = privateKeyToAccount(generatePrivateKey());
  const header = await signPayment(account, reqs);
  steps.push({
    n: 2,
    label: "Agent signs an EIP-3009 USDC authorization with a throwaway key",
    detail: { payer: account.address, payTo: reqs.payTo, amountUsdc: Number(reqs.maxAmountRequired) / 1e6, network: reqs.network, validFor: `${reqs.maxTimeoutSeconds}s` },
  });

  const second = await call({ "x-payment": header });
  const secondBody = await second.json();
  const receipt = second.headers.get("x-payment-response");
  steps.push({
    n: 3,
    label: "Agent retries with the X-PAYMENT header",
    request: `GET /v1/token/${token}/readiness?tier=paid  +  X-PAYMENT: ${header.slice(0, 28)}…`,
    status: second.status,
    response: slim(secondBody),
    paymentResponse: receipt ? JSON.parse(Buffer.from(receipt, "base64").toString()) : null,
  });

  // Replaying the same authorization must fail.
  const replay = await call({ "x-payment": header });
  steps.push({ n: 4, label: "Replaying the same authorization is rejected", status: replay.status, response: (await replay.json()).error });

  return json({ mode: cfg.mode, network: cfg.network, note: cfg.mode === "demo" ? "Demo mode: the signature is verified, no funds move and nothing settles on-chain." : "Facilitator mode: settled through the configured x402 facilitator.", steps });
}
