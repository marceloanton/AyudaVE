const usgsLandslideUrl = "https://www.usgs.gov/programs/landslide-hazards/science/2026-venezuela-sequence-earthquake-triggered-landslide-hazards";

export function SeismicReference({ t }) {
  return (
    <aside className="seismic-reference" aria-label={t.map.seismicTitle}>
      <div>
        <strong>{t.map.seismicTitle}</strong>
        <p>{t.map.seismicBody}</p>
      </div>
      <a href={usgsLandslideUrl} rel="noreferrer" target="_blank">
        {t.map.seismicLink}
      </a>
    </aside>
  );
}
