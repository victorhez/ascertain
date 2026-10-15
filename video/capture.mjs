// Captures real screenshots of the live product for the demo video.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";

const BASE = "https://ascertain.vercel.app";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem("ascertain-theme", "dark"); } catch {} });

async function shot(path, name, { wait = 1500, scrollTo, clip, prep } = {}) {
  await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 120000 });
  await new Promise((r) => setTimeout(r, wait));
  if (prep) await page.evaluate(prep);
  if (scrollTo) { await page.evaluate((y) => window.scrollTo(0, y), scrollTo); await new Promise((r) => setTimeout(r, 600)); }
  await page.screenshot({ path: `assets/${name}.png`, ...(clip ? { clip } : {}) });
  console.log("shot", name);
}

await shot("/", "home", { wait: 2500 });
await shot("/token/MIRT", "mirt-top", { wait: 2500 });
await shot("/token/MIRT", "mirt-rules", { wait: 1500, scrollTo: 820 });
await shot("/token/MIRT", "mirt-charts", { wait: 1500, scrollTo: 1700 });
await shot("/token/MIRT?verifier=off", "mirt-off", { wait: 2500 });
await shot("/token/LUMT", "lumt-top", { wait: 2500 });
await shot("/token/MIRT", "mirt-evidence", {
  wait: 1500,
  prep: () => { const d = document.querySelector("#evidence details"); if (d) { d.open = true; d.scrollIntoView({ block: "start" }); window.scrollBy(0, -80); } },
});
await shot("/withheld", "withheld", { wait: 2000 });
await shot("/real", "real", { wait: 2500 });
await shot("/token/HPL", "hpl-top", { wait: 2500 });
await shot("/submission", "submission", { wait: 2000 });
await browser.close();

// Real on-chain facts for the terminal scene
const res = await fetch("https://testnet-rpc.elysium.kinetiq.xyz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: ["0xe4d54889a150b58fa66ba59b2554511dd93256ba2c0b0a792ab187299d8dc8d2"] }) });
const j = await res.json();
writeFileSync("assets/tx.json", JSON.stringify(j.result, null, 2));
console.log("tx", j.result?.blockNumber, j.result?.from, j.result?.to, j.result?.value);
