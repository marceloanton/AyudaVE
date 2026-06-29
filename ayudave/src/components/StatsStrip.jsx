export function StatsStrip({ reports, helpCount, isLoading, serverSyncAvailable, t }) {
  const activeReports = reports.filter((report) => report.status !== "Resuelto");
  const urgentReports = activeReports.filter((report) => report.priority === "Alta");
  const externalReports = reports.filter((report) => report.source);

  const stats = [
    [t.stats.active, activeReports.length],
    [t.stats.urgent, urgentReports.length],
    [t.stats.help, helpCount],
    [t.stats.external, externalReports.length],
  ];

  return (
    <section className="stats-strip" aria-label="Resumen operativo">
      {stats.map(([label, value]) => (
        <article key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
      </article>
      ))}
      <p className={serverSyncAvailable ? "is-online" : "is-offline"}>
        {isLoading
          ? t.sync.loading
          : serverSyncAvailable
            ? t.sync.serverShared
            : t.sync.localMode}
      </p>
    </section>
  );
}
