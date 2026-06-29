import { useMemo, useState } from "react";
import { Icon } from "./Icon";

const fieldChecklistKey = "ayudave-field-checklist-v1";

function loadChecklistState(length) {
  try {
    const parsed = JSON.parse(localStorage.getItem(fieldChecklistKey) || "[]");
    return Array.from({ length }, (_, index) => Boolean(parsed[index]));
  } catch {
    return Array.from({ length }, () => false);
  }
}

function saveChecklistState(items) {
  localStorage.setItem(fieldChecklistKey, JSON.stringify(items));
}

function buildFieldSummary(reports = [], helpPoints = []) {
  return reports.reduce(
    (summary, report) => {
      const isOpen = report.status !== "Resuelto";
      if (isOpen) summary.open += 1;
      if (isOpen && report.priority === "Alta") summary.urgent += 1;
      if (report.status === "Sin validar") summary.pending += 1;
      if (report.status === "Sin validar" && report.priority === "Alta") summary.urgentPending += 1;
      return summary;
    },
    {
      open: 0,
      urgent: 0,
      pending: 0,
      urgentPending: 0,
      activeHelp: helpPoints.filter((point) => point.status === "Abierto" || point.status === "Confirmado").length,
    },
  );
}

function buildSituationReport(summary, t) {
  return [
    t.fieldMode.situationHeader,
    `${t.fieldMode.situationOpen}: ${summary.open}`,
    `${t.fieldMode.situationUrgent}: ${summary.urgent}`,
    `${t.fieldMode.situationPending}: ${summary.pending}`,
    `${t.fieldMode.situationHelp}: ${summary.activeHelp}`,
    `${t.fieldMode.situationTime}: ${new Date().toLocaleString()}`,
    t.fieldMode.situationPrivacy,
  ].join("\n");
}

function reportPriorityScore(report) {
  let score = 0;
  if (report.priority === "Alta") score += 4;
  if (report.status === "Sin validar") score += 3;
  if (report.privacyReview) score += 2;
  if (report.source) score += 1;
  return score;
}

function buildAttentionQueue(reports = []) {
  return [...reports]
    .filter((report) => report.status !== "Resuelto")
    .sort((first, second) => reportPriorityScore(second) - reportPriorityScore(first))
    .slice(0, 3);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    return Promise.race([
      navigator.clipboard.writeText(value).then(() => true).catch(() => false),
      new Promise((resolve) => {
        window.setTimeout(() => resolve(false), 500);
      }),
    ]);
  }
  return false;
}

export function FieldMode({ helpPoints = [], onNavigate, onStartReport, reports = [], t }) {
  const [checked, setChecked] = useState(() => loadChecklistState(t.fieldMode.checklist.length));
  const [feedback, setFeedback] = useState("");
  const [messageMode, setMessageMode] = useState("template");
  const completed = checked.filter(Boolean).length;
  const summary = useMemo(() => buildFieldSummary(reports, helpPoints), [reports, helpPoints]);
  const attentionQueue = useMemo(() => buildAttentionQueue(reports), [reports]);
  const templateMessage = useMemo(() => t.fieldMode.messageLines.join("\n"), [t]);
  const situationMessage = useMemo(() => buildSituationReport(summary, t), [summary, t]);
  const fieldMessage = messageMode === "situation" ? situationMessage : templateMessage;
  const priorityCards = [
    { key: "urgent", value: summary.urgent, label: t.fieldMode.urgentReports, action: "alertas" },
    { key: "pending", value: summary.pending, label: t.fieldMode.pendingValidation, action: "mapa" },
    { key: "help", value: summary.activeHelp, label: t.fieldMode.activeHelpPoints, action: "directorio" },
  ];

  function toggleItem(index) {
    setChecked((current) => {
      const next = current.map((value, itemIndex) => (itemIndex === index ? !value : value));
      saveChecklistState(next);
      return next;
    });
  }

  async function handleCopyMessage() {
    setFeedback(t.fieldMode.copyFallback);
    try {
      const copied = await copyText(fieldMessage);
      if (copied) setFeedback(t.fieldMode.copied);
    } catch {
      setFeedback(t.fieldMode.copyFallback);
    }
  }

  return (
    <section className="field-mode" aria-labelledby="field-mode-title">
      <div className="field-mode-head">
        <div>
          <p>{t.fieldMode.eyebrow}</p>
          <h2 id="field-mode-title">{t.fieldMode.title}</h2>
          <span>{t.fieldMode.body}</span>
        </div>
        <strong>{completed}/{t.fieldMode.checklist.length}</strong>
      </div>

      <div className="field-mode-actions" aria-label={t.fieldMode.quickActions}>
        {t.fieldMode.quickNeeds.map((item) => (
          <button key={item.type} onClick={() => onStartReport(item.type)} type="button">
            <Icon name="edit" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="field-priority" aria-label={t.fieldMode.priorityTitle}>
        <h3>{t.fieldMode.priorityTitle}</h3>
        <div>
          {priorityCards.map((card) => (
            <button key={card.key} onClick={() => onNavigate?.(card.action)} type="button">
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </button>
          ))}
        </div>
        <p>{summary.urgentPending > 0 ? t.fieldMode.urgentPendingHint : t.fieldMode.priorityHint}</p>
      </div>

      <div className="field-attention" aria-label={t.fieldMode.queueTitle}>
        <div>
          <h3>{t.fieldMode.queueTitle}</h3>
          <button onClick={() => onNavigate?.("mapa")} type="button">{t.fieldMode.openMap}</button>
        </div>
        {attentionQueue.length > 0 ? (
          <ol>
            {attentionQueue.map((report) => (
              <li key={report.id}>
                <strong>{t.type(report.type)} · {t.priority(report.priority)}</strong>
                <span>{report.city || report.area}</span>
                <em>{t.status(report.status)}</em>
              </li>
            ))}
          </ol>
        ) : (
          <p>{t.fieldMode.queueEmpty}</p>
        )}
      </div>

      <div className="field-mode-grid">
        <article className="field-checklist">
          <h3>{t.fieldMode.checklistTitle}</h3>
          <ul>
            {t.fieldMode.checklist.map((item, index) => (
              <li className={checked[index] ? "is-done" : ""} key={item}>
                <label>
                  <input checked={checked[index]} onChange={() => toggleItem(index)} type="checkbox" />
                  <span>{item}</span>
                </label>
              </li>
            ))}
          </ul>
        </article>

        <article className="field-message">
          <h3>{t.fieldMode.messageTitle}</h3>
          <div className="field-message-tabs" aria-label={t.fieldMode.messageMode}>
            <button className={messageMode === "template" ? "is-active" : ""} onClick={() => setMessageMode("template")} type="button">
              {t.fieldMode.templateMode}
            </button>
            <button className={messageMode === "situation" ? "is-active" : ""} onClick={() => setMessageMode("situation")} type="button">
              {t.fieldMode.situationMode}
            </button>
          </div>
          <pre>{fieldMessage}</pre>
          <button className="field-copy-button" onClick={handleCopyMessage} type="button">
            <Icon name="chat" />
            {t.fieldMode.copyMessage}
          </button>
          <span className="field-feedback" role="status">{feedback}</span>
        </article>
      </div>
    </section>
  );
}
