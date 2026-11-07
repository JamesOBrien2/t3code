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
  rect.style.strokeDashoffset = "0";
});
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))));
console.log(
  await page.evaluate(() => {
    const rect = document.querySelector(".quit-hold-progress");
    const style = getComputedStyle(rect);
    return {
      animation: style.animationName,
      dashoffset: style.strokeDashoffset,
      dasharray: style.strokeDasharray,
      animations: rect.getAnimations().length,
    };
  }),
);
await page.screenshot({ path: "/private/var/folders/x8/0zn0bmyj5h30xfks7mnd_p3c0000gp/T/opencode/quit-gif/full0.png", clip: { x: 0, y: 37, width: 900, height: 120 } });
await browser.close();
