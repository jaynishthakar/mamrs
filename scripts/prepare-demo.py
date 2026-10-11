"""Align locally synthesized narration to twelve 20-second scenes."""
import json, re, wave, sys
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parent.parent
out = root / 'data' / 'demo'
scenes = json.loads((root / 'docs' / 'demo-story.json').read_text(encoding='utf-8'))
neural = '--neural' in sys.argv
if neural:
    texts = json.loads((root / 'docs' / 'demo-neural-story.json').read_text(encoding='utf-8'))
    for scene, text in zip(scenes, texts): scene['narration'] = text
    durations = []
    for i in range(len(scenes)):
        with wave.open(str(out / 'neural' / f'voice-{i:02}.wav'), 'rb') as f:
            durations.append(f.getnframes()/f.getframerate())
    if sum(durations) > 234: raise ValueError(f'Natural speech needs {sum(durations):.1f}s; shorten the text before exporting')
    gap = (240-sum(durations))/len(scenes)
    cursor_scene = 0
sample_rate = 22050
track = np.zeros(240 * sample_rate, dtype=np.int16)
captions = []
script = ['# MAMRS — four-minute demo script', '',
          'Duration: **4:00**. Twelve scenes; timings follow the narration with pauses for the on-screen actions.', '',
          'The generated video is an edited walkthrough of actual app screenshots with synthetic English narration and captions. It uses an isolated test account and starter catalog. No live provider import is shown. Module names follow the earlier traceability and current source; the original diagram PDFs are not available in this checkout.', '',
          'See [core module mapping](CORE_MODULES.md) for implementation evidence and limitations.', '']
def stamp(t):
    ms = round(t * 1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
for i, scene in enumerate(scenes):
    with wave.open(str((out / 'neural' if neural else out) / f'voice-{i:02}.wav'), 'rb') as f:
        if f.getsampwidth() != 2: raise ValueError('Expected 16-bit PCM')
        raw = np.frombuffer(f.readframes(f.getnframes()), dtype='<i2').astype(float)
        raw = raw.reshape(-1, f.getnchannels()).mean(axis=1)
        original_duration = len(raw) / f.getframerate()
    duration = original_duration if neural else min(19.15, original_duration)
    audio = np.interp(np.linspace(0, len(raw)-1, round(duration*sample_rate)), np.arange(len(raw)), raw).astype('<i2')
    scene_start = cursor_scene if neural else i*20
    scene_end = scene_start + duration + gap if neural else (i+1)*20
    if neural: cursor_scene = scene_end
    start = scene_start + .25 if neural else i*20 + .35
    offset = round(start*sample_rate)
    track[offset:offset+len(audio)] = audio
    sentences = re.split(r'(?<=[.!?])\s+', scene['narration'])
    weights = [len(s.split()) for s in sentences]
    cursor = start
    for sentence, weight in zip(sentences, weights):
        end = cursor + duration * weight / sum(weights)
        captions.append({'start': cursor, 'end': end, 'text': sentence})
        cursor = end
    scene.update(start=scene_start, end=scene_end, speechDuration=duration)
    a, b = round(scene_start), round(scene_end)
    script += [f'## {a//60}:{a%60:02}–{b//60}:{b%60:02} — {scene["title"]}', '',
               '**On screen:** ' + '; '.join(scene['notes']) + '.', '', scene['narration'], '']
    print(f'Scene {i+1}: {original_duration:.1f}s speech, {duration:.1f}s on timeline')
with wave.open(str(out / 'mamrs-narration.wav'), 'wb') as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(sample_rate); f.writeframes(track.tobytes())
(out / 'timeline.json').write_text(json.dumps({'scenes': scenes, 'captions': captions, 'voice': 'en-IN-PrabhatNeural' if neural else 'Microsoft Zira Desktop', 'rate': '-5%' if neural else 'local', 'naturalTiming': neural}, indent=2), encoding='utf-8')
(out / 'mamrs-demo.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["text"]}' for i,c in enumerate(captions)) + '\n', encoding='utf-8')
(root / 'docs' / 'DEMO_SCRIPT.md').write_text('\n'.join(script), encoding='utf-8')
