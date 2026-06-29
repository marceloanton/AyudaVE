import { trustKey } from "../lib/report-utils";

function compactLabel(key, item, t) {
  if (key === "resolved") return t.status("Resuelto");
  if (key === "verified_origin" || key === "community_confirmed") {
    return item?.status === "Abierto" ? t.status("Abierto") : t.status("Confirmado");
  }
  return t.status("Sin validar");
}

export function TrustBadge({ compact = false, item, t }) {
  const key = trustKey(item);
  const sourceLabel = item?.source ? t.reports.externalSource : t.reports.localSource;
  const trustLabel = t.trust(key);
  const visibleLabel = compact ? compactLabel(key, item, t) : trustLabel;

  return (
    <span className={`trust-badge trust-${key} ${compact ? "is-compact" : ""}`} title={`${sourceLabel}: ${trustLabel}`}>
      <span>{visibleLabel}</span>
      {!compact ? <small>{sourceLabel}</small> : null}
    </span>
  );
}
