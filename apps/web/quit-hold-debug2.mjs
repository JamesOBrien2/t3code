import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 720, height: 300 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
await page.goto("http://localhost:7016/quit-hold-preview.html", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.emitQuitHint === "function");
await page.evaluate(() => window.emitQuitHint({ state: "down", mode: "hold", remainingMs: 1200 }));
await page.waitForSelector(".quit-hold-progress");
const info = await page.evaluate(() => {
  const svg = document.querySelector(".quit-hold-trace");
  const track = document.querySelector(".quit-hold-track");
  const progress = document.querySelector(".quit-hold-progress");
  const progressStyle = getComputedStyle(progress);
  const trackStyle = getComputedStyle(track);
  return {
    svgHtml: svg.outerHTML,
    svgRect: svg.getBoundingClientRect().toJSON(),
    progressBBox: progress.getBBox(),
    progressTotalLength: progress.getTotalLength(),
    progressStyle: {
      stroke: progressStyle.stroke,
      strokeWidth: progressStyle.strokeWidth,
      dasharray: progressStyle.strokeDasharray,
      dashoffset: progressStyle.strokeDashoffset,
      animation: progressStyle.animation,
    },
    trackStyle: {
      stroke: trackStyle.stroke,
      strokeWidth: trackStyle.strokeWidth,
      dasharray: trackStyle.strokeDasharray,
    },
    animations: document.getAnimations().map((a) => ({
      target: a.effect.target?.getAttribute("class"),
      property: a.transitionProperty ?? null,
      playState: a.playState,
      currentTime: a.currentTime,
    })),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.evaluate(() => {
  const animation = document.querySelector(".quit-hold-progress").getAnimations()[0];
  animation.pause();
  animation.currentTime = 600;
});
await page.evaluate(
  () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))),
);
console.log(
  "at 600:",
  await page.evaluate(
    () => getComputedStyle(document.querySelector(".quit-hold-progress")).strokeDashoffset,
  ),
);
await page.screenshot({
  path: "/private/var/folders/x8/0zn0bmyj5h30xfks7mnd_p3c0000gp/T/opencode/quit-gif/debug2.png",
});
await browser.close();
