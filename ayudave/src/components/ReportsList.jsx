import { useMemo, useState } from "react";
import { redactSensitiveText, typeClass, typeInitial } from "../lib/report-utils";
import { TrustBadge } from "./TrustBadge";

const priorityRank = { Alta: 0, Media: 1, Baja: 2 };

function displayContact(contact, t) {
  if (!contact || contact === "Sin validar") return t.reports.noContact;
  const peopleMatch = contact.match(/^(\d+)\s+personas$/i);
  if (peopleMatch) return `${t.reportForm.people}: ${peopleMatch[1]}`;
  if (contact.startsWith("Sin validar ")) {
    return contact.replace("Sin validar", t.reports.noContact);
  }
  return redactSensitiveText(contact);
}

function reportTimeRank(report) {
  if (report.id?.startsWith("local-")) {
    const localTimestamp = Number(report.id.replace("local-", ""));
    if (Number.isFinite(localTimestamp)) return localTimestamp;
  }

  const value = String(report.updatedAt || report.createdAt || "");
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;

  const todayMatch = value.match(/^Hoy\s+(\d{1,2}):(\d{2})$/i);
  if (todayMatch) {
    const date = new Date();
    date.setHours(Number(todayMatch[1]), Number(todayMatch[2]), 0, 0);
    return date.getTime();
  }

  const yesterdayMatch = value.match(/^Ayer\s+(\d{1,2}):(\d{2})$/i);
  if (yesterdayMatch) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setHours(Number(yesterdayMatch[1]), Number(yesterdayMatch[2]), 0, 0);
    return date.getTime();
  }

  const shortDateMatch = value.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (shortDateMatch) {
    const date = new Date();
    date.setMonth(Number(shortDateMatch[2]) - 1, Number(shortDateMatch[1]));
    date.setHours(Number(shortDateMatch[3]), Number(shortDateMatch[4]), 0, 0);
    return date.getTime();
  }

  return 0;
}

function sortReports(reports, sortMode) {
  return [...reports].sort((first, second) => {
    if (sortMode === "urgency") {
      const firstPriority = priorityRank[first.priority] ?? 3;
      const secondPriority = priorityRank[second.priority] ?? 3;
      if (firstPriority !== secondPriority) return firstPriority - secondPriority;
      if (first.status !== second.status) {
        if (first.status === "Sin validar") return -1;
        if (second.status === "Sin validar") return 1;
      }
    }

    return reportTimeRank(second) - reportTimeRank(first);
  });
}

export function ReportsList({ currentStatus, isLoading, onSelectReport, reports, selectedReportId, setCurrentStatus, t }) {
  const [sortMode, setSortMode] = useState("recent");
  const sortedReports = useMemo(() => sortReports(reports, sortMode), [reports, sortMode]);
  const visibleReports = sortedReports.slice(0, 80);
  const filters = [
    ["todos", t.reports.near],
    ["Sin validar", t.status("Sin validar")],
    ["Confirmado", t.reports.confirmed],
    ["Resuelto", t.reports.resolved],
  ];

  return (
    <section className="reports-panel" aria-labelledby="mapa-title">
      <div className="list-tabs" role="group" aria-label={t.reports.listLabel}>
        {filters.map(([value, label], index) => (
          <button
            className={`list-tab ${currentStatus === value ? "is-active" : ""}`}
            id={index === 0 ? "mapa-title" : undefined}
            key={value}
            onClick={() => setCurrentStatus(value)}
            type="button"
          >
            {label}
          </button>
        ))}
        <label>
          {t.reports.orderBy}
          <select aria-label={t.reports.orderBy} onChange={(event) => setSortMode(event.target.value)} value={sortMode}>
            <option value="recent">{t.reports.recent}</option>
            <option value="urgency">{t.reports.urgency}</option>
          </select>
        </label>
      </div>
      <div className="report-list" aria-live="polite">
        {isLoading ? (
          <div className="empty-state">
            <h3>{t.reports.loadingTitle}</h3>
            <p>{t.reports.loadingBody}</p>
          </div>
        ) : null}
        {!isLoading && reports.length === 0 ? (
          <div className="empty-state">
            <h3>{t.reports.emptyTitle}</h3>
            <p>{t.reports.emptyBody}</p>
          </div>
        ) : null}
        {!isLoading && visibleReports.map((report) => (
          <button
            className={`report-row ${selectedReportId === report.id ? "is-selected" : ""}`}
            key={report.id}
            onClick={() => onSelectReport(report)}
            type="button"
          >
            <div className={`report-icon ${typeClass(report.type)}`} aria-hidden="true">
              {typeInitial(report.type)}
            </div>
            <div className="report-main">
              <h3>
                <span>{t.type(report.type)}</span>
                {redactSensitiveText(report.detail)}
              </h3>
              <p>{redactSensitiveText(report.area)}</p>
              <p>
                {displayContact(report.contact, t)} · {t.priority(report.priority)}
              </p>
              <TrustBadge item={report} t={t} />
            </div>
            <span className="report-time">{report.createdAt}</span>
            <span className={`status-badge ${report.status.replace(" ", "-")}`}>{t.status(report.status)}</span>
            <span className="row-arrow" aria-hidden="true">
              &rsaquo;
            </span>
          </button>
        ))}
        {reports.length > visibleReports.length ? (
          <p className="list-limit">{t.reports.showing} {visibleReports.length} {t.reports.of} {reports.length}. {t.reports.refine}</p>
        ) : null}
      </div>
    </section>
  );
}
