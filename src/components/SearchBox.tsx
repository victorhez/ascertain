"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./ui";

export function SearchBox({ examples = [] as { symbol: string; label: string }[], autoFocus = false }) {
  const router = useRouter();
  const [v, setV] = useState("");
  const go = (q: string) => {
    const t = q.trim();
    if (t) router.push(`/token/${encodeURIComponent(t)}`);
  };
  return (
    <div id="check" className="scroll-mt-28">
      <form
        onSubmit={(e) => { e.preventDefault(); go(v); }}
        className="card-solid flex items-center gap-2 p-2 pl-4 shadow-[var(--shadow)]"
        role="search"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <label htmlFor="token-q" className="sr-only">Token address or symbol</label>
        <input
          id="token-q" autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)} spellCheck={false} autoComplete="off"
          placeholder="Paste a token address or try MIRT"
          className="mono h-11 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-dim"
        />
        <button type="submit" className="btn btn-primary h-11">Check <Icon name="arrow" size={16} /></button>
      </form>
      {examples.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          <span>Try</span>
          {examples.map((e) => (
            <button key={e.symbol} type="button" onClick={() => go(e.symbol)} className="chip chip-link cursor-pointer">
              <span className="mono font-semibold text-fg">{e.symbol}</span>{e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
