'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Receivable } from '@/lib/zoho';
import Logo from './Logo';
import {
  concentration,
  dealLines,
  entities,
  excludedDeals,
  exposures,
  hhiBand,
  scenario,
  type Basis,
  type Deal,
  type Entity,
  type ExecusView,
  type Level,
  type MonthPoint,
  type Settings,
  type Timing,
} from '@/lib/model';

type Props = {
  deals: Deal[];
  receivables: Receivable[] | null;
  receivablesError: string | null;
  fetchedAt: string;
  crmOrg: string;
  defaults: { cash: number; fixedMonthly: number; execusRetainedPct: number; minAnnualiseMonths: number; includeServices: boolean };
};

const STORE = 'rc-settings-v1';
const today = () => new Date().toISOString().slice(0, 10);

const eur0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur = (n: number) => eur0.format(Math.round(n));
const eurK = (n: number): string => {
  if (n < 0) return `−${eurK(-n)}`;
  return n >= 1_000_000 ? `€${(n / 1_000_000).toFixed(2)}m` : n >= 1000 ? `€${Math.round(n / 1000)}k` : eur(n);
};
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const fmtDate = (s: string | null) =>
  s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

const LEVEL_LABEL: Record<Level, string> = { client: 'End client', group: 'Corporate group', billing: 'Billing entity' };

export default function Dashboard({ deals, receivables, receivablesError, fetchedAt, crmOrg, defaults }: Props) {
  const [st, setSt] = useState<Settings>({
    asOf: today(),
    basis: 'runrate',
    level: 'client',
    execusView: 'gross',
    execusRetainedPct: defaults.execusRetainedPct,
    loseN: 3,
    lostOverride: null,
    timing: 'expiry',
    cash: defaults.cash,
    fixedMonthly: defaults.fixedMonthly,
    otherMonthlyMargin: 0,
    savingsPct: 0,
    includeServices: defaults.includeServices,
    minAnnualiseMonths: defaults.minAnnualiseMonths,
  });
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [refresh, setRefresh] = useState('/?refresh=1');
  useEffect(() => setRefresh(refreshHref()), []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved) setSt((s) => ({ ...s, ...saved, asOf: today(), lostOverride: null }));
    } catch {
      /* storage unavailable in some iframes */
    }
  }, []);
  useEffect(() => {
    try {
      const { asOf, lostOverride, ...keep } = st;
      void asOf;
      void lostOverride;
      localStorage.setItem(STORE, JSON.stringify(keep));
    } catch {
      /* ignore */
    }
  }, [st]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSt((s) => ({ ...s, [k]: v }));
  const setStructural = <K extends keyof Settings>(k: K, v: Settings[K]) => setSt((s) => ({ ...s, [k]: v, lostOverride: null }));

  const lines = useMemo(() => dealLines(deals, st), [deals, st]);
  const list = useMemo(() => entities(lines, st.level), [lines, st.level]);
  const conc = useMemo(() => concentration(list), [list]);
  const expo = useMemo(() => exposures(deals, st), [deals, st]);
  const sc = useMemo(() => scenario(list, st), [list, st]);
  const lostKeys = new Set(sc.lost.map((e) => e.key));
  const band = hhiBand(conc.hhi);
  const noDates = useMemo(() => excludedDeals(deals, st.includeServices), [deals, st.includeServices]);

  const toggleLost = (key: string) => {
    const current = st.lostOverride ?? sc.lost.map((e) => e.key);
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    set('lostOverride', next);
  };

  const visible = showAll ? list : list.slice(0, 15);
  const maxShare = list[0]?.share || 1;
  let cumulative = 0;

  const scope = st.includeServices ? 'Licence + services' : 'Licence';
  const revenueLabel = st.basis === 'runrate' ? `${scope} run-rate` : `${scope} revenue, trailing 12 months`;
  const crmLink = (id: string) => `https://crm.zoho.eu/crm/org${crmOrg}/tab/Potentials/${id}`;

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <Logo height={28} />
          <h1>Revenue Concentration &amp; Top-Account Stress Test</h1>
          <p className="beta">v.0.1 — Beta for testing</p>
        </div>
        <div className="top-meta">
          <span className="muted">Zoho data as of {new Date(fetchedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          <a className="btn ghost" href={refresh}>Refresh</a>
          <form method="post" action="/api/logout">
            <button className="btn ghost" type="submit">Sign out</button>
          </form>
        </div>
      </header>

      <section className="controls card">
        <Field label="As of">
          <input type="date" value={st.asOf} onChange={(e) => e.target.value && setStructural('asOf', e.target.value)} />
        </Field>
        <Field label="Basis">
          <Segmented<Basis>
            value={st.basis}
            onChange={(v) => setStructural('basis', v)}
            options={[['runrate', 'Run-rate ARR'], ['ttm', 'Trailing 12 months']]}
          />
        </Field>
        <Field label="Revenue scope">
          <Segmented<'licence' | 'all'>
            value={st.includeServices ? 'all' : 'licence'}
            onChange={(v) => setStructural('includeServices', v === 'all')}
            options={[['licence', 'Licences only'], ['all', 'Licences + services']]}
          />
        </Field>
        <Field label="Annualise from" hint="Shorter licences count at contract value">
          <NumberInput value={st.minAnnualiseMonths} suffix="months" min={0} max={24} onChange={(v) => setStructural('minAnnualiseMonths', v)} />
        </Field>
        <Field label="Concentration by">
          <Segmented<Level>
            value={st.level}
            onChange={(v) => setStructural('level', v)}
            options={[['client', 'End client'], ['group', 'Group'], ['billing', 'Billing entity']]}
          />
        </Field>
        <Field label="Execus pass-through">
          <Segmented<ExecusView>
            value={st.execusView}
            onChange={(v) => setStructural('execusView', v)}
            options={[['gross', 'Gross'], ['net', 'Net']]}
          />
        </Field>
        <Field label="Kleecks share retained">
          <NumberInput value={st.execusRetainedPct} suffix="%" min={0} max={100} onChange={(v) => set('execusRetainedPct', v)} />
        </Field>
      </section>

      <section className="tiles">
        <Tile label={revenueLabel} value={eurK(conc.total)} sub={`${conc.count} ${LEVEL_LABEL[st.level].toLowerCase()}s`} />
        <Tile
          label="Herfindahl-Hirschman Index"
          value={Math.round(conc.hhi).toLocaleString('en-GB')}
          sub={<><StatusDot tone={band.tone} /> {band.label} · ≈{conc.effectiveN.toFixed(1)} equal-sized accounts</>}
        />
        <Tile label="Top 3 share" value={pct(conc.top3)} sub={`Top 1 ${pct(conc.top1)} · Top 5 ${pct(conc.top5)} · Top 10 ${pct(conc.top10)}`} />
        <Tile
          label="LVMH weight"
          value={pct(st.execusView === 'gross' ? expo.lvmhShareGross : expo.lvmhShareNet)}
          sub={`${eurK(expo.lvmhValue)} · gross ${pct(expo.lvmhShareGross)} / net ${pct(expo.lvmhShareNet)}`}
        />
        <Tile
          label="Execus pass-through weight"
          value={pct(st.execusView === 'gross' ? expo.execusShareGross : expo.execusShareNet)}
          sub={`Gross ${eurK(expo.execusGrossValue)} (${pct(expo.execusShareGross)}) · net ${eurK(expo.execusNetValue)} (${pct(expo.execusShareNet)})`}
        />
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Ranking by {LEVEL_LABEL[st.level].toLowerCase()}</h2>
          <div className="legend">
            <span><i className="sw sw-keep" /> Retained in scenario</span>
            <span><i className="sw sw-lost" /> Lost in scenario</span>
            <span><i className="sw sw-services" /> Services component</span>
          </div>
        </div>
        <div className="table-scroll">
          <table className="rank">
            <thead>
              <tr>
                <th className="c">Lose</th>
                <th>#</th>
                <th>{LEVEL_LABEL[st.level]}</th>
                <th className="bar-col">Share</th>
                <th className="r">Revenue</th>
                <th className="r">Contribution</th>
                <th className="r">Cumulative</th>
                <th className="r">Latest contract end</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e, i) => {
                cumulative += e.share;
                const isLost = lostKeys.has(e.key);
                return (
                  <Fragment key={e.key}>
                    <tr className={isLost ? 'lost' : ''}>
                      <td className="c">
                        <input type="checkbox" checked={isLost} onChange={() => toggleLost(e.key)} aria-label={`Lose ${e.label}`} />
                      </td>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <button className="linkish" onClick={() => setOpen(open === e.key ? null : e.key)} aria-expanded={open === e.key}>
                          {open === e.key ? '▾' : '▸'} {e.label}
                        </button>
                        {e.lvmh && <span className="tag">LVMH</span>}
                        {e.passThrough && <span className="tag">Pass-through</span>}
                        {e.hasServices && <span className="tag tag-services">Services</span>}
                      </td>
                      <td className="bar-col">
                        <div className="bar-track" title={`${e.label}: ${pct(e.share)} · ${eur(e.revenue)}`}>
                          <div className={`bar ${isLost ? 'bar-lost' : 'bar-keep'}`} style={{ width: `${(e.share / maxShare) * 100}%` }} />
                          <span className="bar-label">{pct(e.share)}</span>
                        </div>
                      </td>
                      <td className="r num">{eur(e.revenue)}</td>
                      <td className="r num">{eur(e.margin)}</td>
                      <td className="r num muted">{pct(cumulative)}</td>
                      <td className="r muted">{fmtDate(e.lastEnd)}</td>
                    </tr>
                    {open === e.key && (
                      <tr className="detail">
                        <td />
                        <td colSpan={7}>
                          <table className="deals">
                            <thead>
                              <tr>
                                <th>Deal</th>
                                <th>Component</th>
                                <th>Period</th>
                                <th className="r">Contract value</th>
                                <th className="r">Counted</th>
                                <th className="r">Third-party cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.lines.map((l) => (
                                <tr key={`${l.deal.id}-${l.kind}`} className={l.annualised ? 'row-annualised' : 'row-ascontracted'}>
                                  <td>
                                    <a href={crmLink(l.deal.id)} target="_blank" rel="noreferrer">{l.deal.name}</a>
                                    <div className="muted small">{l.deal.account}</div>
                                  </td>
                                  <td>
                                    <span className={`tag ${l.kind === 'services' ? 'tag-services' : 'tag-licence'}`}>
                                      {l.kind === 'services' ? 'Services' : 'Licence'}
                                    </span>
                                    {l.passThrough && <span className="tag">Pass-through</span>}
                                    {l.deal.lost && <span className="tag">Lost</span>}
                                  </td>
                                  <td className="muted">
                                    {fmtDate(l.period?.start ?? null)} – {fmtDate(l.period?.end ?? null)} ({l.months.toFixed(1)} m)
                                    {l.period?.estimated && <span className="tag">dates estimated</span>}
                                  </td>
                                  <td className="r num">{eur(l.contractValue)}</td>
                                  <td className="r num">
                                    {eur(l.revenue)}
                                    <span className={`pill ${l.annualised ? 'pill-annualised' : 'pill-ascontracted'}`}>
                                      {!l.annualised
                                        ? 'as contracted'
                                        : Math.abs(l.multiplier - 1) < 0.02
                                          ? 'annual'
                                          : `annualised ×${l.multiplier.toFixed(2)}`}
                                    </span>
                                  </td>
                                  <td className="r num">{eur(l.cost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length > 15 && (
          <button className="btn ghost" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show top 15' : `Show all ${list.length}`}
          </button>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Stress test: lose the top {st.lostOverride ? 'selected' : st.loseN}</h2>
          {st.lostOverride && (
            <button className="btn ghost" onClick={() => set('lostOverride', null)}>Reset to top {st.loseN}</button>
          )}
        </div>
        <p className="muted small">
          Losing: {sc.lost.length ? sc.lost.map((e) => e.label).join(', ') : 'nobody selected'}.
        </p>

        <div className="controls inner">
          <Field label="Accounts lost">
            <NumberInput value={st.loseN} min={0} max={20} onChange={(v) => setSt((s) => ({ ...s, loseN: v, lostOverride: null }))} />
          </Field>
          <Field label="Loss takes effect">
            <Segmented<Timing>
              value={st.timing}
              onChange={(v) => set('timing', v)}
              options={[['expiry', 'At licence end'], ['immediate', 'Immediately']]}
            />
          </Field>
          <Field label="Cash today">
            <NumberInput value={st.cash} prefix="€" step={10000} onChange={(v) => set('cash', v)} />
          </Field>
          <Field label="Fixed costs / month">
            <NumberInput value={st.fixedMonthly} prefix="€" step={5000} onChange={(v) => set('fixedMonthly', v)} />
          </Field>
          <Field label="Other margin / month" hint="Services and anything not in licence revenue">
            <NumberInput value={st.otherMonthlyMargin} prefix="€" step={5000} onChange={(v) => set('otherMonthlyMargin', v)} />
          </Field>
          <Field label="Costs avoidable on loss" hint="% of lost revenue">
            <NumberInput value={st.savingsPct} suffix="%" min={0} max={100} onChange={(v) => set('savingsPct', v)} />
          </Field>
        </div>

        <div className="tiles">
          <Tile
            label={`${st.basis === 'runrate' ? 'ARR' : 'Revenue'} remaining`}
            value={eurK(sc.revenueAfter)}
            sub={`${pct(sc.revenueBefore ? sc.revenueAfter / sc.revenueBefore : 0)} retained · −${eurK(sc.lostRevenue)}`}
          />
          <Tile
            label="Contribution remaining (annual)"
            value={eurK(sc.marginAfter)}
            sub={`from ${eurK(sc.marginBefore)} · −${eurK(sc.lostMargin)}${sc.savings ? ` + ${eurK(sc.savings)} savings` : ''}`}
          />
          <Tile
            label="Monthly net cash flow"
            value={eurK(sc.monthlyNetAfter)}
            sub={`today ${eurK(sc.monthlyNetBefore)} · after full loss`}
            tone={sc.monthlyNetAfter < 0 ? 'critical' : 'good'}
          />
          <Tile
            label="Cash runway after loss"
            value={runwayText(sc.runwayStress, sc.horizon, sc.monthlyNetAfter, st, sc.projection.at(-1)?.stress ?? 0)}
            sub={`without loss: ${runwayText(sc.runwayBase, sc.horizon, sc.monthlyNetBefore, st, sc.projection.at(-1)?.base ?? 0)}`}
            tone={runwayTone(sc.runwayStress, sc.monthlyNetAfter)}
          />
        </div>

        {st.cash === 0 && st.fixedMonthly === 0 ? (
          <p className="notice">Enter today’s cash and monthly fixed costs to see the runway projection.</p>
        ) : (
          <CashChart points={sc.projection} cash={st.cash} />
        )}
      </section>

      <section className="card">
        <h2>Execus receivables (Zoho Books)</h2>
        {receivablesError && <p className="error">Books not reachable: {receivablesError}</p>}
        {receivables && <Receivables rows={receivables} />}
      </section>

      <section className="card notes">
        <h2>Method</h2>
        <ul>
          <li>
            <b>Source:</b> Zoho CRM deals in stage “8. Client Won” with Licence &gt; 0 or Delivery &gt; 0; both fields are
            net of VAT. Delivery is the total of the services components (Development, Managed Services, Training, SEO,
            One Spot), so those are never double counted.
          </li>
          <li>
            <b>Services:</b> counted only in the “Licences + services” scope. The period comes from Project Start and
            Project End; when the end is missing it is derived from the Deal Revenue section (Duration × Duration Basis)
            starting at Project Start, or at the Expected Date of First Invoice, and the row is marked “dates estimated”.
            A year-long strategy or managed-service engagement is therefore treated exactly like a licence.
          </li>
          <li>
            <b>Run-rate ARR:</b> licence value of deals whose licence period includes the “as of” date, annualised on the
            period length (a 3-month extension counts ×4). Deals flagged “Licence lost” are excluded. Renewals not yet won
            are not counted, so an account between two contracts drops out.
          </li>
          <li>
            <b>Short contracts:</b> a contract shorter than {st.minAnnualiseMonths} months (POCs, extensions) is counted at
            its contract value and marked “as contracted”, because annualising it would multiply a few weeks of revenue into a
            full year. Above the threshold the value is annualised on the period length and marked “annualised”.
          </li>
          <li><b>Trailing 12 months:</b> licence value pro-rata on the days of the licence period falling in the last 365 days, including lost licences.</li>
          <li><b>End client:</b> the deal’s Final Client, or the Account when empty. <b>Group</b> maps brands to their corporate group (e.g. all LVMH maisons). <b>Billing entity</b> is the CRM Account that is invoiced (e.g. Jakala).</li>
          <li>
            <b>Execus pass-through:</b> deals billed to Execus without a Final Client. Gross counts the full contract value;
            net counts only the share Kleecks retains ({st.execusRetainedPct}%). Contribution is the same in both views.
          </li>
          <li><b>Contribution:</b> revenue minus third-party costs recorded in the CRM Providers subform (Grand Total); team and overheads belong in fixed costs.</li>
          <li>
            <b>HHI:</b> sum of squared percentage shares (0–10,000). Bands follow the 2023 US merger guidelines: below 1,000
            diversified, 1,000–1,800 moderate, above 1,800 high. It is a customer-dependency signal, not a market measure.
          </li>
          <li><b>Runway:</b> month-by-month cash, ignoring collection timing and VAT; retained accounts are assumed to renew at today’s value.</li>
        </ul>
        {noDates.length > 0 && (
          <details>
            <summary>
              {noDates.length} won components cannot be placed in time and are excluded ({eurK(noDates.reduce((a, x) => a + x.value, 0))})
            </summary>
            <ul className="small">
              {noDates.map((x) => (
                <li key={`${x.deal.id}-${x.kind}`}>
                  <a href={crmLink(x.deal.id)} target="_blank" rel="noreferrer">{x.deal.name}</a> · {x.deal.account} ·{' '}
                  {x.kind === 'services' ? 'services' : 'licence'} {eur(x.value)} · {x.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}

function refreshHref() {
  if (typeof window === 'undefined') return '/?refresh=1';
  const q = new URLSearchParams(window.location.search);
  const params = new URLSearchParams({ refresh: '1' });
  for (const name of ['key', 't']) {
    const v = q.get(name);
    if (v) params.set(name, v);
  }
  return `/?${params}`;
}

function runwayText(m: number | null, horizon: number, monthlyNet: number, st: Settings, cashAtHorizon: number) {
  if (st.cash === 0 && st.fixedMonthly === 0) return '—';
  if (m === null) {
    if (monthlyNet >= 0) return 'Self-funding';
    return `≈${horizon + Math.ceil(cashAtHorizon / -monthlyNet)} months`;
  }
  return `${m} month${m === 1 ? '' : 's'}`;
}

function runwayTone(m: number | null, monthlyNet: number): 'good' | 'warning' | 'critical' {
  if (m !== null && m <= 12) return 'critical';
  if (m !== null || monthlyNet < 0) return 'warning';
  return 'good';
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function NumberInput({ value, onChange, prefix, suffix, min, max, step = 1 }: {
  value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <span className="num-input">
      {prefix && <span className="affix">{prefix}</span>}
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          let v = Number(e.target.value);
          if (!Number.isFinite(v)) v = 0;
          if (min !== undefined) v = Math.max(min, v);
          if (max !== undefined) v = Math.min(max, v);
          onChange(v);
        }}
      />
      {suffix && <span className="affix">{suffix}</span>}
    </span>
  );
}

function StatusDot({ tone }: { tone: 'good' | 'warning' | 'critical' }) {
  return <i className={`dot dot-${tone}`} aria-hidden />;
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: 'good' | 'warning' | 'critical' }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">
        {tone && <StatusDot tone={tone} />}
        {value}
      </div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

function CashChart({ points, cash }: { points: MonthPoint[]; cash: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900, H = 260, L = 64, R = 32, T = 16, B = 28;
  const all = [cash, 0, ...points.flatMap((p) => [p.base, p.stress])];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  const n = points.length;
  const x = (i: number) => L + (i / n) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (k: 'base' | 'stress') => `M${x(0)},${y(cash)} ` + points.map((p, i) => `L${x(i + 1)},${y(p[k])}`).join(' ');
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const h = hover !== null ? points[hover] : null;

  return (
    <div className="chart">
      <div className="legend">
        <span><i className="ln ln-base" /> Without loss</span>
        <span><i className="ln ln-stress" /> After losing selected accounts</span>
      </div>
      <div className="chart-scroll">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Projected cash balance by month"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - L) / (W - L - R)) * n) - 1;
            setHover(i >= 0 && i < n ? i : null);
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
              <text className="axis" x={L - 8} y={y(t) + 4} textAnchor="end">{eurK(t)}</text>
            </g>
          ))}
          <line className="zero" x1={L} x2={W - R} y1={y(0)} y2={y(0)} />
          {points.map((p, i) => (i % 6 === 5 ? <text key={p.month} className="axis" x={x(i + 1)} y={H - 8} textAnchor="middle">{p.month}</text> : null))}
          <path className="line line-base" d={path('base')} />
          <path className="line line-stress" d={path('stress')} />
          {h && hover !== null && (
            <g>
              <line className="cross" x1={x(hover + 1)} x2={x(hover + 1)} y1={T} y2={H - B} />
              <circle className="pt pt-base" cx={x(hover + 1)} cy={y(h.base)} r={4} />
              <circle className="pt pt-stress" cx={x(hover + 1)} cy={y(h.stress)} r={4} />
            </g>
          )}
        </svg>
      </div>
      <div className="tooltip-line">
        {h ? (
          <>
            <b>{h.month}</b> · without loss {eur(h.base)} · after loss {eur(h.stress)}
          </>
        ) : (
          <span className="muted">Hover the chart for monthly values.</span>
        )}
      </div>
    </div>
  );
}

function Receivables({ rows }: { rows: Receivable[] }) {
  const invoiced = rows.reduce((a, r) => a + r.total, 0);
  const outstanding = rows.reduce((a, r) => a + r.balance, 0);
  const overdue = rows.filter((r) => r.status === 'overdue').reduce((a, r) => a + r.balance, 0);
  return (
    <>
      <div className="tiles">
        <Tile label="Invoiced (VAT incl.)" value={eurK(invoiced)} sub={`${rows.length} invoices`} />
        <Tile label="Collected" value={eurK(invoiced - outstanding)} sub={pct(invoiced ? (invoiced - outstanding) / invoiced : 0)} />
        <Tile label="Outstanding" value={eurK(outstanding)} tone={outstanding > 0 ? 'warning' : 'good'} />
        <Tile label="Overdue" value={eurK(overdue)} tone={overdue > 0 ? 'critical' : 'good'} />
      </div>
      <p className="muted small">Book totals include VAT and are not netted for credit notes; the runway above does not assume these are collected.</p>
      <div className="table-scroll">
        <table className="deals">
          <thead>
            <tr><th>Invoice</th><th>Date</th><th>Due</th><th>Status</th><th>CRM deal</th><th className="r">Total</th><th className="r">Balance</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.number}>
                <td>{r.number}</td>
                <td>{fmtDate(r.date)}</td>
                <td>{fmtDate(r.dueDate)}</td>
                <td>{r.status === 'overdue' ? <><StatusDot tone="critical" /> Overdue</> : r.status}</td>
                <td className="muted">{r.deal ?? '—'}</td>
                <td className="r num">{eur(r.total)}</td>
                <td className="r num">{eur(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
