// IG Content Studio — local browser app server.
//
//   npm run ig-studio     → http://localhost:3036 (auto-opens)
//
// Serves scripts/ig-studio-app.html plus a small JSON API with full local
// file access (the Cowork-artifact version of this UI couldn't reach the
// Mac — artifacts can only call cloud connectors — hence this local server;
// see SPEC.md § 13, 2026-07-11).
//
//   GET  /                      the app
//   GET  /api/sync              {templates, assets, audio}
//   GET  /img?p=<abs path>      any image inside the repo (thumbs via <img>)
//   POST /api/render            body = job JSON (render-social-studio.mjs shape);
//                               spawns a detached render, then poll:
//   GET  /api/status            {running, done, dir, error, tail}
//   GET  /api/outputs?slug=x    rendered files for a job
//   POST /api/capture           {tab, sub?} → fresh app screenshot (needs `npm run dev`)
//   POST /api/upload?name=f.png raw image body → out/instagram/studio/_uploads/
//   POST /api/save-caption      {slug, text} → marketing/captions/<slug>.txt
//   POST /api/reveal            {path} → reveal in Finder (repo paths only)
//
// Binds 127.0.0.1 only. Log/pid files are shared with ig-studio-helper.mjs
// so chat-driven renders and this server never fight over state.
import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import {
  createReadStream, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { join, dirname, extname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PORT = 3036;
const TEMPLATES = join(ROOT, 'out', 'instagram', 'social-templates');
const SHOTS = join(ROOT, 'out', 'instagram', 'studio', '_shots');
const UPLOADS = join(ROOT, 'out', 'instagram', 'studio', '_uploads');
const LOG = '/tmp/procabinet-ig-studio-render.log';
const PID = '/tmp/procabinet-ig-studio-render.pid';
const IMG = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const json = (res, obj, code = 200) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};
const bad = (res, msg, code = 400) => json(res, { error: String(msg) }, code);

const inRepo = (p) => {
  const abs = resolve(p);
  return abs === ROOT || abs.startsWith(ROOT + '/') ? abs : null;
};
const imgUrl = (p) => '/img?p=' + encodeURIComponent(p);
const listImages = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => IMG.has(extname(f).toLowerCase())).sort() : [];

const readBody = (req) =>
  new Promise((res, rej) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });

function sync() {
  const templates = listImages(TEMPLATES).map((f) => ({
    name: f.replace(/\.[^.]+$/, ''), url: imgUrl(join(TEMPLATES, f)),
  }));
  const shots = listImages(SHOTS)
    .map((f) => ({ f, m: statSync(join(SHOTS, f)).mtimeMs }))
    .sort((x, y) => y.m - x.m)
    .slice(0, 16)
    .map(({ f }) => ({ name: f, path: join(SHOTS, f), url: imgUrl(join(SHOTS, f)), src: 'capture' }));
  const uploads = listImages(UPLOADS).map((f) => ({ name: f, path: join(UPLOADS, f), url: imgUrl(join(UPLOADS, f)), src: 'upload' }));
  const screens = listImages(join(ROOT, 'brand', 'screenshots')).map((f) => ({
    name: f, path: join(ROOT, 'brand', 'screenshots', f), url: imgUrl(join(ROOT, 'brand', 'screenshots', f)), src: 'screenshot',
  }));
  const logoDir = join(ROOT, 'brand', 'logo');
  const logos = listImages(logoDir).map((f) => ({ name: f, path: join(logoDir, f), url: imgUrl(join(logoDir, f)), src: 'logo' }));
  const audioDir = join(ROOT, 'marketing', 'audio');
  const audio = existsSync(audioDir)
    ? readdirSync(audioDir).filter((f) => f.startsWith('music_') && f.endsWith('.mp3')).sort().reverse()
    : [];
  return { synced: Date.now(), templates, assets: [...shots, ...uploads, ...screens, ...logos], audio };
}

function startRender(job) {
  const jobPath = '/tmp/procabinet-ig-studio-job.json';
  writeFileSync(jobPath, JSON.stringify(job));
  writeFileSync(LOG, '');
  const fd = openSync(LOG, 'a');
  const child = spawn('node', [join(ROOT, 'scripts', 'render-social-studio.mjs'), jobPath], {
    cwd: ROOT, detached: true, stdio: ['ignore', fd, fd],
    env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` },
  });
  writeFileSync(PID, String(child.pid));
  child.unref();
}

function status() {
  const log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
  const done = /^DONE (.+)$/m.exec(log);
  const err = /^ERROR: (.+)$/m.exec(log);
  let running = false;
  if (!done && !err && existsSync(PID)) {
    try { process.kill(Number(readFileSync(PID, 'utf8')), 0); running = true; } catch { running = false; }
  }
  // The Cowork file-sync layer over this folder can transiently wedge reads:
  // a render caught mid-stall blocks forever in read() with an empty log
  // (seen 2026-07-11 stuck on node_modules/is-stream/package.json). Flag it
  // so the UI can offer a retry instead of spinning forever.
  const stalled = running && !log.trim() && existsSync(LOG) && Date.now() - statSync(LOG).mtimeMs > 45_000;
  // process gone with no DONE/ERROR marker = it died silently (crash/kill)
  const died = !running && !done && !err && log.trim().length > 0;
  return {
    running, stalled, done: Boolean(done), dir: done ? done[1] : '',
    error: err ? err[1] : died ? 'render process died unexpectedly — hit Render to retry' : '',
    tail: log.split('\n').filter(Boolean).slice(-8).join(' | '),
  };
}

function killRender() {
  try { process.kill(Number(readFileSync(PID, 'utf8')), 'SIGKILL'); } catch {}
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(ROOT, 'scripts', 'ig-studio-app.html')));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/img') {
      const p = inRepo(url.searchParams.get('p') || '');
      if (!p || !IMG.has(extname(p).toLowerCase()) || !existsSync(p)) return bad(res, 'not found', 404);
      // stream asynchronously — a synchronous read here can wedge the whole
      // server if iCloud has evicted the file (see SPEC § 13, 2026-07-11)
      res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()], 'cache-control': 'no-cache' });
      const stream = createReadStream(p);
      stream.on('error', () => res.end());
      stream.pipe(res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/sync') return json(res, sync());
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, status());
    if (req.method === 'GET' && url.pathname === '/api/outputs') {
      const slug = (url.searchParams.get('slug') || '').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
      const dir = join(ROOT, 'out', 'instagram', 'studio', slug);
      if (!existsSync(dir)) return bad(res, 'no outputs yet', 404);
      return json(res, readdirSync(dir).sort().map((f) => {
        const p = join(dir, f);
        return { name: f, path: p, size: statSync(p).size, url: IMG.has(extname(f).toLowerCase()) ? imgUrl(p) : '' };
      }));
    }
    if (req.method === 'POST' && url.pathname === '/api/render') {
      const job = JSON.parse((await readBody(req)).toString('utf8'));
      if (!job || !Array.isArray(job.slides) || !job.slides.length) return bad(res, 'job has no slides');
      if (status().running) killRender(); // replace any stuck/previous render
      startRender(job);
      return json(res, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/kill-render') {
      killRender();
      return json(res, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/capture') {
      const { tab, sub } = JSON.parse((await readBody(req)).toString('utf8'));
      if (!tab) return bad(res, 'missing tab');
      execFile('node', [join(ROOT, 'scripts', 'capture-app-shot.mjs'), tab, ...(sub ? [sub] : [])], {
        cwd: ROOT, timeout: 120_000,
        env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` },
      }, (e, stdout, stderr) => {
        const m = /SAVED (.+)/.exec(stdout || '');
        if (e || !m) return bad(res, ((stderr || stdout || (e && e.message)) + '').trim().split('\n').pop());
        json(res, { ok: true, path: m[1].trim(), url: imgUrl(m[1].trim()) });
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const name = basename(url.searchParams.get('name') || 'upload.png').replace(/[^a-z0-9-_.]/gi, '-');
      if (!IMG.has(extname(name).toLowerCase())) return bad(res, 'images only');
      mkdirSync(UPLOADS, { recursive: true });
      const p = join(UPLOADS, name);
      writeFileSync(p, await readBody(req));
      return json(res, { ok: true, path: p, url: imgUrl(p) });
    }
    if (req.method === 'POST' && url.pathname === '/api/save-caption') {
      const { slug, text } = JSON.parse((await readBody(req)).toString('utf8'));
      const dir = join(ROOT, 'marketing', 'captions');
      mkdirSync(dir, { recursive: true });
      const p = join(dir, `${String(slug || 'post').replace(/[^a-z0-9-_]/gi, '-').toLowerCase()}.txt`);
      writeFileSync(p, String(text || ''));
      return json(res, { ok: true, path: p });
    }
    if (req.method === 'POST' && url.pathname === '/api/reveal') {
      const { path } = JSON.parse((await readBody(req)).toString('utf8'));
      const p = inRepo(path);
      if (!p || !existsSync(p)) return bad(res, 'not found', 404);
      execFile('open', ['-R', p]);
      return json(res, { ok: true });
    }
    bad(res, 'unknown route', 404);
  } catch (e) {
    bad(res, e.message, 500);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`IG Content Studio → ${url}`);
  if (process.platform === 'darwin' && !process.env.IG_STUDIO_NO_OPEN) execFile('open', [url]);
});
