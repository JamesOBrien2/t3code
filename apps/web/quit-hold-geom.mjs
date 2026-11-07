import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 260 }, deviceScaleFactor: 2, colorScheme: "dark" });
await page.goto("http://localhost:7016/quit-hold-preview.html", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.emitQuitHint === "function");
await page.evaluate(() => window.emitQuitHint({ state: "down", mode: "hold", remainingMs: 1200 }));
await page.waitForSelector(".quit-hold-progress");

const result = await page.evaluate(() => {
  const progress = document.querySelector(".quit-hold-progress");
  const track = document.querySelector(".quit-hold-track");
  const out = {};
  for (const [name, rect] of [["progress", progress], ["track", track]]) {
    const style = getComputedStyle(rect);
    out[name] = {
      x: style.x,
      y: style.y,
      width: style.width,
      height: style.height,
      rx: style.rx,
      dasharray: style.strokeDasharray,
      dashoffset: style.strokeDashoffset,
      animation: style.animationName,
      totalLength: rect.getTotalLength(),
      samples: [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((fraction) => {
        const point = rect.getPointAtLength(rect.getTotalLength() * fraction);
        return [Math.round(point.x), Math.round(point.y)];
      }),
    };
  }
  track.style.stroke = "red";
  track.style.strokeWidth = "4";
  track.style.strokeDasharray = "none";
  progress.style.display = "none";
  return out;
});
console.log(JSON.stringify(result, null, 2));
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))));
await page.screenshot({ path: "/private/var/folders/x8/0zn0bmyj5h30xfks7mnd_p3c0000gp/T/opencode/quit-gif/geom.png", clip: { x: 0, y: 37, width: 900, height: 120 } });
await browser.close();
