import Dashboard from './Dashboard';
import { getSnapshot } from '@/lib/zoho';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, isAuthorised } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: { refresh?: string; key?: string; t?: string } }) {
  if (!(await isAuthorised(cookies().get(COOKIE)?.value, searchParams.key, searchParams.t))) redirect('/login');
  try {
    const snap = await getSnapshot(searchParams.refresh === '1');
    return (
      <Dashboard
        deals={snap.deals}
        receivables={snap.receivables}
        receivablesError={snap.receivablesError}
        fetchedAt={snap.fetchedAt}
        crmOrg={process.env.ZOHO_CRM_ORG_ID || '20069840369'}
        defaults={{
          cash: Number(process.env.DEFAULT_CASH_EUR) || 0,
          fixedMonthly: Number(process.env.DEFAULT_MONTHLY_FIXED_COST_EUR) || 0,
          execusRetainedPct: Number(process.env.DEFAULT_EXECUS_RETAINED_PCT) || 25,
          minAnnualiseMonths: Number(process.env.DEFAULT_MIN_ANNUALISE_MONTHS) || 6,
          includeServices: process.env.DEFAULT_INCLUDE_SERVICES !== 'false',
        }}
      />
    );
  } catch (e) {
    return (
      <main className="wrap">
        <div className="card">
          <h1>Unable to load data from Zoho</h1>
          <p className="muted">{e instanceof Error ? e.message : String(e)}</p>
          <p className="muted">
            Check the OAuth variables on Vercel. After changing ZOHO_REFRESH_TOKEN, redeploy and allow a few minutes for
            warm functions to drop the old access token.
          </p>
        </div>
      </main>
    );
  }
}
