// Per-provider OAuth + Accounting-API operations for QuickBooks Online and Xero.
//
// All provider-specific knowledge lives here so the four accounting-* functions
// stay provider-agnostic. The app pushes a normalised InvoiceInput; this module
// shapes it into each provider's JSON.
//
// NOTE: the live JSON shapes (QBO ItemRef requirement, Xero AccountCode, the
// tax-code mapping) are the areas most likely to need a tweak during live
// sandbox testing — they're implemented to the documented APIs but cannot be
// verified here without provider credentials.

export type Provider = 'quickbooks' | 'xero';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

/** A connection row (subset the functions read). */
export interface Conn {
  provider: Provider;
  realm_id: string | null;
  tenant_id: string | null;
  default_tax_code: string | null;
}

export interface InvoiceLineInput {
  description: string;
  amount: number; // tax-exclusive line total
}

export interface InvoiceInput {
  contactId: string;
  reference: string; // e.g. "ORD-0008"
  lines: InvoiceLineInput[];
  taxCode: string | null; // connection.default_tax_code; null = no tax
  dueDate: string | null; // YYYY-MM-DD
}

export interface ClientInput {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

const QBO_ENV = (Deno.env.get('QBO_ENVIRONMENT') ?? 'sandbox').toLowerCase();
const QBO_PROD = QBO_ENV === 'production';
const QBO_API_BASE = QBO_PROD
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com';
const QBO_APP_BASE = QBO_PROD ? 'https://app.qbo.intuit.com' : 'https://app.sandbox.qbo.intuit.com';

interface ProviderCfg {
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  scope: string;
  clientId(): string | undefined;
  clientSecret(): string | undefined;
}

export const CFG: Record<Provider, ProviderCfg> = {
  quickbooks: {
    authorizeUrl: 'https://appcenter.intuit.com/connect/oauth2',
    tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    revokeUrl: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
    scope: 'com.intuit.quickbooks.accounting',
    clientId: () => Deno.env.get('QBO_CLIENT_ID'),
    clientSecret: () => Deno.env.get('QBO_CLIENT_SECRET'),
  },
  xero: {
    authorizeUrl: 'https://login.xero.com/identity/connect/authorize',
    tokenUrl: 'https://identity.xero.com/connect/token',
    revokeUrl: 'https://identity.xero.com/connect/revocation',
    scope: 'openid offline_access accounting.transactions accounting.contacts accounting.settings',
    clientId: () => Deno.env.get('XERO_CLIENT_ID'),
    clientSecret: () => Deno.env.get('XERO_CLIENT_SECRET'),
  },
};

function basicAuth(provider: Provider): string {
  const id = CFG[provider].clientId();
  const secret = CFG[provider].clientSecret();
  if (!id || !secret) throw new Error(`Missing client credentials for ${provider}`);
  return 'Basic ' + btoa(`${id}:${secret}`);
}

// ── OAuth: authorize URL ──────────────────────────────────────────────────
export function buildAuthorizeUrl(provider: Provider, redirectUri: string, state: string): string {
  const id = CFG[provider].clientId();
  if (!id) throw new Error(`Missing client id for ${provider}`);
  const p = new URLSearchParams({
    client_id: id,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: CFG[provider].scope,
    state,
  });
  return `${CFG[provider].authorizeUrl}?${p.toString()}`;
}

// ── OAuth: token exchange + refresh ───────────────────────────────────────
async function postToken(provider: Provider, body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(CFG[provider].tokenUrl, {
    method: 'POST',
    headers: {
      'authorization': basicAuth(provider),
      'content-type': 'application/x-www-form-urlencoded',
      'accept': 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${provider} token endpoint ${res.status}: ${t.slice(0, 300)}`);
  }
  return await res.json() as TokenResponse;
}

export function exchangeCode(provider: Provider, code: string, redirectUri: string): Promise<TokenResponse> {
  return postToken(provider, new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  }));
}

export function refreshTokens(provider: Provider, refreshToken: string): Promise<TokenResponse> {
  return postToken(provider, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }));
}

// ── Xero: tenant connections ──────────────────────────────────────────────
export async function fetchXeroConnections(accessToken: string): Promise<Array<{ tenantId: string; tenantName: string }>> {
  const res = await fetch('https://api.xero.com/connections', {
    headers: { 'authorization': `Bearer ${accessToken}`, 'accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Xero connections ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const arr = await res.json() as Array<{ tenantId: string; tenantName: string }>;
  return arr;
}

// ── QBO: company name (display) ───────────────────────────────────────────
export async function fetchQboCompanyName(accessToken: string, realmId: string): Promise<string | null> {
  try {
    const res = await fetch(`${QBO_API_BASE}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=70`, {
      headers: { 'authorization': `Bearer ${accessToken}`, 'accept': 'application/json' },
    });
    if (!res.ok) return null;
    const j = await res.json() as { CompanyInfo?: { CompanyName?: string } };
    return j.CompanyInfo?.CompanyName ?? null;
  } catch {
    return null;
  }
}

// ── Tax options (for the connect popup picker) + default pick ─────────────
export interface TaxOption { code: string; name: string }

export async function listTaxOptions(provider: Provider, conn: Conn, accessToken: string): Promise<TaxOption[]> {
  if (provider === 'xero') {
    const res = await fetch('https://api.xero.com/api.xro/2.0/TaxRates', {
      headers: xeroHeaders(accessToken, conn.tenant_id),
    });
    if (!res.ok) return [];
    const j = await res.json() as { TaxRates?: Array<{ Name: string; TaxType: string; Status?: string }> };
    return (j.TaxRates ?? [])
      .filter((r) => (r.Status ?? 'ACTIVE') === 'ACTIVE')
      .map((r) => ({ code: r.TaxType, name: `${r.Name} (${r.TaxType})` }));
  }
  // QuickBooks
  const q = encodeURIComponent('SELECT * FROM TaxCode MAXRESULTS 100');
  const res = await fetch(`${QBO_API_BASE}/v3/company/${conn.realm_id}/query?query=${q}&minorversion=70`, {
    headers: { 'authorization': `Bearer ${accessToken}`, 'accept': 'application/json' },
  });
  if (!res.ok) return [];
  const j = await res.json() as { QueryResponse?: { TaxCode?: Array<{ Id: string; Name: string; Active?: boolean }> } };
  return (j.QueryResponse?.TaxCode ?? [])
    .filter((t) => t.Active !== false)
    .map((t) => ({ code: t.Id, name: t.Name }));
}

/** Best-effort default tax code chosen at connect time. */
export async function pickDefaultTaxCode(provider: Provider, conn: Conn, accessToken: string): Promise<string | null> {
  const opts = await listTaxOptions(provider, conn, accessToken);
  if (opts.length === 0) return null;
  // Prefer a standard sales/output rate; fall back to the first option.
  const preferred = opts.find((o) => /output|standard|sales|gst|vat|20%|s$/i.test(o.name));
  return (preferred ?? opts[0]).code;
}

// ── Contacts / customers ──────────────────────────────────────────────────
function xeroHeaders(accessToken: string, tenantId: string | null): Record<string, string> {
  return {
    'authorization': `Bearer ${accessToken}`,
    'xero-tenant-id': tenantId ?? '',
    'accept': 'application/json',
    'content-type': 'application/json',
  };
}

export async function findOrCreateContact(provider: Provider, conn: Conn, accessToken: string, client: ClientInput): Promise<string> {
  if (provider === 'xero') {
    const where = encodeURIComponent(`Name=="${client.name.replace(/"/g, '')}"`);
    const lookup = await fetch(`https://api.xero.com/api.xro/2.0/Contacts?where=${where}`, {
      headers: xeroHeaders(accessToken, conn.tenant_id),
    });
    if (lookup.ok) {
      const j = await lookup.json() as { Contacts?: Array<{ ContactID: string }> };
      if (j.Contacts && j.Contacts.length > 0) return j.Contacts[0].ContactID;
    }
    const create = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
      method: 'POST',
      headers: xeroHeaders(accessToken, conn.tenant_id),
      body: JSON.stringify({
        Contacts: [{
          Name: client.name,
          EmailAddress: client.email ?? undefined,
          Phones: client.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: client.phone }] : undefined,
        }],
      }),
    });
    if (!create.ok) throw new Error(`Xero contact create ${create.status}: ${(await create.text()).slice(0, 200)}`);
    const cj = await create.json() as { Contacts: Array<{ ContactID: string }> };
    return cj.Contacts[0].ContactID;
  }
  // QuickBooks
  const q = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${client.name.replace(/'/g, "\\'")}'`);
  const lookup = await fetch(`${QBO_API_BASE}/v3/company/${conn.realm_id}/query?query=${q}&minorversion=70`, {
    headers: { 'authorization': `Bearer ${accessToken}`, 'accept': 'application/json' },
  });
  if (lookup.ok) {
    const j = await lookup.json() as { QueryResponse?: { Customer?: Array<{ Id: string }> } };
    if (j.QueryResponse?.Customer && j.QueryResponse.Customer.length > 0) return j.QueryResponse.Customer[0].Id;
  }
  const create = await fetch(`${QBO_API_BASE}/v3/company/${conn.realm_id}/customer?minorversion=70`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${accessToken}`, 'accept': 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      DisplayName: client.name,
      PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
      PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    }),
  });
  if (!create.ok) throw new Error(`QBO customer create ${create.status}: ${(await create.text()).slice(0, 200)}`);
  const cj = await create.json() as { Customer: { Id: string } };
  return cj.Customer.Id;
}

// QBO requires every SalesItemLine to reference an Item; Xero requires a
// revenue AccountCode. Resolve a sensible default from the org once per push.
async function qboDefaultItemRef(conn: Conn, accessToken: string): Promise<string> {
  const q = encodeURIComponent("SELECT * FROM Item WHERE Type='Service' MAXRESULTS 1");
  const res = await fetch(`${QBO_API_BASE}/v3/company/${conn.realm_id}/query?query=${q}&minorversion=70`, {
    headers: { 'authorization': `Bearer ${accessToken}`, 'accept': 'application/json' },
  });
  if (res.ok) {
    const j = await res.json() as { QueryResponse?: { Item?: Array<{ Id: string }> } };
    if (j.QueryResponse?.Item && j.QueryResponse.Item.length > 0) return j.QueryResponse.Item[0].Id;
  }
  return '1'; // QBO sandbox seeds "Services" as Id 1
}

async function xeroRevenueAccountCode(conn: Conn, accessToken: string): Promise<string | undefined> {
  const where = encodeURIComponent('Type=="REVENUE"&&Status=="ACTIVE"');
  const res = await fetch(`https://api.xero.com/api.xro/2.0/Accounts?where=${where}`, {
    headers: xeroHeaders(accessToken, conn.tenant_id),
  });
  if (!res.ok) return undefined;
  const j = await res.json() as { Accounts?: Array<{ Code: string }> };
  return j.Accounts && j.Accounts.length > 0 ? j.Accounts[0].Code : undefined;
}

// ── Create DRAFT invoice ──────────────────────────────────────────────────
export interface CreatedInvoice { externalId: string; externalNumber: string | null; externalUrl: string | null }

export async function createDraftInvoice(provider: Provider, conn: Conn, accessToken: string, inv: InvoiceInput): Promise<CreatedInvoice> {
  if (provider === 'xero') {
    const accountCode = await xeroRevenueAccountCode(conn, accessToken);
    const body = {
      Type: 'ACCREC',
      Contact: { ContactID: inv.contactId },
      DueDate: inv.dueDate ?? undefined,
      Reference: inv.reference,
      Status: 'DRAFT',
      LineAmountTypes: 'Exclusive',
      LineItems: inv.lines.map((l) => ({
        Description: l.description || '.',
        Quantity: 1.0,
        UnitAmount: round2(l.amount),
        AccountCode: accountCode,
        TaxType: inv.taxCode ?? 'NONE',
      })),
    };
    const res = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
      method: 'POST',
      headers: xeroHeaders(accessToken, conn.tenant_id),
      body: JSON.stringify({ Invoices: [body] }),
    });
    if (!res.ok) throw new Error(`Xero invoice create ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json() as { Invoices: Array<{ InvoiceID: string; InvoiceNumber?: string }> };
    const created = j.Invoices[0];
    return {
      externalId: created.InvoiceID,
      externalNumber: created.InvoiceNumber ?? null,
      externalUrl: `https://go.xero.com/app/invoicing/edit/${created.InvoiceID}`,
    };
  }
  // QuickBooks — DRAFT == created but not emailed; QBO has no explicit draft flag.
  const itemRef = await qboDefaultItemRef(conn, accessToken);
  const lineTax = inv.taxCode ? { TaxCodeRef: { value: inv.taxCode } } : { TaxCodeRef: { value: 'NON' } };
  const body: Record<string, unknown> = {
    CustomerRef: { value: inv.contactId },
    DueDate: inv.dueDate ?? undefined,
    GlobalTaxCalculation: inv.taxCode ? 'TaxExcluded' : 'NotApplicable',
    PrivateNote: `ProCabinet ${inv.reference}`,
    Line: inv.lines.map((l) => ({
      DetailType: 'SalesItemLineDetail',
      Amount: round2(l.amount),
      Description: l.description || '.',
      SalesItemLineDetail: { ItemRef: { value: itemRef }, ...lineTax },
    })),
  };
  const res = await fetch(`${QBO_API_BASE}/v3/company/${conn.realm_id}/invoice?minorversion=70`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${accessToken}`, 'accept': 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`QBO invoice create ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json() as { Invoice: { Id: string; DocNumber?: string } };
  return {
    externalId: j.Invoice.Id,
    externalNumber: j.Invoice.DocNumber ?? null,
    externalUrl: `${QBO_APP_BASE}/app/invoice?txnId=${j.Invoice.Id}`,
  };
}

// ── Revoke (disconnect) ────────────────────────────────────────────────────
export async function revokeToken(provider: Provider, refreshToken: string): Promise<void> {
  try {
    if (provider === 'xero') {
      await fetch(CFG.xero.revokeUrl, {
        method: 'POST',
        headers: { 'authorization': basicAuth('xero'), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      });
    } else {
      await fetch(CFG.quickbooks.revokeUrl, {
        method: 'POST',
        headers: { 'authorization': basicAuth('quickbooks'), 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({ token: refreshToken }),
      });
    }
  } catch (_e) {
    // Best-effort: even if revoke fails we still delete the local row.
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
