#!/bin/bash
# Retry just the convert clip, then encode all webm → mp4.
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
LOG=/tmp/ad-clips.log
echo "== retry convert $(date) ==" >> "$LOG"
node scripts/record-wiki-clips.mjs convert-a-quote-to-an-order >> "$LOG" 2>&1 || { echo "RECORD FAILED" >> "$LOG"; exit 1; }
node scripts/postprocess-wiki-clips.mjs >> "$LOG" 2>&1 || { echo "ENCODE FAILED" >> "$LOG"; exit 1; }
echo "ALL DONE" >> "$LOG"
