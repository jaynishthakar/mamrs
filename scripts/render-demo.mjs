import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import http from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/jayni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const out = resolve('data/demo');
const preview = process.argv.includes('--preview');
const framesOnly = process.argv.includes('--frames');
const timeline = JSON.parse(await readFile(resolve(out, 'timeline.json'), 'utf8'));
const images = {};
for (const s of timeline.scenes) if (s.image) images[s.image] = 'data:image/png;base64,' + (await readFile(resolve(out, s.image))).toString('base64');
const audio = (await readFile(resolve(out, 'mamrs-narration.wav'))).toString('base64');
const server = http.createServer(async (req, res) => {
  if (req.url === '/saved-video.mp4') {
    try { const bytes = await readFile(resolve(out, preview?'preview.mp4':'mamrs-demo-4min.mp4')); res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': bytes.length }); res.end(bytes); }
    catch { res.writeHead(500); res.end(); }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html><body style="margin:0;background:#142f25"><canvas width="1920" height="1080"></canvas></body></html>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-accelerated-video-encode'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  page.on('console', m => console.log(m.text()));
  await page.evaluate(async ({ timeline, images, audio, preview, framesOnly }) => {
    const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const art = {};
    for (const [name, src] of Object.entries(images)) { const img = new Image(); img.src = src; await img.decode(); art[name] = img; }
    const green = '#173f30', cream = '#f5f4ee', muted = '#67796b', lime = '#d9e5b0';
    function text(value, x, y, size=26, color=green, weight=400) { ctx.fillStyle=color; ctx.font=`${weight} ${size}px Arial`; ctx.fillText(value,x,y); }
    function wrap(value, x, y, width, size=26, color=green, line=36, weight=400) {
      ctx.font=`${weight} ${size}px Arial`; let row='';
      for (const word of value.split(' ')) { const next=row?row+' '+word:word; if(ctx.measureText(next).width>width && row){text(row,x,y,size,color,weight);y+=line;row=word;}else row=next; }
      if(row) text(row,x,y,size,color,weight);
      return y+line;
    }
    function box(x,y,w,h,color,r=18){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
    function draw(t) {
      const match=timeline.scenes.findIndex(s=>t>=s.start&&t<s.end),idx=match<0?11:match,s=timeline.scenes[idx];
      ctx.fillStyle=cream;ctx.fillRect(0,0,1920,1080);
      text('mamrs.',48,59,36,green,700); text(s.chapter,240,55,22,muted,600);
      text(String(idx+1).padStart(2,'0')+' / 12',1740,54,22,muted);
      ctx.fillStyle='#dce1d6';ctx.fillRect(48,85,1824,2);
      if(s.image){
        box(48,120,1352,845,'#e2e5db');
        ctx.save();ctx.beginPath();ctx.roundRect(48,120,1352,845,14);ctx.clip();ctx.drawImage(art[s.image],48,120,1352,845);ctx.restore();
        text('THE WALKTHROUGH',1440,161,19,muted,600);
        let y=wrap(s.title,1440,213,408,40,green,49,600)+38;
        for(const note of s.notes){ctx.fillStyle=green;ctx.beginPath();ctx.arc(1448,y-9,4,0,Math.PI*2);ctx.fill();y=wrap(note,1468,y,370,26,green,37)+24;}
        box(1436,835,436,116,'#e4eadb');
        wrap('Actual app screens',1458,869,392,23,green,31,600);
        wrap('Isolated demo account',1458,908,392,21,muted,29);
      } else {
        text(s.title,76,195,58,green,600);
        const first = idx===1;
        const cards=first?[
          ['01','CONTEXTUAL RECOMMENDATIONS','Preferences + mood + activity','Filter → prioritize → score','Song list + explanations'],
          ['02','RATINGS AND FEEDBACK','Rating + helpfulness','Save → refresh recommendations','Personal signals affect scores']
        ]:[
          ['✓','WORKING TODAY','Context and preference matching','Ratings: observed 86 → 92 points','Saved mixes + history + ingestion'],
          ['→','NEXT MILESTONES','Broader, reviewed song coverage','Relevance evaluation','Spotify-scale coverage remains future work']
        ];
        cards.forEach((card,i)=>{const x=76+i*905;box(x,272,865,522,i?green:'#e2e8d6');const c=i?cream:green;text(card[0],x+42,356,62,c,600);text(card[1],x+42,422,27,c,600);let y=510;for(const line of card.slice(2))y=wrap(line,x+42,y,773,34,c,47)+30;});
        wrap(first?'Select context → generate results → rate a song → refresh':'Rule-based prototype • Recommendations only • No complete Spotify catalog',76,873,1750,32,green,44);
      }
      const cue=timeline.captions.find(c=>t>=c.start&&t<c.end);
      if(cue){box(40,977,1840,80,green,12);wrap(cue.text,67,1008,1784,25,cream,31);}
      ctx.fillStyle='#dce1d6';ctx.fillRect(0,1072,1920,8);ctx.fillStyle='#719048';ctx.fillRect(0,1072,1920*Math.min(t/240,1),8);
    }
    window.demoDraw=draw;
    if(framesOnly) { draw(0);return; }
    const ac=new AudioContext();await ac.resume();
    const bytes=Uint8Array.from(atob(audio),c=>c.charCodeAt(0));
    const buffer=await ac.decodeAudioData(bytes.buffer);
    const source=ac.createBufferSource();source.buffer=buffer;
    const destination=ac.createMediaStreamDestination();source.connect(destination);
    const stream=canvas.captureStream(0);const videoTrack=stream.getVideoTracks()[0];destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
    const mime='video/mp4;codecs=avc1.42E01E,mp4a.40.2';
    if(!MediaRecorder.isTypeSupported(mime))throw new Error('MP4 encoder unavailable');
    const chunks=[];const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2600000,audioBitsPerSecond:128000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    window.demoDone=new Promise((resolve,reject)=>{recorder.onerror=e=>reject(e.error);recorder.onstop=async()=>{try{const blob=new Blob(chunks,{type:mime});window.demoBlob=blob;resolve({bytes:blob.size,type:blob.type});}catch(e){reject(e);}};});
    const start=ac.currentTime+.12;draw(0);recorder.start(1000);videoTrack.requestFrame();source.start(start);
    let last=-1;const total=preview?8:240;
    const interval=setInterval(()=>{const t=Math.max(0,ac.currentTime-start);draw(Math.min(t,239.999));videoTrack.requestFrame();const match=timeline.scenes.findIndex(s=>t>=s.start&&t<s.end),idx=match<0?11:match;if(idx!==last){last=idx;console.log(`Rendering scene ${idx+1}/12`);}if(t>=total){clearInterval(interval);source.stop();recorder.stop();stream.getTracks().forEach(t=>t.stop());ac.close();}},1000/24);
  }, { timeline, images, audio, preview, framesOnly });
  if(framesOnly) {
    const folder=resolve(out,'frames');await mkdir(folder,{recursive:true});
    const boundaries=[...new Set([0,240,...timeline.scenes.flatMap(s=>[s.start,s.end]),...timeline.captions.flatMap(c=>[c.start,c.end])].filter(t=>t>=0&&t<=240))].sort((a,b)=>a-b);
    const lines=[];let count=0,lastFile='';
    for(let i=0;i<boundaries.length-1;i++){
      const duration=boundaries[i+1]-boundaries[i];if(duration<.00001)continue;
      const midpoint=(boundaries[i]+boundaries[i+1])/2;
      const bytes=await page.evaluate(t=>{window.demoDraw(t);return document.querySelector('canvas').toDataURL('image/png').split(',')[1];},midpoint);
      const file=`frame-${String(count++).padStart(3,'0')}.png`;lastFile=file;
      await writeFile(resolve(folder,file),Buffer.from(bytes,'base64'));
      lines.push(`file '${file}'`,`duration ${duration.toFixed(8)}`);
    }
    lines.push(`file '${lastFile}'`);await writeFile(resolve(folder,'frames.txt'),lines.join('\n')+'\n');
    console.log(JSON.stringify({frames:count,duration:240,voice:timeline.voice,framesFile:resolve(folder,'frames.txt')}));
    // Main module's finally block still closes the browser and local server.
  } else {
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(out, 'video-preview.png') });
  const metadata=await page.evaluate(()=>window.demoDone);
  // Codec parameters can contain commas. Split at the base64 marker, not the first comma.
  const base64=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.slice(r.result.indexOf(';base64,')+8));r.onerror=reject;r.readAsDataURL(window.demoBlob);}));
  const target=resolve(out,preview?'preview.mp4':'mamrs-demo-4min.mp4');
  const exported = Buffer.from(base64,'base64');
  if(exported.length !== metadata.bytes || exported.toString('ascii',4,8) !== 'ftyp') throw new Error('Invalid MP4 export bytes');
  await writeFile(target,exported);
  const saved = await readFile(target);
  if(!saved.equals(exported)) throw new Error('Saved video differs from encoded video');
  // Re-read the SAVED FILE over localhost; validation must not use the original in-memory blob.
  await page.evaluate(async()=>{const r=await fetch('/saved-video.mp4');if(!r.ok)throw new Error('Could not reopen saved video');window.demoBlob=await r.blob();});
  const validation=await page.evaluate(async()=>{const v=document.createElement('video');v.src=URL.createObjectURL(window.demoBlob);await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=reject;});window.demoVideo=v;const ac=new AudioContext();const decoded=await ac.decodeAudioData(await window.demoBlob.arrayBuffer());const pcm=decoded.getChannelData(0);let sum=0;for(const n of pcm)sum+=n*n;await ac.close();return{duration:v.duration,width:v.videoWidth,height:v.videoHeight,audioDuration:decoded.duration,audioRms:Math.sqrt(sum/pcm.length)};});
  if(!preview && Math.abs(validation.duration-240)>.75)throw new Error(`Unexpected video duration: ${validation.duration}`);
  if(validation.width !== 1920 || validation.height !== 1080 || !(validation.audioRms > .001)) throw new Error('Saved MP4 is missing the expected video or audio track');
  for(const t of (preview?[1,2.5]:[5,35,95,155,235])){
    const frame=await page.evaluate(async t=>{const v=window.demoVideo;await new Promise(r=>{v.onseeked=r;v.currentTime=t;});await new Promise(r=>setTimeout(r,100));const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return c.toDataURL('image/png').split(',')[1];},t);
    await writeFile(resolve(out,`encoded-frame-${t}.png`),Buffer.from(frame,'base64'));
  }
  await writeFile(resolve(out,preview?'preview-validation.json':'video-validation.json'),JSON.stringify({...metadata,...validation,voice:timeline.voice,rate:timeline.rate,output:target},null,2));
  console.log(JSON.stringify({...metadata,...validation,voice:timeline.voice,rate:timeline.rate,output:target}));
  }
} finally { await browser?.close();await new Promise(r=>server.close(r)); }
