// AES-GCM token encryption + HMAC OAuth-state signing for the accounting-*
// functions. Uses Web Crypto (`crypto.subtle`), available in Deno Deploy.
//
// Tokens at rest: `encrypt()` returns base64(iv‖ciphertext); `decrypt()` reverses
//   it. Key = ACCOUNTING_TOKEN_KEY (base64 of 32 random bytes / 256-bit).
// OAuth state: `signState()`/`verifyState()` produce a tamper-proof
//   `<base64url(payload)>.<base64url(hmac)>` string. Key = ACCOUNTING_STATE_SECRET.

const TOKEN_KEY_B64 = Deno.env.get('ACCOUNTING_TOKEN_KEY');
const STATE_SECRET = Deno.env.get('ACCOUNTING_STATE_SECRET');

// ── base64 helpers ──────────────────────────────────────────────────────────
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

// ── AES-GCM token encryption ─────────────────────────────────────────────────
let _aesKey: CryptoKey | null = null;
async function aesKey(): Promise<CryptoKey> {
  if (_aesKey) return _aesKey;
  if (!TOKEN_KEY_B64) throw new Error('ACCOUNTING_TOKEN_KEY not set');
  const raw = base64ToBytes(TOKEN_KEY_B64);
  if (raw.length !== 32) throw new Error('ACCOUNTING_TOKEN_KEY must be 32 bytes (base64-encoded)');
  _aesKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return _aesKey;
}

export async function encrypt(plain: string): Promise<string> {
  const key = await aesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  );
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return bytesToBase64(packed);
}

export async function decrypt(packedB64: string): Promise<string> {
  const key = await aesKey();
  const packed = base64ToBytes(packedB64);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ── HMAC OAuth-state ─────────────────────────────────────────────────────────
let _hmacKey: CryptoKey | null = null;
async function hmacKey(): Promise<CryptoKey> {
  if (_hmacKey) return _hmacKey;
  if (!STATE_SECRET) throw new Error('ACCOUNTING_STATE_SECRET not set');
  _hmacKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(STATE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return _hmacKey;
}

async function hmac(body: string): Promise<string> {
  const key = await hmacKey();
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return bytesToBase64Url(sig);
}

/** Sign a small JSON payload into a URL-safe `<payload>.<sig>` state string. */
export async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body)}`;
}

/** Verify + decode a state string. Returns null on tamper / malformed input. */
export async function verifyState(state: string): Promise<Record<string, unknown> | null> {
  const dot = state.lastIndexOf('.');
  if (dot < 1) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = await hmac(body);
  // Constant-time-ish compare (lengths are fixed for a given key/hash).
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)));
  } catch {
    return null;
  }
}

/** Generate a base64 256-bit key (helper for setup; not used at runtime). */
export function generateKeyB64(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
}
