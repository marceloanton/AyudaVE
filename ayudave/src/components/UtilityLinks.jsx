import { useState } from "react";
import { Icon } from "./Icon";
import { referenceSources } from "../data/catalog";

function getSiteUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

const externalSources = [
  "terremotovenezuela.app",
  "centrosdeacopiove.com",
  "venezuelareporta.org",
  "refugiosvenezuela.com",
  "acopios-refugios.vercel.app",
  ...referenceSources.map((source) => `${source.name} (${source.sync})`),
];

function copyText(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
  return Promise.resolve();
}

export function UtilityLinks({ onNavigate, t }) {
  const [copied, setCopied] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);

  async function shareSite() {
    const siteUrl = getSiteUrl();
    const payload = {
      title: "AyudaVE",
      text: t.footer.responsibility,
      url: siteUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else {
        await copyText(siteUrl);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="utility-links" aria-label={t.utility.label}>
      <button aria-describedby="utility-status" onClick={shareSite} type="button">
        <Icon name="chat" />
        {copied ? t.utility.copied : t.utility.share}
      </button>
      <a href="./datos-abiertos-ayudave.html">
        <Icon name="layers" />
        {t.utility.export}
      </a>
      <button
        aria-controls="utility-sources"
        aria-expanded={sourceOpen}
        onClick={() => setSourceOpen((current) => !current)}
        type="button"
      >
        <Icon name="info" />
        {t.utility.sources}
      </button>
      <button onClick={() => onNavigate("ayuda")} type="button">
        <Icon name="edit" />
        {t.utility.guide}
      </button>
      <span className="utility-status" id="utility-status" aria-live="polite">
        {copied ? t.utility.copied : ""}
      </span>
      {sourceOpen ? (
        <div className="utility-popover" id="utility-sources">
          <strong>{t.utility.sourcesTitle}</strong>
          <p>{t.utility.sourcesBody}</p>
          <ul>
            {externalSources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
          <div className="utility-popover-actions">
            <a href="./sources.json" rel="noreferrer" target="_blank">
              {t.utility.sourcesJson}
            </a>
            <a href="./api.php?action=metadata" rel="noreferrer" target="_blank">
              {t.utility.metadata}
            </a>
            <a href="./api.php?action=sync_status" rel="noreferrer" target="_blank">
              {t.utility.syncStatus}
            </a>
          </div>
          <div className="utility-popover-actions api-actions" aria-label="Endpoints publicos">
            <a href="./api.php?action=export_public" rel="noreferrer" target="_blank">
              Feed JSON
            </a>
            <a href="./openapi.json" rel="noreferrer" target="_blank">
              OpenAPI
            </a>
            <a href="./ayudave-public-export.schema.json" rel="noreferrer" target="_blank">
              JSON Schema
            </a>
            <a href="./api.php?action=export_csv&amp;dataset=helpPoints" rel="noreferrer" target="_blank">
              CSV puntos
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
