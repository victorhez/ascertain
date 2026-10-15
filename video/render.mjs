import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const FPS = 30, DUR = 106;
const stills = process.argv.includes("--stills");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files", "--force-device-scale-factor=1"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.resolve("scene.html")).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
// preload all screenshots
await page.evaluate(async () => { await Promise.all(Object.values(SH).map((s) => new Promise((r) => { const i = new Image(); i.onload = r; i.onerror = r; i.src = s.img; }))); });
await new Promise((r) => setTimeout(r, 500));

if (stills) {
  mkdirSync("stills", { recursive: true });
  for (const t of [2.5, 5.5, 9, 13, 18, 22, 27, 31, 37, 45, 47.5, 52, 58, 66, 76, 80, 88, 92, 100, 104]) {
    await page.evaluate((t) => renderAt(t), t);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: `stills/t${String(t).replace(".", "_")}.jpg`, type: "jpeg", quality: 85 });
  }
} else {
  mkdirSync("frames", { recursive: true });
  const total = Number(process.env.END ?? FPS * DUR);
  const start = Number(process.env.START ?? 0);
  for (let f = start; f < total; f++) {
    await page.evaluate((t) => renderAt(t), f / FPS);
    await page.screenshot({ path: `frames/f${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
    if (f % 150 === 0) console.log("frame", f, "/", total);
  }
}
await browser.close();
