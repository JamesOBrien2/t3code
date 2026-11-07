import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 260 }, deviceScaleFactor: 2, colorScheme: "dark" });
await page.goto("http://localhost:7016/quit-hold-preview.html", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.emitQuitHint === "function");
await page.evaluate(() => window.emitQuitHint({ state: "down", mode: "hold", remainingMs: 1200 }));
await page.waitForSelector(".quit-hold-progress");
await page.evaluate(() => {
  const rect = document.querySelector(".quit-hold-progress");
  rect.style.animation = "none";
  rect.style.stroke = "red";
  rect.style.strokeDasharray = "none";
  rect.style.strokeDashoffset = "0";
});
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))));
await page.screenshot({ path: "/private/var/folders/x8/0zn0bmyj5h30xfks7mnd_p3c0000gp/T/opencode/quit-gif/a-red-nodash.png", clip: { x: 0, y: 37, width: 900, height: 120 } });
console.log(
  "A",
  await page.evaluate(() => {
    const rect = document.querySelector(".quit-hold-progress");
    const s = getComputedStyle(rect);
    return { dasharray: s.strokeDasharray, dashoffset: s.strokeDashoffset, stroke: s.stroke };
  }),
);
await page.evaluate(() => {
  const rect = document.querySelector(".quit-hold-progress");
  rect.style.strokeDasharray = "100";
  rect.style.strokeDashoffset = "0";
});
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))));
await page.screenshot({ path: "/private/var/folders/x8/0zn0bmyj5h30xfks7mnd_p3c0000gp/T/opencode/quit-gif/b-red-dash0.png", clip: { x: 0, y: 37, width: 900, height: 120 } });
console.log(
  "B",
  await page.evaluate(() => {
    const rect = document.querySelector(".quit-hold-progress");
    const s = getComputedStyle(rect);
    return { dasharray: s.strokeDasharray, dashoffset: s.strokeDashoffset, stroke: s.stroke };
  }),
);
await page.evaluate(() => {
  const rect = document.querySelector(".quit-hold-progress");
  rect.style.strokeDashoffset = "50";
});
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))));
await page.screenshot({ path: "/private/var/folders/x8/0zn0bmyj5h30xfks7mnd_p3c0000gp/T/opencode/quit-gif/c-red-dash50.png", clip: { x: 0, y: 37, width: 900, height: 120 } });
await browser.close();
