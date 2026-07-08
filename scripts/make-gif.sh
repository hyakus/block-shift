#!/usr/bin/env bash
#
# Convert a device/simulator screen recording (MP4/MOV) into a crisp,
# pixel-perfect looping GIF for the README.
#
#   Usage: scripts/make-gif.sh <input-video> [width=320] [fps=15]
#   e.g.   scripts/make-gif.sh demo.mp4
#          scripts/make-gif.sh demo.mov 280 12   # smaller / lighter
#
# Output: docs/demo.gif
#
# Recording tips:
#   Android device:  adb shell screenrecord --size 720x1560 /sdcard/demo.mp4
#                    # Ctrl+C to stop, then: adb pull /sdcard/demo.mp4 .
#   iOS simulator:   xcrun simctl io booted recordVideo demo.mp4   # Ctrl+C to stop
#   Physical iPhone: use Control Center screen recording, AirDrop the .mov over.

set -euo pipefail

IN="${1:?usage: scripts/make-gif.sh <input-video> [width=320] [fps=15]}"
WIDTH="${2:-320}"
FPS="${3:-15}"
OUT="docs/demo.gif"
PALETTE="$(mktemp -t blockshift-palette).png"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install it with:  brew install ffmpeg" >&2
  exit 1
fi

mkdir -p docs

# Pass 1: generate an optimal colour palette (flags=neighbor keeps pixels crisp).
ffmpeg -y -i "$IN" \
  -vf "fps=${FPS},scale=${WIDTH}:-1:flags=neighbor,palettegen" "$PALETTE"

# Pass 2: render the GIF using that palette.
ffmpeg -y -i "$IN" -i "$PALETTE" \
  -lavfi "fps=${FPS},scale=${WIDTH}:-1:flags=neighbor[x];[x][1:v]paletteuse=dither=bayer" \
  "$OUT"

rm -f "$PALETTE"

BYTES=$(wc -c < "$OUT" | tr -d ' ')
echo "Wrote $OUT ($((BYTES / 1024)) KB)."
echo "If it's too big for GitHub, re-run with a smaller width/fps, e.g.: scripts/make-gif.sh \"$IN\" 280 12"
