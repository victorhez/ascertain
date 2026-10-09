import { ipOf, json, originOf, paywall, preflight, problem, rateLimit } from "@/lib/api";
import { getAnalysis, readinessPayload } from "@/lib/service";
import type { Intent } from "@/engine/types";

export const OPTIONS = preflight;
export const maxDuration = 30;

export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const rl = rateLimit(req);
  if (!rl.ok) return problem(429, "rate_limited", "Too many requests. Slow down or pay per call over x402.");
  const { address } = await ctx.params;
  const url = new URL(req.url);
  const intent = (["creator", "trader", "staker"].includes(url.searchParams.get("intent") ?? "") ? url.searchParams.get("intent") : "creator") as Intent;

  const pay = await paywall(req, { priceUsd: 0.01, description: "Ascertain readiness verdict (Go / Wait / No-go) with score breakdown and evidence links", freeTier: 25 });
  if (pay.response) return pay.response;

  const r = await getAnalysis(address, { verifier: url.searchParams.get("verifier") !== "off" });
  if (!r) return problem(404, "token_not_indexed", "Ascertain only indexes configured tokens. See /methodology#indexing.", { address });
  const settled = await pay.settle();
  return json(readinessPayload(r.analysis, intent, originOf(req), r.fixture), { headers: { ...rl.headers, ...pay.headers, ...settled } });
}
