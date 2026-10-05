// Eight-second original synthesized demo motif. No downloaded audio or copyrighted recordings.
export function previewWav(id) {
  const rate = 16000, seconds = 8, frames = rate * seconds;
  const out = Buffer.alloc(44 + frames * 2);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(frames * 2, 40);
  const scale = [0, 2, 4, 7, 9, 12, 9, 7];
  for (let i = 0; i < frames; i++) {
    const t = i / rate, beat = t % .5;
    const note = scale[(Math.floor(t * 2) + id) % scale.length];
    const freq = 220 * 2 ** ((note + id % 7) / 12);
    const envelope = Math.min(1, beat * 40) * Math.exp(-beat * 6) * Math.min(1, (seconds - t) * 3);
    const value = (Math.sin(2 * Math.PI * freq * t) + .2 * Math.sin(4 * Math.PI * freq * t)) * envelope * .2;
    out.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return out;
}
