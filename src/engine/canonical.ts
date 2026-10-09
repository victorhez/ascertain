import { createHash } from "node:crypto";

/** Deterministic JSON: sorted keys, bigint as decimal strings. Same input, same bytes, always. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return v;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function digestOf(value: unknown): string {
  return sha256(canonicalize(value));
}
