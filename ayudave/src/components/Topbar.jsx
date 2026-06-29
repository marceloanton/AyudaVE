import { Icon } from "./Icon";
import { languages } from "../lib/i18n";

export function Topbar({ activeView, language, onViewChange, serverSyncAvailable, setLanguage, t }) {
  const tabs = [
    ["mapa", "map", t.nav.map],
    ["reportar", "edit", t.nav.report],
    ["directorio", "users", t.nav.directory],
    ["alertas", "bell", t.nav.alerts],
    ["ayuda", "info", t.nav.help],
  ];

  return (
    <header className="topbar">
      <a className="brand" href="#mapa" aria-label="AyudaVE inicio">
        <img src="./assets/icon.svg" alt="" />
        <strong>AyudaVE</strong>
      </a>
      <nav className="tabs" aria-label={t.nav.sections}>
        {tabs.map(([view, icon, label]) => (
          <button
            className={`tab ${activeView === view ? "is-active" : ""}`}
            key={view}
            type="button"
            onClick={() => onViewChange(view)}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </nav>
      <div className="top-status">
        <div className="language-switch" aria-label="Idioma">
          {languages.map((item) => (
            <button
              aria-pressed={language === item.code}
              className={language === item.code ? "is-active" : ""}
              key={item.code}
              onClick={() => setLanguage(item.code)}
              title={item.name}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={`sync-status ${serverSyncAvailable ? "is-online" : "is-offline"}`} aria-live="polite">
          <Icon name="cloud" />
          <span>{serverSyncAvailable ? t.sync.synced : t.sync.offline}</span>
          <small>{serverSyncAvailable ? t.sync.active : t.sync.local}</small>
        </div>
        <button className="menu-button" type="button" aria-label={t.nav.menu}>
          <Icon name="menu" />
        </button>
      </div>
    </header>
  );
}
