import { NextResponse } from "next/server";
import { paymentRequiredBody, requirementsFor, settlePayment, verifyPayment, x402Config } from "@/x402";

export const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-payment",
  "access-control-expose-headers": "x-payment-response, x-ratelimit-limit, x-ratelimit-remaining, x-ascertain-free-remaining",
};

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

export function originOf(req: Request): string {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}`;
}

export function ipOf(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export function json(data: unknown, init: ResponseInit & { headers?: Record<string, string> } = {}) {
  return NextResponse.json(data, { ...init, headers: { ...CORS, "cache-control": "no-store", ...(init.headers ?? {}) } });
}

export const problem = (status: number, title: string, detail?: string, extra: Record<string, unknown> = {}) =>
  json({ error: title, detail, ...extra }, { status });

/* ---------------------------------------------------------------- rate limit (in-memory sliding window) */

const hits = new Map<string, number[]>();

export function rateLimit(req: Request, limit = 60, windowMs = 60_000) {
  const ip = ipOf(req);
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  const ok = arr.length < limit;
  if (ok) arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return {
    ok,
    headers: { "x-ratelimit-limit": String(limit), "x-ratelimit-remaining": String(Math.max(0, limit - arr.length)) },
  };
}

/* ---------------------------------------------------------------- x402 paywall with a free tier */

const FREE_PER_DAY = Number(process.env.FREE_VERDICTS_PER_DAY ?? 25);
const free = new Map<string, number>();

export interface PaywallOptions {
  priceUsd: number;
  description: string;
  /** Number of free calls per IP per UTC day. 0 = always paid. */
  freeTier?: number;
}

/**
 * Returns either a Response to send back (402 / error) or headers to attach to the success response
 * plus a `settle` callback that must run after the answer is produced.
 */
export async function paywall(req: Request, opts: PaywallOptions) {
  const url = new URL(req.url);
  const cfg = x402Config();
  const forced = url.searchParams.get("tier") === "paid";
  const freeTier = opts.freeTier ?? 0;
  const day = new Date().toISOString().slice(0, 10);
  const key = `${ipOf(req)}|${day}`;
  const used = free.get(key) ?? 0;
  const header = req.headers.get("x-payment");

  if (!header && !forced && used < freeTier) {
    free.set(key, used + 1);
    return { response: null as Response | null, headers: { "x-ascertain-free-remaining": String(freeTier - used - 1) } as Record<string, string>, settle: async () => ({}) as Record<string, string> };
  }

  const reqs = requirementsFor(`${originOf(req)}${url.pathname}`, opts.description, opts.priceUsd, cfg);
  if (!header) {
    return { response: json(paymentRequiredBody([reqs]), { status: 402 }), headers: {}, settle: async () => ({}) as Record<string, string> };
  }
  const v = await verifyPayment(header, reqs, cfg);
  if (!v.ok) {
    return { response: json(paymentRequiredBody([reqs], `payment_invalid: ${v.reason}`), { status: 402 }), headers: {}, settle: async () => ({}) as Record<string, string> };
  }
  return {
    response: null as Response | null,
    headers: {} as Record<string, string>,
    settle: async () => {
      const s = await settlePayment(v, reqs, cfg);
      return { "x-payment-response": Buffer.from(JSON.stringify(s)).toString("base64") } as Record<string, string>;
    },
  };
}
