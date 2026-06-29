import { useMemo, useState } from "react";
import { redactSensitiveText, trustKey } from "../lib/report-utils";

const statuses = ["Sin validar", "Confirmado", "Resuelto"];

const trustLabels = {
  verified_origin: "Verificado en origen",
  external_pending: "Fuente externa / a validar",
  community_confirmed: "Confirmado por comunidad",
  community_pending: "Comunidad / sin validar",
  resolved: "Resuelto",
};

function reviewItems(report, hasCoordinates) {
  const items = [];
  if (report.priority === "Alta" && report.status !== "Resuelto") items.push(["urgent", "Alta urgencia"]);
  if (report.source && report.status === "Sin validar") items.push(["external", "Validar fuente externa"]);
  if (!hasCoordinates) items.push(["coords", "Ubicar en mapa"]);
  if (report.privacyReview) items.push(["privacy", "Limpiar privacidad"]);
  if (items.length === 0) items.push(["ready", report.status === "Resuelto" ? "Cerrado" : "Sin alertas"]);
  return items;
}

export function AdminReportCard({ report, onSanitizePrivacy, onUpdate }) {
  const [status, setStatus] = useState(report.status);
  const source = report.source || "AyudaVE";
  const hasCoordinates = Number.isFinite(Number(report.lat)) && Number.isFinite(Number(report.lng));
  const trust = trustKey(report);
  const review = useMemo(() => reviewItems(report, hasCoordinates), [hasCoordinates, report]);

  return (
    <article className={`report-card ${report.priority === "Alta" && report.status !== "Resuelto" ? "is-urgent" : ""}`}>
      <div>
        <h2>
          {report.type} - {report.city}
        </h2>
        <p>{redactSensitiveText(report.detail)}</p>
        <p>
          {redactSensitiveText(report.area)} · Contacto: {redactSensitiveText(report.contact || "Sin validar")}
        </p>
        <p className="admin-source-line">
          Fuente: {source}
          {report.source_url ? (
            <>
              {" · "}
              <a href={report.source_url} rel="noreferrer" target="_blank">abrir origen</a>
            </>
          ) : null}
          {hasCoordinates ? ` · ${Number(report.lat).toFixed(4)}, ${Number(report.lng).toFixed(4)}` : " · sin coordenadas"}
        </p>
        <div className="admin-review-line" aria-label="Senales de revision">
          <span className={`admin-trust trust-${trust}`}>{trustLabels[trust] || trust}</span>
          {review.map(([key, label]) => (
            <span className={`review-chip review-${key}`} key={key}>{label}</span>
          ))}
        </div>
        <div className="report-meta">
          <span>{report.priority}</span>
          <span>{report.status}</span>
          <span>{report.createdAt || ""}</span>
          {report.privacyReview ? <span className="privacy-flag">Revisar privacidad</span> : null}
          {!report.privacyReview && report.privacyReviewed ? <span className="privacy-clean">Privacidad saneada</span> : null}
        </div>
      </div>
      <div className="admin-card-actions">
        <select className="status-select" onChange={(event) => setStatus(event.target.value)} value={status}>
          {statuses.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button className="save-status" onClick={() => onUpdate(report.id, status)} type="button">
          Guardar
        </button>
        {report.privacyReview ? (
          <button className="privacy-action" onClick={() => onSanitizePrivacy(report.id)} type="button">
            Limpiar privacidad
          </button>
        ) : null}
        <button onClick={() => onUpdate(report.id, "Confirmado")} type="button">
          Confirmar
        </button>
        <button onClick={() => onUpdate(report.id, "Resuelto")} type="button">
          Resolver
        </button>
      </div>
    </article>
  );
}
