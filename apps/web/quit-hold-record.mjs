import { mkdir, rm } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:7016/quit-hold-preview.html";
const outDir =
  process.argv[3] ?? "/private/var/folders/x8/0zn0bmyj5h30xfks7mnd_p3c0000gp/T/opencode/quit-gif/frames";

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 900, height: 260 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});

const clip = { x: 0, y: 37, width: 900, height: 120 };
let frame = 0;
const capture = async () => {
  await page.screenshot({ path: `${outDir}/${String(frame).padStart(4, "0")}.png`, clip });
  frame += 1;
};
const paint = () =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(0)))),
  );

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.emitQuitHint === "function");
await page.evaluate(() => document.fonts.ready);

for (let index = 0; index < 6; index += 1) await capture();

await page.evaluate(() => window.emitQuitHint({ state: "down", mode: "hold", remainingMs: 1200 }));
await page.waitForSelector(".quit-hold-progress");
await page.evaluate(() => {
  const rect = document.querySelector(".quit-hold-progress");
  rect.style.animation = "none";
  rect.style.strokeDashoffset = "100";
});
await paint();

const STEPS = 30;
for (let step = 0; step <= STEPS; step += 1) {
  const offset = 100 - (step / STEPS) * 100;
  await page.evaluate((value) => {
    document.querySelector(".quit-hold-progress").style.strokeDashoffset = String(value);
  }, offset);
  await paint();
  await capture();
}
for (let index = 0; index < 4; index += 1) await capture();

await page.evaluate(() => window.emitQuitHint({ state: "up" }));
await paint();
for (let index = 0; index < 6; index += 1) await capture();

await browser.close();
console.log(`captured ${frame} frames in ${outDir}`);
