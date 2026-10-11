"""Generate only an approval sample; do not replace the full demo narration."""
import asyncio
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'data' / 'demo' / 'voice-tools'))
import edge_tts

sample = (
    'Hello. Welcome to M A M R S, the Mood and Action Based Music Recommendation System. '
    'Choose how you feel, select an activity, and discover songs that match your preferences. '
    'For example, a romantic drive with songs by Arijit Singh. '
    'Your ratings help personalize the next set of recommendations.'
)
voice = 'en-IN-PrabhatNeural'

async def main():
    output = root / 'data' / 'voice-sample'
    output.mkdir(parents=True, exist_ok=True)
    voices = await asyncio.wait_for(edge_tts.list_voices(), timeout=20)
    matched = next((v for v in voices if v['ShortName'] == voice), None)
    if not matched or matched['Gender'] != 'Male' or matched['Locale'] != 'en-IN':
        raise RuntimeError('Selected Indian English male voice is unavailable')
    await asyncio.wait_for(edge_tts.Communicate(sample, voice, rate='-5%').save(str(output / 'Indian-Male-Sample.mp3')), timeout=45)
    (output / 'sample-details.json').write_text(json.dumps({
        'voice': matched, 'text': sample, 'rate': '-5%', 'synthetic': True,
        'fullVideoChanged': False
    }, indent=2), encoding='utf-8')
    print(json.dumps({'file': str(output / 'Indian-Male-Sample.mp3'), 'bytes': (output / 'Indian-Male-Sample.mp3').stat().st_size, 'voice': voice}))

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
asyncio.run(main())
