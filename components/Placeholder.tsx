export function Placeholder({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="narrow">
      <h1>{title}</h1>
      <div className="card">
        <p className="muted">Táto záložka sa prenáša z prototypu a bude doplnená v ďalšom kroku.</p>
        {children}
      </div>
    </section>
  );
}
