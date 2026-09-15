import Logo from '../Logo';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · Revenue Concentration' };

export default function Login({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="login">
      <form method="post" action="/api/login" className="card login-card">
        <Logo height={36} />
        <h1>Revenue Concentration</h1>
        <p className="beta">v.0.1 — Beta for testing</p>
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoFocus required autoComplete="current-password" />
        {searchParams.error && <p className="error">Incorrect password.</p>}
        {!process.env.APP_PASSWORD && <p className="error">APP_PASSWORD is not set for this deployment.</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
