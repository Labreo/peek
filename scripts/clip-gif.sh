#!/usr/bin/env bash
# Cut a GIF (or a still) from a recorded video.
#   scripts/clip-gif.sh <video> <start> <seconds> <out.gif> [width] [fps]
#   scripts/clip-gif.sh demo.mp4 0:42 4 docs/media/squint.gif 800 12
#   scripts/clip-gif.sh demo.mp4 0:05 0 docs/media/cover.png 1000      (seconds=0 -> single frame)
# Optional: PRE="crop=1920:806:0:274,eq=gamma=1.18" runs filters before scaling.
set -euo pipefail
in="$1"; ss="$2"; dur="$3"; out="$4"; w="${5:-800}"; fps="${6:-12}"
pre="${PRE:+${PRE},}"
if [[ "$dur" == "0" ]]; then
  ffmpeg -y -loglevel error -ss "$ss" -i "$in" -frames:v 1 -vf "${pre}scale=${w}:-1:flags=lanczos" "$out"
else
  ffmpeg -y -loglevel error -ss "$ss" -t "$dur" -i "$in" \
    -vf "${pre}fps=${fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" "$out"
fi
echo "wrote $out ($(du -h "$out" | cut -f1))"
