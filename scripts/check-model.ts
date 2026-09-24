// Offline check of the model against a CRM export (work/deals.json from COQL)
import fs from 'node:fs';
import { dealLines, entities, concentration, exposures, scenario, type Deal, type Settings } from '../lib/model';

const raw = JSON.parse(fs.readFileSync(process.argv[2] || '../work/deals.json', 'utf8')).data.data;
const deals: Deal[] = raw.map((r: any) => ({
  id: r.id, name: r.Deal_Name, account: r['Account_Name.Account_Name'], finalClient: r['Final_Client.Account_Name'],
  licence: r.Licence, start: r.Licence_Start_Date?.slice(0, 10) ?? null, end: r.Licence_End_Date?.slice(0, 10) ?? null,
  lost: r.Licence_Lost, providersCost: r.Grand_Total, holder: r.Contact_Holder,
}));
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
for (const [asOf, basis, level] of [['2026-09-15', 'runrate', 'client'], ['2026-09-15', 'runrate', 'group'], ['2026-09-15', 'ttm', 'client'], ['2026-06-01', 'runrate', 'client']] as const) {
  for (const view of ['gross', 'net'] as const) {
    const st: Settings = { asOf, basis, level, execusView: view, execusRetainedPct: 25, loseN: 3, lostOverride: null, timing: 'expiry', cash: 500000, fixedMonthly: 120000, otherMonthlyMargin: 0, savingsPct: 0, minAnnualiseMonths: 6 };
    const list = entities(dealLines(deals, st), level);
    const c = concentration(list);
    const x = exposures(deals, st);
    const s = scenario(list, st);
    console.log(`${asOf} ${basis} ${level} ${view}: total ${fmt(c.total)} HHI ${fmt(c.hhi)} top3 ${(c.top3 * 100).toFixed(1)}% LVMH ${(x.lvmhShareGross * 100).toFixed(1)}/${(x.lvmhShareNet * 100).toFixed(1)} Execus ${(x.execusShareGross * 100).toFixed(1)}/${(x.execusShareNet * 100).toFixed(1)} | top3: ${list.slice(0, 3).map((e) => e.label).join(', ')} | margin ${fmt(s.marginBefore)}→${fmt(s.marginAfter)} runway ${s.runwayBase}/${s.runwayStress}`);
  }
}
