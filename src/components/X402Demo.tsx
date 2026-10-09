"use client";
import { useState } from "react";
import { Icon } from "./ui";

interface Step { n: number; label: string; request?: string; status?: number; response?: unknown; detail?: Record<string, unknown>; paymentResponse?: Record<string, unknown> | null }
interface Result { mode: string; network: string; note: string; steps: Step[] }

export function X402Demo({ tokens }: { tokens: string[] }) {
  const [token, setToken] = useState(tokens[0] ?? "MIRA");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(0);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setRes(null); setShown(0);
    try {
      const r = await fetch("/api/demo/x402", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || j.error || "request failed");
      setRes(j);
      for (let i = 1; i <= j.steps.length; i++) {
        await new Promise((ok) => setTimeout(ok, 650));
        setShown(i);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-solid overflow-hidden shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <div className="text-[15px] font-semibold tracking-tight">Run the pay-per-answer flow</div>
          <div className="text-[12.5px] text-muted">Request, 402, sign, retry, receipt. Throwaway key, no funds move.</div>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="demo-token" className="sr-only">Token</label>
          <select id="demo-token" value={token} onChange={(e) => setToken(e.target.value)} className="mono h-9 rounded-lg border border-line bg-bg2 px-3 text-[13px]">
            {tokens.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button onClick={run} disabled={busy} className="btn btn-primary btn-sm">{busy ? "Running…" : "Run"} <Icon name="bolt" size={14} /></button>
        </div>
      </div>
      <div className="min-h-[220px] space-y-3 p-5 text-[12.5px]">
        {!res && !err && <p className="text-muted">Press Run to watch an agent call a paid endpoint end to end.</p>}
        {err && <p style={{ color: "var(--nogo)" }}>{err}</p>}
        {res?.steps.slice(0, shown).map((s) => (
          <div key={s.n} className="rise rounded-xl border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 font-medium"><span className="mono flex h-5 w-5 items-center justify-center rounded-full bg-fg text-[11px] text-bg">{s.n}</span>{s.label}</div>
              {s.status !== undefined && <span className={`pill ${s.status === 200 ? "pill-go" : "pill-wait"} !h-[22px] !text-[11px]`}>{s.status}</span>}
            </div>
            {s.request && <div className="mono mt-2 break-all text-muted">{s.request}</div>}
            {s.detail && <div className="mono mt-2 break-all text-muted">{Object.entries(s.detail).map(([k, v]) => `${k}: ${v}`).join("  ·  ")}</div>}
            {s.response !== undefined && <pre className="code mt-2 max-h-48 !text-[11.5px]">{typeof s.response === "string" ? s.response : JSON.stringify(s.response, null, 2)}</pre>}
            {s.paymentResponse && <div className="mono mt-2 text-muted">X-PAYMENT-RESPONSE: {JSON.stringify(s.paymentResponse)}</div>}
          </div>
        ))}
        {res && shown === res.steps.length && <p className="pt-1 text-[12px] text-dim">{res.note}</p>}
      </div>
    </div>
  );
}
