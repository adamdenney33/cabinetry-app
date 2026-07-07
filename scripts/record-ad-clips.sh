#!/bin/bash
# Detached launcher: record the landing-ad clips off the real app.
# Starts the dev server if it isn't up, drives the wiki recording scripts
# (registry order, so early clips see the pristine seed), then encodes MP4s.
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

LOG=/tmp/ad-clips.log
echo "== record-ad-clips $(date) ==" > "$LOG"

# 1. Dev server
if ! curl -s -o /dev/null --max-time 2 http://localhost:3000; then
  echo "starting vite…" >> "$LOG"
  nohup npm run dev >> /tmp/ad-vite.log 2>&1 &
  VITE_PID=$!
  for i in $(seq 1 30); do
    sleep 1
    curl -s -o /dev/null --max-time 2 http://localhost:3000 && break
  done
fi
curl -s -o /dev/null --max-time 2 http://localhost:3000 || { echo "vite failed" >> "$LOG"; exit 1; }
echo "vite up" >> "$LOG"

# 2. Record (registry order)
node scripts/record-wiki-clips.mjs \
  dashboard-overview schedule-your-workshop stock-and-materials \
  optimised-cut-list build-and-price-a-cabinet create-and-send-a-quote \
  convert-a-quote-to-an-order >> "$LOG" 2>&1 || { echo "RECORD FAILED" >> "$LOG"; exit 1; }

# 3. Encode webm → mp4
node scripts/postprocess-wiki-clips.mjs >> "$LOG" 2>&1 || { echo "ENCODE FAILED" >> "$LOG"; exit 1; }

echo "ALL DONE" >> "$LOG"
