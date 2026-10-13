import type { Metadata } from "next";
import { defaultConfig as cfg, RULE_VERSIONS } from "@/engine/config";
import { compactUsd, pct } from "@/lib/format";
import backtest from "../../../evidence/backtest-summary.json";

export const metadata: Metadata = { title: "Methodology" };

const SIGNALS = [
  ["Concentration", RULE_VERSIONS.concentration, "Top-1, top-5, top-10 share of circulating supply, HHI and Gini. Pool and burn addresses are excluded.", "Ascend checks for concentrated accumulation.", "concentration()"],
  ["Funding-source clusters", RULE_VERSIONS.funding_clusters, `Wallets whose first HYPE or gas funding traces to the same source within ${cfg.signals.fundingMaxHops} hops form a cluster of at least ${cfg.signals.minClusterSize}. Known exchange and bridge hot wallets are ignored as sources.`, "One operator running many wallets.", "fundingClusters()"],
  ["Same-block entry", RULE_VERSIONS.same_block_entry, `${cfg.signals.bundleMinWallets} or more wallets making their first buy in the same block with sizes within ${pct(cfg.signals.bundleMaxSpread, 0)} of each other.`, "Coordinated accumulation.", "sameBlockEntry()"],
  ["Wash loops", RULE_VERSIONS.wash_loops, `A wallet with at least ${cfg.signals.washMinPairs} buy-then-sell pairs of near-identical size within ${cfg.signals.washPairWindowSec / 60} minutes, at least ${compactUsd(cfg.signals.washMinGrossUsd)} gross, and net position under ${pct(cfg.signals.washMaxNetRatio, 0)} of gross. Also wallet-to-wallet token cycles (A to B to A, A to B to C to A) that return at least ${pct(cfg.signals.washCycleMinRatio, 0)} of what they sent.`, "Fake volume.", "washLoops()"],
  ["Wallet age and activity", RULE_VERSIONS.wallet_age, `Share of holders with at most ${cfg.signals.freshMaxNonce} lifetime transactions that were funded shortly before their first buy.`, "Throwaway wallets.", "walletAge()"],
  ["Effective holders", RULE_VERSIONS.effective_holders, "Holders after merging wallets linked by funding cluster, same-block batch or wash loop. Union-find over the linked sets.", "Unique holders, the input Ascend buyback weighting depends on.", "effectiveHolders()"],
  ["Volume per unique wallet", RULE_VERSIONS.volume_per_wallet, `Daily volume split into organic and inflated (wash wallets, same-block batches, clusters of ${cfg.signals.coordinatedMinSize}+). Time-weighted organic volume uses the last ${cfg.signals.volumeWindowDays} days, newer days weigh more, a single day is capped at ${cfg.signals.volumeSpikeCap}× the window median.`, "Organic versus inflated volume.", "volumePerWallet()"],
  ["Market cap", RULE_VERSIONS.market_cap, "Median price of the last five swaps times (total supply minus burned).", "Ascend qualification input.", "marketCap()"],
];

const BLIND = [
  ["Market makers and arbitrage bots can look like wash wallets.", "We require paired round trips of near-identical size within minutes and a near-zero net position. A bot that trades exactly that way will be flagged, and the finding says what was observed, not why."],
  ["New shared infrastructure over-links.", "A new exchange hot wallet, bridge or faucet that is not on the ignored-funder list will make unrelated wallets look linked. The list is configurable and versioned."],
  ["Careful operators can evade funding links.", "Wallets funded through many independent paths, mixers, or time-separated deposits will not cluster. Absence of a cluster is not proof of independence."],
  ["Linked is not malicious.", "Friends, a DAO's members, or an airdrop cohort can share a funder. Clusters are shown as “linked by funding source” and never as an accusation."],
  ["Price from thin pools is noisy.", "Market cap uses the median of the last five swaps. A manipulated thin pool can move it."],
  ["Smart-contract wallets and account abstraction.", "Lifetime transaction counts understate activity for some wallet types, which can overstate the fresh-wallet share."],
  ["Cross-chain activity is invisible.", "Ascertain reads one chain at a time."],
  ["Receipts verify a sample.", `Each finding cites a capped, evenly spread sample (${cfg.signals.evidenceCap.perFinding} facts) plus a digest. The derived metric is recomputed deterministically from the stored raw logs, which are public in the evidence JSON.`],
  ["Back-test data is simulated.", "Current results come from seeded launches with planted ground truth. Replay on real HyperEVM tokens is supported by the CLI; real-token numbers are published only once run."],
];

export default function Methodology() {
  const rules = Object.entries(cfg.rules);
  const s = backtest.summary;
  return (
    <div className="mx-auto max-w-[900px] px-4 pb-10 pt-12 sm:px-6">
      <div className="eyebrow mb-3">Methodology</div>
      <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[52px]">How a verdict is made, and how to check it.</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-muted">Rules are code. Every signal is a deterministic function of chain data with a version string. The same data and the same rule version always produce the same verdict.</p>

      <nav className="card mt-8 flex flex-wrap gap-x-5 gap-y-2 p-4 text-[13px]" aria-label="On this page">
        {[["Principles", "#principles"], ["Signals", "#signals"], ["Evidence", "#evidence"], ["Thresholds", "#thresholds"], ["Back-test", "#backtest"], ["Blind spots", "#blind-spots"], ["Indexing", "#indexing"], ["Safety wording", "#safety"]].map(([l, h]) => (
          <a key={h} href={h} className="text-muted hover:text-fg">{l}</a>
        ))}
      </nav>

      <div className="prose-a">
        <h2 id="principles" className="scroll-mt-24">Principles</h2>
        <ul>
          <li><b className="text-fg">Evidence first.</b> A finding is published only if every cited fact re-fetches from chain state, through a second, separate RPC source (a different provider when one is configured), and matches byte for byte. Failed findings are withheld and listed, with the reason.</li>
          <li><b className="text-fg">Rules decide, AI advises.</b> Verdicts come from deterministic, versioned rules. Optional AI-written commentary can downgrade a verdict to WAIT or NO-GO. It can never upgrade one.</li>
          <li><b className="text-fg">Effective holders, not raw holders.</b> Linked wallets are merged before counting, so one operator cannot look like hundreds of people.</li>
          <li><b className="text-fg">Honest about limits.</b> Ascend&apos;s real thresholds are internal. Ours are configurable estimates, labelled as such. Known blind spots are listed below.</li>
          <li><b className="text-fg">No custody, read-only.</b> Ascertain never holds funds or keys and never signs transactions for users. No private user data is stored.</li>
        </ul>

        <h2 id="signals" className="scroll-mt-24">Signals</h2>
        <p>Each signal lives in <code>src/engine/signals.ts</code>. Rule versions bump whenever a definition changes.</p>
      </div>
      <div className="space-y-3">
        {SIGNALS.map(([n, ver, def, why, fn]) => (
          <div key={n} className="card-solid p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[16px] font-semibold tracking-tight">{n}</h3><span className="mono text-[11.5px] text-dim">{ver} · {fn}</span></div>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{def}</p>
            <p className="mt-2 text-[12.5px] text-dim">Why it matters: {why}</p>
          </div>
        ))}
      </div>

      <div className="prose-a">
        <h2 id="evidence" className="scroll-mt-24">Evidence receipts and the verifier</h2>
        <p>Each finding stores, per cited fact: chain id, block number, contract address, transaction hash or call data, the raw returned value, and the rule version that produced it. A separate verifier job re-fetches each item from an independent RPC and compares the canonical string byte for byte.</p>
        <ul>
          <li><code>log</code>: a transfer or swap log, compared by address, topics and data.</li>
          <li><code>tx</code>: a funding transaction, compared by sender, recipient, value and block.</li>
          <li><code>call</code>: an <code>eth_call</code> such as <code>balanceOf</code> or <code>totalSupply</code> at a fixed block.</li>
          <li><code>nonce</code>: <code>eth_getTransactionCount</code> at a fixed block.</li>
        </ul>
        <p>Every receipt has a copy-paste <code>cast</code> command. Findings that fail are on the <a className="text-fg underline underline-offset-4" href="/withheld">public withheld list</a>. Finding ids are content hashes, so they change when data or rules change.</p>
      </div>

      <div className="prose-a">
        <h2 id="thresholds" className="scroll-mt-24">Thresholds (estimates)</h2>
        <p>Config <code>{cfg.version}</code> · <b className="text-fg">status: {cfg.status}</b>. {cfg.basis}</p>
      </div>
      <div className="card-solid scroll-x p-2 sm:p-4">
        <table className="tbl min-w-[560px]">
          <thead><tr><th>Rule</th><th>Kind</th><th>Bar</th><th>Hard limit</th><th>Weight</th></tr></thead>
          <tbody>
            {rules.map(([id, r]) => {
              const f = (x: number | undefined) => (x === undefined ? "none" : r.unit === "usd" ? compactUsd(x) : r.unit === "pct" ? pct(x, 0) : String(x));
              return <tr key={id}><td><div className="font-medium">{r.label}</div><div className="mono text-[11px] text-dim">{id}</div></td><td className="text-muted">{r.kind}</td><td className="mono">{r.min !== undefined ? `≥ ${f(r.min)}` : `≤ ${f(r.max)}`}</td><td className="mono text-muted">{r.hard === false ? "none" : r.hardMin !== undefined ? `< ${f(r.hardMin)}` : r.hardMax !== undefined ? `> ${f(r.hardMax)}` : "none"}</td><td className="mono">{Math.round(r.weight * 100)}%</td></tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="prose-a">
        <p><b className="text-fg">Verdict logic.</b> Any hard failure gives NO-GO. Otherwise, all rules passing on verified evidence gives GO. Anything else, including a rule whose evidence was withheld, gives WAIT. Three intents choose which rules apply: <b className="text-fg">creator</b> (all), <b className="text-fg">trader</b> (organic activity), <b className="text-fg">staker</b> (exposure).</p>
        <p>Sources: {cfg.sources.map((x, i) => <span key={x.url}>{i ? ", " : ""}<a className="text-fg underline underline-offset-4" href={x.url} target="_blank" rel="noreferrer">{x.label}</a></span>)}. Both are marked as evolving; thresholds are re-checked against them before each release.</p>

        <h2 id="backtest" className="scroll-mt-24">Back-test</h2>
        <p>Five seeded launches on the Elysium testnet chain model with planted ground truth: clean, early-stage, concentrated, wash-traded and clustered. Run <code>npm run backtest</code> to regenerate <code>evidence/backtest-summary.json</code> and the per-finding evidence JSON.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[["Verdicts correct", s.verdictAccuracy], ["Planted clusters found", s.plantedClustersFound], ["Planted wash wallets found", s.plantedWashWalletsFound], ["False-positive clusters (clean)", String(s.falsePositiveClustersOnCleanTokens)], ["False-positive wash wallets (clean)", String(s.falsePositiveWashWalletsOnCleanTokens)], ["Effective-holder max error", String(s.effectiveHolderMaxAbsError)]].map(([l, v]) => (
          <div key={l} className="card p-4"><div className="mono text-[26px] font-semibold tracking-tight">{v}</div><div className="mt-1 text-[12px] text-muted">{l}</div></div>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-dim">These are results on simulated data with a known answer. They show the signals find planted patterns and leave a clean token alone; they are not a claim about accuracy on real tokens.</p>

      <div className="prose-a">
        <h2 id="blind-spots" className="scroll-mt-24">Known blind spots</h2>
        <p>Each case below has a test in <code>tests/blindspots.test.ts</code> that pins how it is handled.</p>
      </div>
      <ul className="space-y-3">
        {BLIND.map(([t, d]) => (
          <li key={t} className="card-solid p-5"><div className="text-[14.5px] font-medium">{t}</div><p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{d}</p></li>
        ))}
      </ul>

      <div className="prose-a">
        <h2 id="indexing" className="scroll-mt-24">Indexing</h2>
        <p>Ascertain indexes a configurable list of tokens. Verdicts need the full holder set and every swap, so unindexed addresses get an honest “not indexed” page with a read-only on-chain probe rather than a guess.</p>
        <ul>
          <li><b className="text-fg">Today:</b> five simulated launches that follow the Ascend design (closed hook pool, USDC quote, no bonding curve) on the Elysium testnet chain model (id 99801).</li>
          <li><b className="text-fg">Adapters:</b> a standard ERC-20 plus pool adapter reads <code>Transfer</code> and <code>Swap</code> logs. The Ascend hook-pool adapter plugs in once Ascend publishes testnet addresses and the hook interface.</li>
          <li><b className="text-fg">Replay mode:</b> <code>npm run replay -- --chain 999 --token 0x…</code> runs the engine and verifier on real HyperEVM tokens, so back-tests use real behaviour while Elysium mainnet is pre-launch.</li>
        </ul>

        <h2 id="safety" className="scroll-mt-24">Safety wording</h2>
        <p>Ascertain describes observable on-chain patterns only. It never accuses a named person of wrongdoing, and clusters are described as “linked by funding source”. No audit is claimed. Scores are estimates and not financial advice.</p>
      </div>
    </div>
  );
}
