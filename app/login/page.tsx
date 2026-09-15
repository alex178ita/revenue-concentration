export const metadata = { title: 'Sign in · Revenue Concentration' };

export default function Login({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="login">
      <form method="post" action="/api/login" className="card login-card">
        <div className="brand">KLEECKS</div>
        <h1>Revenue Concentration</h1>
        <p className="beta">Beta for testing</p>
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoFocus required autoComplete="current-password" />
        {searchParams.error && <p className="error">Incorrect password.</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
