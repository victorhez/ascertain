import { z } from "zod";
import { json, originOf, preflight, problem, rateLimit } from "@/lib/api";
import { commentary } from "@/lib/commentary";
import { getAnalysis, readinessPayload } from "@/lib/service";

export const OPTIONS = preflight;
export const maxDuration = 30;

const Body = z.object({ token: z.string().min(1).max(66), intent: z.enum(["creator", "trader", "staker"]).default("creator") });

export async function POST(req: Request) {
  const rl = rateLimit(req, 30);
  if (!rl.ok) return problem(429, "rate_limited");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, "invalid_body", 'Expected {"token": "<address or symbol>", "intent": "creator" | "trader" | "staker"}');
  const r = await getAnalysis(parsed.data.token);
  if (!r) return problem(404, "token_not_indexed", undefined, { token: parsed.data.token });
  const c = await commentary(r.analysis, parsed.data.intent);
  const payload = readinessPayload(r.analysis, parsed.data.intent, originOf(req), r.fixture);
  return json({ ...payload, ruleVerdict: payload.verdict, verdict: c.verdict, commentary: c }, { headers: rl.headers });
}
