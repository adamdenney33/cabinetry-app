// Command hub for the Cowork "IG Content Studio" artifact. The artifact's
// only bridge to this machine is the osascript MCP (`do shell script …`), so
// every capability it needs is a subcommand here that prints ONE LINE of JSON
// to stdout (AppleScript mangles multi-line output — never print more).
//
//   node scripts/ig-studio-helper.mjs <cmd> [args]
//
//   templates                    → [{name,b64}]           template PNGs in out/instagram/social-templates
//   assets                       → [{name,path,b64,src}]  brand/screenshots + captured _shots + logo SVGs
//   audio                        → [names]                mp3s in marketing/audio
//   capture <Tab> [subSelector]  → {ok,path,b64}          fresh app screenshot (needs `npm run dev` up)
//   render <b64-job-json>        → {ok,log}               detached render via render-social-studio.mjs
//   status                       → {running,done,dir,error,tail}
//   outputs <slug>               → [{name,path,b64?,size}] rendered files for a job
//   save-caption <slug> <b64>    → {ok,path}              writes marketing/captions/<slug>.txt
//   chunk <token> <b64part>      → {ok,bytes}             append upload chunk to /tmp (base64 text)
//   commit-upload <token> <name> → {ok,path,b64}          decode chunks → out/instagram/studio/_uploads/
//
// Thumbnails are made with macOS `sips` at 240px so JSON payloads stay small.
import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(ROOT, 'out', 'instagram', 'social-templates');
const SHOTS = join(ROOT, 'out', 'instagram', 'studio', '_shots');
const UPLOADS = join(ROOT, 'out', 'instagram', 'studio', '_uploads');
const LOG = '/tmp/procabinet-ig-studio-render.log';
const PID = '/tmp/procabinet-ig-studio-render.pid';

const out = (obj) => process.stdout.write(JSON.stringify(obj));
const fail = (msg) => {
  out({ error: String(msg) });
  process.exit(0); // exit 0 so `do shell script` still returns the JSON
};

const IMG = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function thumb(path, px = 240) {
  try {
    if (extname(path).toLowerCase() === '.svg') {
      return `data:image/svg+xml;base64,${readFileSync(path).toString('base64')}`;
    }
    const tmp = join(tmpdir(), `igs-thumb-${basename(path)}.jpg`);
    execFileSync('sips', ['-Z', String(px), '-s', 'format', 'jpeg', path, '--out', tmp], { stdio: 'ignore' });
    return `data:image/jpeg;base64,${readFileSync(tmp).toString('base64')}`;
  } catch {
    return '';
  }
}

const listImages = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => IMG.has(extname(f).toLowerCase()))
        .sort()
    : [];

const [cmd, a1, a2] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'templates': {
      out(listImages(TEMPLATES).map((f) => ({ name: f.replace(/\.[^.]+$/, ''), b64: thumb(join(TEMPLATES, f)) })));
      break;
    }

    case 'assets': {
      const shots = listImages(SHOTS)
        .map((f) => ({ f, m: statSync(join(SHOTS, f)).mtimeMs }))
        .sort((x, y) => y.m - x.m)
        .slice(0, 12)
        .map(({ f }) => ({ name: f, path: join(SHOTS, f), b64: thumb(join(SHOTS, f)), src: 'capture' }));
      const uploads = listImages(UPLOADS).map((f) => ({ name: f, path: join(UPLOADS, f), b64: thumb(join(UPLOADS, f)), src: 'upload' }));
      const screens = listImages(join(ROOT, 'brand', 'screenshots')).map((f) => ({
        name: f, path: join(ROOT, 'brand', 'screenshots', f), b64: thumb(join(ROOT, 'brand', 'screenshots', f)), src: 'screenshot',
      }));
      const logos = existsSync(join(ROOT, 'brand', 'logo'))
        ? readdirSync(join(ROOT, 'brand', 'logo'))
            .filter((f) => ['.svg', '.png'].includes(extname(f).toLowerCase()))
            .map((f) => ({ name: f, path: join(ROOT, 'brand', 'logo', f), b64: thumb(join(ROOT, 'brand', 'logo', f)), src: 'logo' }))
        : [];
      out([...shots, ...uploads, ...screens, ...logos]);
      break;
    }

    case 'audio': {
      const dir = join(ROOT, 'marketing', 'audio');
      // music_* only — the tts_* files are narration clips, not reel music
      out(existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith('music_') && f.endsWith('.mp3')).sort().reverse() : []);
      break;
    }

    case 'capture': {
      if (!a1) fail('capture: missing tab name');
      let res = '';
      try {
        res = execFileSync('node', [join(ROOT, 'scripts', 'capture-app-shot.mjs'), a1, ...(a2 ? [a2] : [])], {
          cwd: ROOT, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        fail((e.stderr || e.stdout || e.message || '').toString().trim().split('\n').pop());
      }
      const m = res.match(/SAVED (.+)/);
      if (!m) fail('capture produced no file');
      out({ ok: true, path: m[1].trim(), b64: thumb(m[1].trim(), 480) });
      break;
    }

    case 'render': {
      if (!a1) fail('render: missing base64 job');
      const jobPath = '/tmp/procabinet-ig-studio-job.json';
      writeFileSync(jobPath, Buffer.from(a1, 'base64').toString('utf8'));
      writeFileSync(LOG, ''); // truncate previous run
      const fd = openSync(LOG, 'a');
      const child = spawn('node', [join(ROOT, 'scripts', 'render-social-studio.mjs'), jobPath], {
        cwd: ROOT, detached: true, stdio: ['ignore', fd, fd],
        env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` },
      });
      writeFileSync(PID, String(child.pid));
      child.unref();
      out({ ok: true, log: LOG });
      break;
    }

    case 'status': {
      const log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
      const done = /^DONE (.+)$/m.exec(log);
      const err = /^ERROR: (.+)$/m.exec(log);
      let running = false;
      if (!done && !err && existsSync(PID)) {
        try { process.kill(Number(readFileSync(PID, 'utf8')), 0); running = true; } catch { running = false; }
      }
      out({
        running, done: Boolean(done), dir: done ? done[1] : '', error: err ? err[1] : '',
        tail: log.split('\n').filter(Boolean).slice(-8).join(' | '),
      });
      break;
    }

    case 'outputs': {
      if (!a1) fail('outputs: missing slug');
      const dir = join(ROOT, 'out', 'instagram', 'studio', a1);
      if (!existsSync(dir)) fail(`no outputs at ${dir}`);
      out(readdirSync(dir).sort().map((f) => {
        const p = join(dir, f);
        return { name: f, path: p, size: statSync(p).size, b64: IMG.has(extname(f).toLowerCase()) ? thumb(p, 480) : '' };
      }));
      break;
    }

    case 'save-caption': {
      if (!a1 || !a2) fail('save-caption: usage <slug> <b64text>');
      const dir = join(ROOT, 'marketing', 'captions');
      mkdirSync(dir, { recursive: true });
      const p = join(dir, `${a1.replace(/[^a-z0-9-_]/gi, '-').toLowerCase()}.txt`);
      writeFileSync(p, Buffer.from(a2, 'base64').toString('utf8'));
      out({ ok: true, path: p });
      break;
    }

    case 'chunk': {
      if (!a1 || !a2) fail('chunk: usage <token> <b64part>');
      appendFileSync(join(tmpdir(), `igs-upload-${a1.replace(/\W/g, '')}.b64`), a2);
      out({ ok: true, bytes: a2.length });
      break;
    }

    case 'commit-upload': {
      if (!a1 || !a2) fail('commit-upload: usage <token> <name>');
      const src = join(tmpdir(), `igs-upload-${a1.replace(/\W/g, '')}.b64`);
      if (!existsSync(src)) fail('no chunks for token');
      mkdirSync(UPLOADS, { recursive: true });
      const name = a2.replace(/[^a-z0-9-_.]/gi, '-');
      const p = join(UPLOADS, name);
      writeFileSync(p, Buffer.from(readFileSync(src, 'utf8'), 'base64'));
      out({ ok: true, path: p, b64: thumb(p, 480) });
      break;
    }

    default:
      fail(`unknown command "${cmd}"`);
  }
} catch (e) {
  fail(e.message);
}
