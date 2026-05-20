// Generate narration MP3s for the workflow video by calling the ElevenLabs
// REST API directly. Reads the API key from the Claude Desktop extension
// settings (same key the ElevenLabs MCP would use), writes audio files into
// marketing/audio/ where the Remotion composition references them.
//
// Usage:  node remotion/_src/gen-narration.mjs
//
// Idempotent — skips scenes whose MP3 already exists. Force regen by
// deleting the file or passing --force.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const SRC = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SRC, '..', '..');
const SCRIPT = join(SRC, '..', 'narration.json');
const OUT_DIR = join(ROOT, 'marketing', 'audio');
const SETTINGS = join(
  homedir(),
  'Library/Application Support/Claude/Claude Extensions Settings',
  'ant.dir.gh.elevenlabs.elevenlabs-player.json',
);

const force = process.argv.includes('--force');

const { userConfig } = JSON.parse(readFileSync(SETTINGS, 'utf8'));
const API_KEY = userConfig?.api_key;
if (!API_KEY || !API_KEY.startsWith('sk_')) {
  throw new Error('No ElevenLabs API key in ' + SETTINGS);
}

const script = JSON.parse(readFileSync(SCRIPT, 'utf8'));
mkdirSync(OUT_DIR, { recursive: true });

const url = (voiceId) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

let totalChars = 0;
for (const scene of script.scenes) {
  const file = join(OUT_DIR, `${scene.id}.mp3`);
  if (existsSync(file) && !force) {
    console.log(`  skip  ${scene.id}.mp3  (already exists, --force to regen)`);
    continue;
  }
  console.log(`  gen   ${scene.id}.mp3  (${scene.text.length} chars)…`);
  totalChars += scene.text.length;
  const res = await fetch(url(script.voice_id), {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: scene.text,
      model_id: script.model_id,
      voice_settings: {
        // Cloned-voice tuning: similarity high so the model stays faithful
        // to the training samples; stability mid so it has room to phrase
        // naturally without drifting; style low — explanatory voiceover
        // shouldn't sound theatrical or "narrator-y".
        stability: 0.55,
        similarity_boost: 0.90,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs API ${res.status} for ${scene.id}: ${body}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  const kb = (statSync(file).size / 1024).toFixed(0);
  console.log(`        wrote ${kb} KB`);
}

console.log(`Done — ${totalChars} chars billed.`);
