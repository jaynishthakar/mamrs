"""Encode an ordinary H.264/AAC MP4 on a fixed timeline, independent of wall-clock pauses."""
import json, subprocess, sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'data' / 'demo' / 'media-tools'))
import imageio_ffmpeg
out = root / 'data' / 'demo'
temporary = out / 'mamrs-neural-export.mp4'
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
command = [ffmpeg, '-hide_banner', '-loglevel', 'warning', '-y',
           '-f', 'concat', '-safe', '0', '-i', str(out / 'frames' / 'frames.txt'),
           '-i', str(out / 'mamrs-narration.wav'), '-map', '0:v:0', '-map', '1:a:0',
           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
           '-r', '24', '-g', '48', '-c:a', 'aac', '-b:a', '160k', '-t', '240',
           '-movflags', '+faststart', str(temporary)]
subprocess.run(command, check=True, timeout=180)
if temporary.stat().st_size < 1000000: raise RuntimeError('Video export is too small')
# Decode the complete file, rather than validating only its header or first frame.
subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-xerror', '-i', str(temporary), '-f', 'null', '-'], check=True, timeout=90)
temporary.replace(out / 'mamrs-demo-4min.mp4')
timeline = json.loads((out / 'timeline.json').read_text(encoding='utf-8'))
report = {'voice':timeline['voice'], 'rate':timeline['rate'], 'export':'offline H.264/AAC',
          'durationRequested':240, 'fullDecodePassed':True, 'bytes':(out / 'mamrs-demo-4min.mp4').stat().st_size}
(out / 'video-validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
