import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/jayni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const original = await readFile('data/demo/mamrs-demo-4min.mp4');
const delivered = await readFile('data/final-demo/MAMRS-Full-Demo.mp4');
if(!original.equals(delivered)) throw new Error('Delivery copy mismatch');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve('data/final-demo/Play Demo.html')).href);
  const result = await page.evaluate(async () => {
    const v = document.querySelector('video');
    if(v.readyState < 1) await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=reject;});
    v.muted=true;await v.play();await new Promise(r=>setTimeout(r,1500));
    const advanced=v.currentTime;v.pause();
    await new Promise(r=>{v.onseeked=r;v.currentTime=235;});
    return { duration:v.duration,width:v.videoWidth,height:v.videoHeight,playbackAdvancedSeconds:advanced,seekSeconds:v.currentTime,error:v.error?.message || null };
  });
  if(result.error || result.playbackAdvancedSeconds < .5 || result.seekSeconds !== 235 || result.width !== 1920 || Math.abs(result.duration-240)>.75) throw new Error(JSON.stringify(result));
  const timeline=JSON.parse(await readFile('data/demo/timeline.json','utf8'));
  const report={...result,voice:timeline.voice,rate:timeline.rate,bytes:delivered.length,sha256:createHash('sha256').update(delivered).digest('hex')};
  await writeFile('data/demo/delivered-playback-validation.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
