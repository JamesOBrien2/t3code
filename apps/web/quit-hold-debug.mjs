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
await page.waitForSelector(".quit-hold-progress[data-holding='true']");
await page.evaluate(() => {
  const trace = document.querySelector(".quit-hold-progress");
  const animation = trace.getAnimations()[0];
  animation.pause();
  animation.currentTime = 600;
});
await page.evaluate(
  () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))),
);
const info = await page.evaluate(() => {
  const trace = document.querySelector(".quit-hold-progress");
  const pill = trace.parentElement;
  const traceStyle = getComputedStyle(trace);
  return {
    pill: pill.getBoundingClientRect().toJSON(),
    trace: trace.getBoundingClientRect().toJSON(),
    progress: traceStyle.getPropertyValue("--quit-hold-progress"),
    background: traceStyle.backgroundImage,
    mask: traceStyle.maskImage,
    maskComposite: traceStyle.maskComposite,
    webkitMaskComposite: traceStyle.webkitMaskComposite,
    color: traceStyle.color,
    animation: traceStyle.animation,
    animations: trace.getAnimations().map((a) => ({
      currentTime: a.currentTime,
      playState: a.playState,
      duration: a.effect.getTiming().duration,
    })),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({
  path: "/private/var/folders/x8/0zn0bmyj5h30xfks7mnd_p3c0000gp/T/opencode/quit-gif/debug.png",
});
await browser.close();
