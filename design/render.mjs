// Rend une page HTML animée en GIF: node design/render.mjs <page.html> <sortie.gif> <durée s> [fps] [largeur gif] [boucle]
// Les animations CSS sont mises en pause puis positionnées image par image, le rendu est donc identique à chaque fois.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const [page, out, dur = "6", fps = "15", width = "800", loop = "0"] = process.argv.slice(2);
const html = path.resolve(page);
const { w, h } = await (async () => {
  const s = fs.readFileSync(html, "utf8").match(/html,body\{width:(\d+)px;height:(\d+)px/);
  return { w: +s[1], h: +s[2] };
})();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kxframes-"));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await p.goto("file://" + html);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
const n = Math.round(+dur * +fps);
for (let k = 0; k < n; k++) {
  const t = (k / +fps) * 1000;
  await p.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), t);
  await p.screenshot({ path: path.join(dir, `f${String(k).padStart(4, "0")}.png`) });
}
await b.close();
const ff = process.env.FFMPEG || "ffmpeg";
const scale = `fps=${fps},scale=${width}:-1:flags=lanczos`;
execFileSync(ff, ["-y", "-loglevel", "error", "-framerate", fps, "-i", path.join(dir, "f%04d.png"), "-vf", `${scale},palettegen=max_colors=256:stats_mode=diff`, path.join(dir, "pal.png")]);
execFileSync(ff, ["-y", "-loglevel", "error", "-framerate", fps, "-i", path.join(dir, "f%04d.png"), "-i", path.join(dir, "pal.png"),
  "-lavfi", `${scale}[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle`, "-loop", loop, out]);
fs.mkdirSync(new URL("./apercus/", import.meta.url), { recursive: true });
fs.copyFileSync(path.join(dir, `f${String(n - 1).padStart(4, "0")}.png`), new URL(`./apercus/${path.basename(out, ".gif")}.png`, import.meta.url));
fs.rmSync(dir, { recursive: true });
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + " Ko", n + " images");
