import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 900, height: 260 },
  colorScheme: "dark",
});
await page.goto("http://localhost:7016/quit-hold-preview.html", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.emitQuitHint === "function");
await page.evaluate(() => window.emitQuitHint({ state: "down", mode: "hold", remainingMs: 1200 }));
await page.waitForSelector(".quit-hold-progress");
const samples = [];
for (let index = 0; index < 10; index += 1) {
  samples.push(
    await page.evaluate(() => {
      const rect = document.querySelector(".quit-hold-progress");
      const style = getComputedStyle(rect);
      const animation = rect.getAnimations()[0];
      return {
        at: Math.round(performance.now()),
        offset: style.strokeDashoffset,
        animationTime: animation ? Math.round(animation.currentTime) : null,
        duration: animation ? animation.effect.getTiming().duration : null,
        playState: animation?.playState,
        animationDuration: style.animationDuration,
      };
    }),
  );
  await page.waitForTimeout(150);
}
console.log(JSON.stringify(samples, null, 2));
await browser.close();
