import { groupOf, isLvmh, PASS_THROUGH_ACCOUNT } from './groups';

export type Deal = {
  id: string;
  name: string;
  account: string;
  finalClient: string | null;
  licence: number; // EUR, net of VAT
  start: string | null; // yyyy-mm-dd
  end: string | null; // yyyy-mm-dd
  lost: boolean;
  providersCost: number | null; // CRM "Grand Total" of the Providers subform (third-party cost)
  holder: string | null;
};

export type Basis = 'runrate' | 'ttm';
export type Level = 'client' | 'group' | 'billing';
export type ExecusView = 'gross' | 'net';
export type Timing = 'expiry' | 'immediate';

export type Settings = {
  asOf: string;
  basis: Basis;
  level: Level;
  execusView: ExecusView;
  execusRetainedPct: number; // % of pass-through value Kleecks keeps
  loseN: number;
  lostOverride: string[] | null; // entity keys chosen by hand; null = top N
  timing: Timing;
  cash: number;
  fixedMonthly: number;
  otherMonthlyMargin: number; // services etc., not in licence ARR
  savingsPct: number; // % of lost revenue that becomes avoidable cost once lost
  minAnnualiseMonths: number; // licences shorter than this are counted at contract value, not annualised
};

export type DealLine = {
  deal: Deal;
  revenue: number; // annualised (runrate) or TTM pro-rata, in the current Execus view
  grossRevenue: number; // before Execus netting
  cost: number; // direct third-party cost, same basis
  passThrough: boolean;
  shortTerm: boolean; // counted at contract value because the licence is shorter than the threshold
  client: string;
  group: string;
};

export type Entity = {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  margin: number;
  share: number; // 0..1
  lvmh: boolean;
  passThrough: boolean;
  shortTerm: boolean;
  lastEnd: string | null;
  lines: DealLine[];
};

export type Concentration = {
  total: number;
  hhi: number;
  effectiveN: number;
  top1: number;
  top3: number;
  top5: number;
  top10: number;
  count: number;
};

const DAY = 86_400_000;
const toDate = (s: string) => new Date(s + 'T00:00:00Z');
const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
export const addDays = (s: string, n: number) => new Date(toDate(s).getTime() + n * DAY).toISOString().slice(0, 10);

export const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

export function isPassThrough(d: Deal) {
  return PASS_THROUGH_ACCOUNT.test(d.account) && !d.finalClient;
}

export function licenceDays(d: Deal): number {
  return d.start && d.end ? daysBetween(d.start, d.end) + 1 : 0;
}

/** A licence shorter than the threshold (POCs, extensions) is not treated as a recurring contract. */
export function isShortTerm(d: Deal, minMonths: number): boolean {
  const len = licenceDays(d);
  return len > 0 && len < Math.round((minMonths * 365) / 12);
}

/** Revenue factor of a deal for the chosen basis (fraction of licence value, annualised). */
function factor(d: Deal, asOf: string, basis: Basis, minMonths: number): number {
  if (!d.start || !d.end || d.licence <= 0) return 0;
  const len = daysBetween(d.start, d.end) + 1;
  if (len <= 0) return 0;
  if (basis === 'runrate') {
    if (d.lost) return 0; // declared churn: not part of recurring run-rate
    if (d.start > asOf || d.end < asOf) return 0;
    // Short licences are counted at their contract value: annualising a 69-day POC would
    // multiply it by five and put the account at the top of the ranking.
    return isShortTerm(d, minMonths) ? 1 : 365 / len;
  }
  // trailing 12 months, pro-rata on licence days
  const from = addDays(asOf, -364);
  const s = d.start > from ? d.start : from;
  const e = d.end < asOf ? d.end : asOf;
  const overlap = daysBetween(s, e) + 1;
  return overlap > 0 ? overlap / len : 0;
}

export function dealLines(deals: Deal[], st: Settings): DealLine[] {
  const out: DealLine[] = [];
  const keep = st.execusRetainedPct / 100;
  for (const d of deals) {
    const f = factor(d, st.asOf, st.basis, st.minAnnualiseMonths);
    if (f <= 0) continue;
    const pt = isPassThrough(d);
    const gross = d.licence * f;
    const providers = d.providersCost != null ? d.providersCost * f : 0;
    // Margin is identical in both views: pass-through cost = value not retained (unless Providers are recorded)
    const ptCost = d.providersCost != null ? providers : gross * (1 - keep);
    const revenue = pt && st.execusView === 'net' ? gross * keep : gross;
    const cost = pt ? (st.execusView === 'net' ? Math.max(0, ptCost - gross * (1 - keep)) : ptCost) : providers;
    const client = d.finalClient || d.account;
    const shortTerm = st.basis === 'runrate' && isShortTerm(d, st.minAnnualiseMonths);
    out.push({ deal: d, revenue, grossRevenue: gross, cost, passThrough: pt, shortTerm, client, group: groupOf(client) });
  }
  return out;
}

export function entities(lines: DealLine[], level: Level): Entity[] {
  const map = new Map<string, Entity>();
  for (const l of lines) {
    const label = level === 'client' ? l.client : level === 'group' ? l.group : l.deal.account;
    const key = norm(label);
    let e = map.get(key);
    if (!e) {
      e = { key, label, revenue: 0, cost: 0, margin: 0, share: 0, lvmh: false, passThrough: false, shortTerm: false, lastEnd: null, lines: [] };
      map.set(key, e);
    }
    e.revenue += l.revenue;
    e.cost += l.cost;
    e.lvmh = e.lvmh || isLvmh(l.client);
    e.passThrough = e.passThrough || l.passThrough;
    e.shortTerm = e.shortTerm || l.shortTerm;
    if (l.deal.end && (!e.lastEnd || l.deal.end > e.lastEnd)) e.lastEnd = l.deal.end;
    e.lines.push(l);
  }
  const list = [...map.values()];
  const total = list.reduce((a, e) => a + e.revenue, 0);
  for (const e of list) {
    e.margin = e.revenue - e.cost;
    e.share = total > 0 ? e.revenue / total : 0;
    e.lines.sort((a, b) => b.revenue - a.revenue);
  }
  return list.sort((a, b) => b.revenue - a.revenue);
}

export function concentration(list: Entity[]): Concentration {
  const total = list.reduce((a, e) => a + e.revenue, 0);
  const hhi = list.reduce((a, e) => a + (e.share * 100) ** 2, 0);
  const topShare = (n: number) => list.slice(0, n).reduce((a, e) => a + e.share, 0);
  return {
    total,
    hhi,
    effectiveN: hhi > 0 ? 10_000 / hhi : 0,
    top1: topShare(1),
    top3: topShare(3),
    top5: topShare(5),
    top10: topShare(10),
    count: list.length,
  };
}

export function hhiBand(hhi: number): { label: string; tone: 'good' | 'warning' | 'critical' } {
  if (hhi < 1000) return { label: 'Diversified', tone: 'good' };
  if (hhi <= 1800) return { label: 'Moderately concentrated', tone: 'warning' };
  return { label: 'Highly concentrated', tone: 'critical' };
}

export type MonthPoint = { month: string; base: number; stress: number };

export type Scenario = {
  lost: Entity[];
  revenueBefore: number;
  revenueAfter: number;
  marginBefore: number;
  marginAfter: number; // annual, after loss and savings
  lostRevenue: number;
  lostMargin: number;
  savings: number; // annual
  monthlyNetBefore: number;
  monthlyNetAfter: number;
  runwayBase: number | null; // months until cash < 0; null = beyond horizon
  runwayStress: number | null;
  projection: MonthPoint[];
  horizon: number;
};

export function scenario(list: Entity[], st: Settings, horizon = 36): Scenario {
  const chosen = st.lostOverride
    ? list.filter((e) => st.lostOverride!.includes(e.key))
    : list.slice(0, Math.max(0, st.loseN));
  const revenueBefore = list.reduce((a, e) => a + e.revenue, 0);
  const marginBefore = list.reduce((a, e) => a + e.margin, 0);
  const lostRevenue = chosen.reduce((a, e) => a + e.revenue, 0);
  const lostMargin = chosen.reduce((a, e) => a + e.margin, 0);
  const savings = (lostRevenue * st.savingsPct) / 100;
  const marginAfter = marginBefore - lostMargin + savings;

  const other = st.otherMonthlyMargin;
  const monthlyNetBefore = marginBefore / 12 + other - st.fixedMonthly;
  const monthlyNetAfter = marginAfter / 12 + other - st.fixedMonthly;

  const projection: MonthPoint[] = [];
  let base = st.cash;
  let stress = st.cash;
  let runwayBase: number | null = null;
  let runwayStress: number | null = null;
  const retainedMargin = marginBefore - lostMargin;
  for (let m = 1; m <= horizon; m++) {
    const monthEnd = addDays(st.asOf, Math.round((m * 365) / 12));
    base += monthlyNetBefore;
    let stillBilling = 0;
    let savingsNow = 0;
    for (const e of chosen) {
      const ends = st.timing === 'immediate' || !e.lastEnd || e.lastEnd < st.asOf ? st.asOf : e.lastEnd;
      if (monthEnd <= ends) stillBilling += e.margin / 12;
      else savingsNow += (e.revenue * st.savingsPct) / 100 / 12;
    }
    stress += retainedMargin / 12 + stillBilling + savingsNow + other - st.fixedMonthly;
    if (runwayBase === null && base < 0) runwayBase = m;
    if (runwayStress === null && stress < 0) runwayStress = m;
    projection.push({ month: monthEnd.slice(0, 7), base, stress });
  }
  return {
    lost: chosen,
    revenueBefore,
    revenueAfter: revenueBefore - lostRevenue,
    marginBefore,
    marginAfter,
    lostRevenue,
    lostMargin,
    savings,
    monthlyNetBefore,
    monthlyNetAfter,
    runwayBase,
    runwayStress,
    projection,
    horizon,
  };
}

/** Share of total revenue from LVMH maisons and from the Execus pass-through, in both views. */
export function exposures(deals: Deal[], st: Settings) {
  const g = dealLines(deals, { ...st, execusView: 'gross' });
  const n = dealLines(deals, { ...st, execusView: 'net' });
  const sum = (ls: DealLine[], f: (l: DealLine) => boolean) => ls.filter(f).reduce((a, l) => a + l.revenue, 0);
  const tg = sum(g, () => true);
  const tn = sum(n, () => true);
  return {
    totalGross: tg,
    totalNet: tn,
    lvmhValue: sum(g, (l) => isLvmh(l.client)),
    lvmhShareGross: tg ? sum(g, (l) => isLvmh(l.client)) / tg : 0,
    lvmhShareNet: tn ? sum(n, (l) => isLvmh(l.client)) / tn : 0,
    execusGrossValue: sum(g, (l) => l.passThrough),
    execusNetValue: sum(n, (l) => l.passThrough),
    execusShareGross: tg ? sum(g, (l) => l.passThrough) / tg : 0,
    execusShareNet: tn ? sum(n, (l) => l.passThrough) / tn : 0,
  };
}

export function excludedDeals(deals: Deal[]) {
  return deals.filter((d) => !d.start || !d.end);
}
