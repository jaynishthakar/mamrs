import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'C:/Users/jayni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  const page=await browser.newPage();
  const results=[];
  for(let i=0;i<12;i++){
    const stem=`data/demo/neural/voice-${String(i).padStart(2,'0')}`;
    const bytes=await readFile(stem+'.mp3');
    const decoded=await page.evaluate(async base64=>{
      const ac=new AudioContext();const src=await ac.decodeAudioData(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)).buffer);
      const rate=22050, frames=Math.round(src.duration*rate), offline=new OfflineAudioContext(1,frames,rate);
      const input=offline.createBufferSource();input.buffer=src;input.connect(offline.destination);input.start();
      const audio=(await offline.startRendering()).getChannelData(0);await ac.close();
      const pcm=new ArrayBuffer(audio.length*2),view=new DataView(pcm);let sum=0;
      for(let j=0;j<audio.length;j++){const n=Math.max(-1,Math.min(1,audio[j]));view.setInt16(j*2,Math.round(n*(n<0?32768:32767)),true);sum+=n*n;}
      const u8=new Uint8Array(pcm);let binary='';for(let p=0;p<u8.length;p+=16384)binary+=String.fromCharCode(...u8.subarray(p,p+16384));
      return {pcm:btoa(binary),duration:audio.length/rate,rms:Math.sqrt(sum/audio.length),rate};
    },bytes.toString('base64'));
    if(!(decoded.duration>1 && decoded.rms>.001))throw new Error('Empty narration '+i);
    const pcm=Buffer.from(decoded.pcm,'base64'),header=Buffer.alloc(44);
    header.write('RIFF',0);header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(decoded.rate,24);header.writeUInt32LE(decoded.rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
    await writeFile(stem+'.wav',Buffer.concat([header,pcm]));
    results.push({scene:i+1,duration:decoded.duration,rms:decoded.rms});
  }
  await writeFile('data/demo/neural/decoded-audio.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({scenes:results,totalSpeechSeconds:results.reduce((sum,r)=>sum+r.duration,0)}));
}finally{await browser.close();}
