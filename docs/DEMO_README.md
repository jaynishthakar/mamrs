# Presentation files

- `docs/DEMO_SCRIPT.md`: four-minute narration and on-screen cues.
- `docs/CORE_MODULES.md`: implementation-to-diagram mapping and current limitations.
- `docs/demo-story.json`: editable narration, chapter titles and callouts.
- `docs/demo-neural-story.json`: shorter narration used for the approved Prabhat voice.
- `data/final-demo/MAMRS-Full-Demo.mp4`: final delivery with the approved Indian English male neural narration.
- `data/final-demo/Play Demo.html`: standalone browser player for the final video.
- `data/demo/mamrs-demo-4min.mp4`: 1920 × 1080 MP4 walkthrough with synthetic narration and burned-in captions.
- `data/demo/mamrs-demo.srt`: separate subtitle file; timings are approximate sentence-level alignment.
- `data/demo/mamrs-narration.wav`: four-minute narration track.
- `data/demo/demo-evidence.json`: actual before/after recommendation results from the captured app session.
- `data/demo/video-validation.json`: decoded output duration, dimensions and audio checks.

The video is an edited screenshot walkthrough, not a continuous screen recording. Screens were captured from the current application using a new in-memory database and a demo account. The three eligible songs shown belong to the isolated starter catalog; this is not the size of the user's working database. No live MusicBrainz/Discogs import, Spotify catalog, audio playback, or Supabase deployment is represented as completed.

## Rebuild locally

Prerequisites: the project's supported Node runtime, Playwright Core, installed Chrome, Python with NumPy, and the `edge-tts` client installed under `data/demo/voice-tools`. The capture step needs access to the existing React CDN; narration synthesis needs access to Microsoft's speech service. The approved voice is `en-IN-PrabhatNeural` at `-5%`, matching the sample. Natural speech is retained without speeding up or shifting pitch; scene durations and pauses fit the four-minute timeline.

The JavaScript tools accept `PLAYWRIGHT_PATH` (module path) and `CHROME_PATH` (browser executable). Defaults target the environment where this demo was generated. They use ephemeral localhost ports and close their servers afterward.

1. `node scripts/create-demo.mjs` — exercise the application, capture screens, and verify the rating changes the score.
2. `python scripts/create-neural-narration.py` — synthesize the approved Prabhat narration.
3. `node scripts/decode-neural-narration.mjs`, then `python scripts/prepare-demo.py --neural` — decode and align speech with twelve scenes; generate the script and subtitles.
4. `node scripts/render-demo.mjs --frames` — render scenes and captions at their scheduled times.
5. `python scripts/export-demo-offline.py` — encode a standard H.264/AAC MP4 and decode the entire file to check for errors. This needs `imageio-ffmpeg` under `data/demo/media-tools`. The offline method keeps duration fixed even if the computer pauses.
6. Copy the verified output to `data/final-demo/MAMRS-Full-Demo.mp4`, then run `node scripts/verify-demo.mjs` to check playback of the delivery file.

The older `scripts/demo-narration.ps1` remains available for the original local Windows voice, but is not used in the current delivery.

Generated media and capture evidence live under the existing ignored `data/` directory. Keep a separate copy of the final MP4 if sharing the presentation; it is not included by a normal Git push. The [shared video folder](https://drive.google.com/drive/folders/1OPB9C-5W27d4q_Sq22MXLoxTjYFJRuwk?usp=sharing) contains the demonstration submitted with the project.
