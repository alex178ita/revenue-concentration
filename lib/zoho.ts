import 'server-only';
import type { Deal } from './model';

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.eu';
const API = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.eu';

let token: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    throw new Error('Missing Zoho OAuth environment variables');
  }
  const body = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const r = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: 'POST', body, cache: 'no-store' });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Zoho token refresh failed: ${JSON.stringify(j)}`);
  token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function coql(query: string): Promise<any[]> {
  const t = await accessToken();
  const out: any[] = [];
  for (let offset = 0; offset < 10_000; offset += 200) {
    const r = await fetch(`${API}/crm/v7/coql`, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ select_query: `${query} limit ${offset}, 200` }),
      cache: 'no-store',
    });
    if (r.status === 204) break;
    const j = await r.json();
    if (!r.ok) throw new Error(`CRM COQL error: ${JSON.stringify(j)}`);
    out.push(...(j.data ?? []));
    if (!j.info?.more_records) break;
  }
  return out;
}

const day = (v: unknown) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

export async function fetchLicenceDeals(): Promise<Deal[]> {
  const rows = await coql(
    "select Deal_Name, Account_Name.Account_Name, Final_Client.Account_Name, Licence, Licence_Start_Date, Licence_End_Date, Licence_Lost, Contact_Holder, Grand_Total, Currency, Exchange_Rate from Deals where (Stage = '8. Client Won' and Licence > 0) order by id",
  );
  return rows.map((r) => {
    const rate = Number(r.Exchange_Rate) || 1;
    const eur = (v: unknown) => (v == null ? null : Number(v) / (r.Currency && r.Currency !== 'EUR' ? rate : 1));
    return {
      id: String(r.id),
      name: String(r.Deal_Name ?? ''),
      account: String(r['Account_Name.Account_Name'] ?? '—'),
      finalClient: r['Final_Client.Account_Name'] ? String(r['Final_Client.Account_Name']) : null,
      licence: eur(r.Licence) ?? 0,
      start: day(r.Licence_Start_Date),
      end: day(r.Licence_End_Date),
      lost: Boolean(r.Licence_Lost),
      providersCost: eur(r.Grand_Total),
      holder: r.Contact_Holder ?? null,
    };
  });
}

export type Receivable = {
  number: string;
  date: string;
  dueDate: string;
  status: string;
  total: number;
  balance: number;
  deal: string | null;
};

export async function fetchPartnerReceivables(): Promise<Receivable[]> {
  const t = await accessToken();
  const org = process.env.ZOHO_BOOKS_ORG_ID || '20069840369';
  const customer = process.env.EXECUS_BOOKS_CUSTOMER || 'EXECUS S.P.A.';
  const out: Receivable[] = [];
  for (let page = 1; page < 20; page++) {
    const qs = new URLSearchParams({ organization_id: org, customer_name: customer, per_page: '200', page: String(page) });
    const r = await fetch(`${API}/books/v3/invoices?${qs}`, {
      headers: { Authorization: `Zoho-oauthtoken ${t}` },
      cache: 'no-store',
    });
    const j = await r.json();
    if (!r.ok || j.code !== 0) throw new Error(`Books error: ${JSON.stringify(j)}`);
    for (const i of j.invoices ?? []) {
      if (i.status === 'void') continue;
      out.push({
        number: i.invoice_number,
        date: i.date,
        dueDate: i.due_date,
        status: i.status,
        total: Number(i.total) || 0,
        balance: Number(i.balance) || 0,
        deal: i.zcrm_potential_name || null,
      });
    }
    if (!j.page_context?.has_more_page) break;
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// In-memory snapshot, refreshed at most every 3 hours per server instance
type Snapshot = { deals: Deal[]; receivables: Receivable[] | null; receivablesError: string | null; fetchedAt: string };
let cache: { at: number; data: Snapshot } | null = null;

export async function getSnapshot(force = false): Promise<Snapshot> {
  if (!force && cache && Date.now() - cache.at < 3 * 3600_000) return cache.data;
  if (process.env.MOCK_SNAPSHOT_FILE) {
    // local preview only: JSON file shaped like Snapshot
    const fs = await import('node:fs');
    return JSON.parse(fs.readFileSync(process.env.MOCK_SNAPSHOT_FILE, 'utf8'));
  }
  const deals = await fetchLicenceDeals();
  let receivables: Receivable[] | null = null;
  let receivablesError: string | null = null;
  try {
    receivables = await fetchPartnerReceivables();
  } catch (e) {
    receivablesError = e instanceof Error ? e.message : String(e);
  }
  const data = { deals, receivables, receivablesError, fetchedAt: new Date().toISOString() };
  cache = { at: Date.now(), data };
  return data;
}
