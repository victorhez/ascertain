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

await shot("/withheld", "withheld", { wait: 2000 });
await shot("/real", "real", { wait: 2500 });
await shot("/token/HPL", "hpl-top", { wait: 2500 });


await browser.close();
