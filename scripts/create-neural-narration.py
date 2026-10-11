"""Generate the approved Indian English male narration at the sample's pace."""
import asyncio, json, sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'data' / 'demo' / 'voice-tools'))
import edge_tts

async def main():
    output = root / 'data' / 'demo' / 'neural'
    output.mkdir(parents=True, exist_ok=True)
    texts = json.loads((root / 'docs' / 'demo-neural-story.json').read_text(encoding='utf-8'))
    for i, text in enumerate(texts):
        audio = output / f'voice-{i:02}.mp3'
        boundaries = output / f'voice-{i:02}.json'
        if audio.exists() and audio.stat().st_size > 10000 and boundaries.exists():
            saved = json.loads(boundaries.read_text(encoding='utf-8'))
            if saved['text'] == text:
                print(f'Using verified cached narration {i+1}/12', flush=True)
                continue
        async def synthesize():
            events = []
            with audio.open('wb') as target:
                async for event in edge_tts.Communicate(text, 'en-IN-PrabhatNeural', rate='-5%', boundary='WordBoundary').stream():
                    if event['type'] == 'audio': target.write(event['data'])
                    elif event['type'] == 'WordBoundary': events.append(event)
            if audio.stat().st_size < 10000 or not events:
                raise RuntimeError('Missing synthesized audio or timing boundaries')
            boundaries.write_text(json.dumps({'voice':'en-IN-PrabhatNeural','rate':'-5%','text':text,'events':events}, indent=2),encoding='utf-8')
        for attempt in range(3):
            try:
                await asyncio.wait_for(synthesize(), timeout=45)
                break
            except Exception:
                if attempt == 2: raise
                await asyncio.sleep(2)
        print(f'Generated narration {i+1}/12', flush=True)

if sys.platform == 'win32': asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
asyncio.run(main())
