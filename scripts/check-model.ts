// Offline check of the model against a CRM export (work/deals.json from COQL)
import fs from 'node:fs';
import { dealLines, entities, concentration, exposures, scenario, type Deal, type Settings } from '../lib/model';

const raw = JSON.parse(fs.readFileSync(process.argv[2] || '../work/deals.json', 'utf8')).data.data;
const BASIS: Record<string, number> = { month: 1, monthly: 1, bimonthly: 2, quarterly: 3, 'half yearly': 6, yearly: 12, fixed: 12 };
const deals: Deal[] = raw.map((r: any) => ({
  id: r.id, name: r.Deal_Name, account: r['Account_Name.Account_Name'], finalClient: r['Final_Client.Account_Name'],
  licence: r.Licence ?? 0, start: r.Licence_Start_Date?.slice(0, 10) ?? null, end: r.Licence_End_Date?.slice(0, 10) ?? null,
  services: r.Delivery ?? 0,
  projectStart: r.Project_Start_Date?.slice(0, 10) ?? null,
  projectEnd: r.Project_End_Date?.slice(0, 10) ?? null,
  durationMonths: Number(r.Duration) > 0 && BASIS[String(r.Duration_Basis ?? '').toLowerCase()] ? Number(r.Duration) * BASIS[String(r.Duration_Basis).toLowerCase()] : null,
  firstInvoice: r.Expected_Date_of_First_Invoice?.slice(0, 10) ?? null,
  lost: r.Licence_Lost, providersCost: r.Grand_Total, holder: r.Contact_Holder,
}));
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const TODAY = process.env.ASOF || '2026-09-24';
for (const [asOf, basis, level] of [[TODAY, 'runrate', 'client'], [TODAY, 'runrate', 'group'], [TODAY, 'ttm', 'client']] as const) {
  for (const view of ['gross', 'net'] as const) {
    const st: Settings = { asOf, basis, level, execusView: view, execusRetainedPct: 25, loseN: 3, lostOverride: null, timing: 'expiry', cash: 500000, fixedMonthly: 120000, otherMonthlyMargin: 0, savingsPct: 0, minAnnualiseMonths: 6, includeServices: process.env.SERVICES !== '0' };
    const list = entities(dealLines(deals, st), level);
    const c = concentration(list);
    const x = exposures(deals, st);
    const s = scenario(list, st);
    if (view === 'net') continue;
    console.log(`${asOf} ${basis} ${level} ${view}: total ${fmt(c.total)} HHI ${fmt(c.hhi)} top3 ${(c.top3 * 100).toFixed(1)}% LVMH ${(x.lvmhShareGross * 100).toFixed(1)}/${(x.lvmhShareNet * 100).toFixed(1)} Execus ${(x.execusShareGross * 100).toFixed(1)}/${(x.execusShareNet * 100).toFixed(1)} | top3: ${list.slice(0, 5).map((e) => `${e.label} ${Math.round(e.revenue / 1000)}k`).join(', ')} | margin ${fmt(s.marginBefore)}→${fmt(s.marginAfter)} runway ${s.runwayBase}/${s.runwayStress}`);
  }
}
