#!/usr/bin/env bash
# Turn a folder of PEEK_SNAP frames into a GIF.
# Usage: scripts/make-gif.sh <frames-dir> <out.gif> [first-frame] [frame-count] [fps]
set -euo pipefail
dir="$1"; out="$2"; start="${3:-0}"; count="${4:-100}"; fps="${5:-10}"
ffmpeg -y -loglevel error -framerate "$fps" -start_number "$start" -i "$dir/snap-%03d.png" -frames:v "$count" \
  -vf "scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" "$out"
echo "wrote $out"
