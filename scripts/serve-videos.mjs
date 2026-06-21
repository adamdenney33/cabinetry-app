// Lightweight static server for rendered Remotion videos + preview images.
//
// Why this exists: the Remotion Reels Tracker artifact plays rendered .mp4s
// inline. Those files live on disk under out/, marketing/ and demo-video/.
// A sandboxed HTML page can't open file:// URLs, so we serve the media over a
// dedicated localhost port that does NOT clash with Vite (:3000) or the
// Remotion studios (:3031-3034).
//
//   npm run serve:videos      # then leave it running while you browse the tracker
//
// Serves ONLY media files under the whitelisted top-level dirs. Supports HTTP
// Range requests so the <video> element can seek/scrub. Bound to localhost.

import { createServer } from 'node:http';
import { stat, open } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.env.VIDEO_PORT || 3050);
const ALLOW_PREFIX = ['out/', 'marketing/', 'demo-video/'];
const TYPES = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.m4v': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
};

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');

  // reachability probe used by the artifact's "video server" status pill
  if (rel === '__ping') { res.writeHead(200).end('ok'); return; }

  const ext = extname(rel).toLowerCase();
  const allowed = ALLOW_PREFIX.some((p) => rel.startsWith(p));
  if (!allowed || !TYPES[ext] || rel.includes('..')) {
    res.writeHead(403).end('forbidden');
    return;
  }

  const file = normalize(join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end('forbidden'); return; }

  let info;
  try { info = await stat(file); } catch { res.writeHead(404).end('not found'); return; }
  if (!info.isFile()) { res.writeHead(404).end('not found'); return; }

  const total = info.size;
  const type = TYPES[ext];
  const range = req.headers.range;
  let fh;
  try {
    fh = await open(file, 'r');
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (Number.isNaN(start) || start < 0) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` }).end();
        await fh.close();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      fh.createReadStream({ start, end }).pipe(res).on('close', () => fh.close());
    } else {
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': total,
        'Accept-Ranges': 'bytes',
      });
      fh.createReadStream().pipe(res).on('close', () => fh.close());
    }
  } catch {
    try { await fh?.close(); } catch { /* ignore */ }
    if (!res.headersSent) res.writeHead(500).end('error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ▶ ProCabinet video server  →  http://localhost:${PORT}`);
  console.log(`    serving rendered reels from ${ROOT}/{out,marketing,demo-video}`);
  console.log(`    (used by the Remotion Reels Tracker artifact — leave running while you browse)\n`);
});
