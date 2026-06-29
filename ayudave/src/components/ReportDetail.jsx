import { useMemo, useState } from "react";
import { redactSensitiveText, typeClass, typeInitial } from "../lib/report-utils";
import { TrustBadge } from "./TrustBadge";

function getCoordinates(report) {
  const lat = Number(report?.lat);
  const lng = Number(report?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -10 && lat <= 16 && lng >= -82 && lng <= -52
    ? { lat, lng }
    : null;
}

function getMapUrl(coordinates) {
  if (!coordinates) return "";
  const lat = coordinates.lat.toFixed(6);
  const lng = coordinates.lng.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
}

async function writeClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "-1000px";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  document.body.removeChild(field);
}

function buildShareText(report, t, mapUrl) {
  return [
    `AyudaVE - ${t.type(report.type)}`,
    `${t.detail.status}: ${t.status(report.status)}`,
    `${t.detail.priority}: ${t.priority(report.priority)}`,
    `${t.detail.city}: ${redactSensitiveText(report.city)}`,
    `${t.detail.location}: ${redactSensitiveText(report.area)}`,
    redactSensitiveText(report.detail),
    report.source ? `${t.detail.source}: ${redactSensitiveText(report.source)}` : "",
    mapUrl ? `${t.detail.map}: ${mapUrl}` : "",
  ].filter(Boolean).join("\n");
}

export function ReportDetail({ report, onClose, t }) {
  const [feedback, setFeedback] = useState({ reportKey: "", message: "" });
  const coordinates = useMemo(() => getCoordinates(report), [report]);
  const mapUrl = useMemo(() => getMapUrl(coordinates), [coordinates]);
  const shareText = useMemo(() => report ? buildShareText(report, t, mapUrl) : "", [mapUrl, report, t]);

  if (!report) return null;

  const reportKey = String(report.id ?? shareText);
  const feedbackMessage = feedback.reportKey === reportKey ? feedback.message : "";

  async function handleCopy() {
    try {
      await writeClipboard(shareText);
      setFeedback({ reportKey, message: t.detail.copied });
    } catch {
      setFeedback({ reportKey, message: t.detail.copyFailed });
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `AyudaVE - ${t.type(report.type)}`, text: shareText });
        setFeedback({ reportKey, message: t.detail.shared });
        return;
      } catch {
        setFeedback({ reportKey, message: "" });
        return;
      }
    }

    await handleCopy();
  }

  return (
    <aside className="report-detail" aria-label={t.detail.label}>
      <button className="detail-close" onClick={onClose} type="button" aria-label={t.detail.close}>
        x
      </button>
      <div className={`report-icon ${typeClass(report.type)}`} aria-hidden="true">
        {typeInitial(report.type)}
      </div>
      <p className="detail-type">{t.type(report.type)}</p>
      <h2>{redactSensitiveText(report.detail)}</h2>
      <dl>
        <div>
          <dt>{t.detail.location}</dt>
          <dd>{redactSensitiveText(report.area)}</dd>
        </div>
        <div>
          <dt>{t.detail.city}</dt>
          <dd>{redactSensitiveText(report.city)}</dd>
        </div>
        <div>
          <dt>{t.detail.priority}</dt>
          <dd>{t.priority(report.priority)}</dd>
        </div>
        <div>
          <dt>{t.detail.status}</dt>
          <dd><span className={`status-badge ${report.status.replace(" ", "-")}`}>{t.status(report.status)}</span></dd>
        </div>
        <div>
          <dt>{t.detail.source}</dt>
          <dd><TrustBadge item={report} t={t} /></dd>
        </div>
      </dl>
      {report.source ? (
        <p className={`source-note ${report.status === "Confirmado" ? "is-confirmed" : ""}`}>
          <strong>{t.detail.source}: {report.source}</strong>
          <span>{report.status === "Confirmado" ? t.map.confirmedOrigin : t.detail.sourceCopy}</span>
          {report.source_url ? (
            <a href={report.source_url} rel="noreferrer" target="_blank">
              {t.detail.openSource}
            </a>
          ) : null}
        </p>
      ) : null}
      <div className="detail-actions" aria-label={t.detail.actions}>
        <button className="source-link" onClick={handleCopy} type="button">
          {t.detail.copySummary}
        </button>
        <button className="source-link" onClick={handleShare} type="button">
          {t.detail.shareSummary}
        </button>
        {mapUrl ? (
          <a className="source-link" href={mapUrl} rel="noreferrer" target="_blank">
            {t.detail.openMap}
          </a>
        ) : null}
      </div>
      {feedbackMessage ? (
        <p className="detail-feedback" role="status">
          {feedbackMessage}
        </p>
      ) : null}
    </aside>
  );
}
