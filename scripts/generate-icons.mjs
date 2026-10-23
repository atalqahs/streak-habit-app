// Renders the app icon and iPhone splash screens to PNG with headless Chromium.
// Usage: npm run icons   (requires the `playwright` package and a Chromium build)
// Output is committed to public/, so normal builds need nothing extra.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(`${process.execPath.replace(/bin\/node$/, '')}lib/node_modules/playwright`));
}

const FLAME_OUTER =
  'M13.2 1.6c.5 3-1 4.9-2.6 6.6C8.9 10 7 11.9 6.4 14.6a6.1 6.1 0 0 0 5.6 7.8 6.3 6.3 0 0 0 6.6-6.2c0-2.7-1.2-4.6-2.4-6.1-.4 1.3-1.1 2.3-2.2 2.8.6-3.9-.3-8-.8-11.3Z';
const FLAME_CORE =
  'M12.3 13.2c-.1 1.5-1 2.4-1.8 3.2-.6.7-.9 1.4-.8 2.2a2.5 2.5 0 0 0 5 .1c.1-1.5-.7-2.6-1.4-3.4-.1.5-.4 1-.8 1.2.1-1.2 0-2.3-.2-3.3Z';

/** The glyph: a completed day (white disc + check) with a streak flame. 1024×1024 space. */
const glyph = (scale = 1) => `
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <circle cx="470" cy="560" r="270" fill="#fff"/>
    <path d="M345 565 l85 85 l170 -190" fill="none" stroke="#000" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="745" cy="330" r="150" fill="#0B0B0C"/>
    <g transform="translate(745 330) scale(10.5) translate(-12 -12)">
      <path d="${FLAME_OUTER}" fill="#FF7A1A"/>
      <path d="${FLAME_CORE}" fill="#FFC04D"/>
    </g>
  </g>`;

const iconSvg = ({ bg = '#0B0B0C', scale = 1 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
     <rect width="1024" height="1024" fill="${bg}"/>${glyph(scale)}</svg>`;

// Portrait iPhone sizes in CSS px and device pixel ratio.
const DEVICES = [
  [440, 956, 3], // 16 Pro Max
  [402, 874, 3], // 16 Pro
  [430, 932, 3], // 14 Pro Max – 15 Plus/Pro Max – 16 Plus
  [393, 852, 3], // 14 Pro – 15 / 15 Pro – 16
  [428, 926, 3], // 12/13 Pro Max – 14 Plus
  [390, 844, 3], // 12/13/14 – 12/13 Pro
  [375, 812, 3], // X/XS/11 Pro – 12/13 mini
  [414, 896, 3], // XS Max – 11 Pro Max
  [414, 896, 2], // XR – 11
  [375, 667, 2], // SE 2/3 – 6/7/8
];

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();

async function render(svg, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<html><body style="margin:0;background:#000">${svg.replace('<svg ', `<svg style="display:block;width:${width}px;height:${height}px" `)}</body></html>`,
  );
  writeFileSync(new URL(file, out), await page.screenshot({ type: 'png' }));
}

for (const size of [180, 192, 512]) {
  await render(iconSvg(), size, size, size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`);
}
await render(iconSvg({ scale: 0.78 }), 512, 512, 'icon-maskable-512.png');

const links = [];
for (const [w, h, dpr] of DEVICES) {
  const pw = w * dpr;
  const ph = h * dpr;
  const g = Math.round(pw * 0.28);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pw} ${ph}" width="${pw}" height="${ph}">
    <rect width="${pw}" height="${ph}" fill="#000"/>
    <svg x="${(pw - g) / 2}" y="${(ph - g) / 2}" width="${g}" height="${g}" viewBox="0 0 1024 1024">
      <rect width="1024" height="1024" rx="230" fill="#0B0B0C"/>${glyph()}</svg></svg>`;
  const name = `splash-${pw}x${ph}.png`;
  await render(svg, pw, ph, name);
  links.push(
    `<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" href="./icons/${name}" />`,
  );
}
await browser.close();

// Write the splash <link> tags into index.html between the markers.
const indexUrl = new URL('../index.html', import.meta.url);
const html = readFileSync(indexUrl, 'utf8').replace(
  /<!--SPLASH-->[\s\S]*?(<!--\/SPLASH-->|(?=\n\s*<style>))/,
  `<!--SPLASH-->\n    ${links.join('\n    ')}\n    <!--/SPLASH-->`,
);
writeFileSync(indexUrl, html);
console.log('Icons and splash screens written to public/icons/');
