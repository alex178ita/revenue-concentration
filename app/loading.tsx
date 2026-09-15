import Logo from './Logo';

export default function Loading() {
  return (
    <main className="splash" aria-busy="true">
      <Logo height={64} />
      <p>Loading data ... please wait ...</p>
      <span className="beta">v.0.1 — Beta for testing</span>
    </main>
  );
}
