#!/usr/bin/env bash
# Combine a screen recording of Peek with real-world footage of the player (filmed from the side
# on another phone or camera), so the video shows the person, the lid and the game together.
#
# Usage:
#   scripts/compose-demo.sh <screen.mov> <room.mov> <out.mp4> [room_offset_s] [layout]
#
#   room_offset_s  Seconds to skip at the start of room.mov so both clips line up.
#                  Clap once on camera at the start of both recordings, find the clap in each,
#                  and pass (room clap time - screen clap time). Negative values delay room.mov.
#   layout         side  (default) screen left, room right, 1920x1080
#                  pip   room footage in the bottom-left corner of the full screen recording
#                  stack room on top, screen below, 1080x1920 (vertical, for shorts)
#
# Audio comes from the screen recording (game sound). Needs ffmpeg.
set -euo pipefail
screen="$1"; room="$2"; out="$3"; off="${4:-0}"; layout="${5:-side}"

if awk "BEGIN{exit !($off >= 0)}"; then
  room_in=(-ss "$off" -i "$room")
  room_delay=""
else
  room_in=(-i "$room")
  d=$(awk "BEGIN{print -($off)}")
  room_delay=",tpad=start_duration=${d}:start_mode=add:color=black"
fi

case "$layout" in
  side)
    fc="[0:v]scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:1080:(ow-iw)/2:(oh-ih)/2:color=black[s];
        [1:v]scale=640:1080:force_original_aspect_ratio=increase,crop=640:1080${room_delay}[r];
        [s][r]hstack=inputs=2[v]" ;;
  pip)
    fc="[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black[s];
        [1:v]scale=-2:400${room_delay}[r];
        [s][r]overlay=24:H-h-24[v]" ;;
  stack)
    fc="[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960${room_delay}[r];
        [0:v]scale=1080:960:force_original_aspect_ratio=decrease,pad=1080:960:(ow-iw)/2:(oh-ih)/2:color=black[s];
        [r][s]vstack=inputs=2[v]" ;;
  *) echo "unknown layout: $layout (side | pip | stack)"; exit 1 ;;
esac

ffmpeg -y -loglevel error -i "$screen" "${room_in[@]}" -filter_complex "$fc" \
  -map "[v]" -map "0:a?" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest "$out"
echo "wrote $out"
