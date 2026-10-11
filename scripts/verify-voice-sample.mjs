import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { stat, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/jayni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve('data/voice-sample/Listen.html')).href);
  const result = await page.evaluate(async () => {
    const a = document.querySelector('audio');
    if(a.readyState < 1) await new Promise((resolve,reject) => { a.onloadedmetadata=resolve;a.onerror=reject; });
    a.muted=true; await a.play();await new Promise(r=>setTimeout(r,1200));a.pause();
    return {duration:a.duration,advanced:a.currentTime,error:a.error?.message || null};
  });
  const bytes = (await stat('data/voice-sample/Indian-Male-Sample.mp3')).size;
  if(result.error || result.advanced < .5 || !(result.duration > 5 && result.duration < 40) || bytes < 10000) throw new Error(JSON.stringify(result));
  await writeFile('data/voice-sample/playback-validation.json',JSON.stringify({...result,bytes},null,2));
  console.log(JSON.stringify({...result,bytes}));
} finally { await browser.close(); }
