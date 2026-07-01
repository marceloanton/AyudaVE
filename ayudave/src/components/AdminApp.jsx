import { useCallback, useEffect, useMemo, useState } from "react";
import { needTypes } from "../data/catalog";
import {
  fetchAdminPayload,
  fetchAdminSession,
  fetchHealth,
  loginAdminSession,
  logoutAdminSession,
  sanitizeServerReportPrivacy,
  syncExternalSource,
  updateServerReportStatus,
} from "../lib/api";
import { AdminReportCard } from "./AdminReportCard";

const sourceOptions = [
  ["todos", "Todas las fuentes"],
  ["ayudave", "AyudaVE"],
  ["externas", "Fuentes externas"],
  ["terremotovenezuela.app", "Terremoto Venezuela"],
  ["centrosdeacopiove.com", "Centros de acopio"],
  ["venezuelareporta.org", "Venezuela Reporta"],
  ["refugiosvenezuela.com", "Refugios Venezuela"],
  ["acopios-refugios.vercel.app", "Venezuela Resiste"],
];

const syncSources = [
  ["all", "Sync todo"],
  ["terremotovenezuela_reports", "Sync reportes"],
  ["centros_acopio", "Sync centros"],
  ["venezuela_reporta_sitios", "Sync sitios"],
  ["refugios_venezuela", "Sync refugios"],
  ["acopios_refugios", "Sync acopios/refugios"],
  ["venezuela_reporta_personas", "Sync personas"],
  ["venezuela_reporta_ingresos", "Sync ingresos"],
  ["localizados_venezuela", "Sync localizados"],
];

const queueOptions = [
  ["todos", "Toda la cola"],
  ["urgentes", "Alta urgencia"],
  ["privacidad", "Privacidad"],
  ["sin-coordenadas", "Sin coordenadas"],
  ["externos-a-validar", "Externos a validar"],
];

function hasCoordinates(report) {
  const lat = Number(report.lat);
  const lng = Number(report.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

export function AdminApp() {
  const [adminPin, setAdminPin] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [reports, setReports] = useState([]);
  const [members, setMembers] = useState([]);
  const [syncSummary, setSyncSummary] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Sin validar");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [sourceFilter, setSourceFilter] = useState("todos");
  const [queueFilter, setQueueFilter] = useState("todos");
  const [health, setHealth] = useState(null);

  const counts = useMemo(
    () => ({
      pending: reports.filter((report) => report.status === "Sin validar").length,
      confirmed: reports.filter((report) => report.status === "Confirmado").length,
      resolved: reports.filter((report) => report.status === "Resuelto").length,
      urgent: reports.filter((report) => report.priority === "Alta" && report.status !== "Resuelto").length,
      privacy: reports.filter((report) => report.privacyReview).length,
      privacyReviewed: reports.filter((report) => report.privacyReviewed).length,
      missingCoordinates: reports.filter((report) => !hasCoordinates(report)).length,
      externalPending: reports.filter((report) => report.source && report.status === "Sin validar").length,
    }),
    [reports],
  );

  const filteredReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return reports.filter((report) => {
      const source = report.source || "ayudave";
      const statusMatch = statusFilter === "todos" || report.status === statusFilter;
      const typeMatch = typeFilter === "Todos" || report.type === typeFilter;
      const sourceMatch =
        sourceFilter === "todos" ||
        sourceFilter === source ||
        (sourceFilter === "externas" && source !== "ayudave");
      const queueMatch =
        queueFilter === "todos" ||
        (queueFilter === "urgentes" && report.priority === "Alta" && report.status !== "Resuelto") ||
        (queueFilter === "privacidad" && report.privacyReview) ||
        (queueFilter === "sin-coordenadas" && !hasCoordinates(report)) ||
        (queueFilter === "externos-a-validar" && report.source && report.status === "Sin validar");
      const haystack = `${report.type} ${report.area} ${report.city} ${report.detail} ${report.contact || ""} ${source}`.toLowerCase();
      return statusMatch && typeMatch && sourceMatch && queueMatch && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [query, queueFilter, reports, sourceFilter, statusFilter, typeFilter]);

  function setStatusMessage(nextMessage, nextIsError = false) {
    setMessage(nextMessage);
    setIsError(nextIsError);
  }

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await fetchHealth());
    } catch {
      setHealth(null);
    }
  }, []);

  const applyAdminPayload = useCallback((payload) => {
    setReports(payload.reports);
    setMembers(Array.isArray(payload.members) ? payload.members : []);
    setSyncSummary(payload.syncSummary);
    setIsAuthenticated(true);
  }, []);

  const refreshAdminSession = useCallback(async () => {
    try {
      const session = await fetchAdminSession();
      setIsAuthenticated(Boolean(session.authenticated));
      if (session.authenticated) {
        try {
          const payload = await fetchAdminPayload();
          applyAdminPayload(payload);
          setStatusMessage(`${payload.reports.length} registros cargados para moderacion.`);
        } catch (error) {
          setStatusMessage(error.message, true);
        }
      }
    } catch (error) {
      setIsAuthenticated(false);
      setStatusMessage(error.message, true);
    } finally {
      setIsCheckingSession(false);
    }
  }, [applyAdminPayload]);

  useEffect(() => {
    const bootstrapTimer = window.setTimeout(() => {
      refreshHealth();
      refreshAdminSession();
    }, 0);
    return () => window.clearTimeout(bootstrapTimer);
  }, [refreshAdminSession, refreshHealth]);

  async function loginAdmin(event) {
    event?.preventDefault();
    if (!adminPin.trim()) {
      setStatusMessage("Ingresa el PIN para moderar.", true);
      return;
    }
    try {
      await loginAdminSession({ adminPin });
      setIsAuthenticated(true);
      setAdminPin("");
      await refreshHealth();
      try {
        const payload = await fetchAdminPayload();
        applyAdminPayload(payload);
        setStatusMessage(`${payload.reports.length} registros cargados para moderacion.`);
      } catch (error) {
        setStatusMessage(error.message, true);
      }
    } catch (error) {
      setIsAuthenticated(false);
      setStatusMessage(error.message, true);
    }
  }

  async function loadReports() {
    try {
      const payload = await fetchAdminPayload({ adminPin });
      applyAdminPayload(payload);
      if (adminPin.trim()) setAdminPin("");
      await refreshHealth();
      setStatusMessage(`${payload.reports.length} registros cargados para moderacion.`);
    } catch (error) {
      setStatusMessage(error.message, true);
    }
  }

  async function updateStatus(id, status) {
    try {
      const updated = await updateServerReportStatus({ id, status, adminPin });
      setReports((current) => current.map((report) => (report.id === id ? updated : report)));
      await refreshHealth();
      setStatusMessage("Estado actualizado.");
    } catch (error) {
      setStatusMessage(error.message, true);
    }
  }

  async function sanitizePrivacy(id) {
    try {
      const updated = await sanitizeServerReportPrivacy({ id, adminPin });
      setReports((current) => current.map((report) => (report.id === id ? updated : report)));
      await refreshHealth();
      setStatusMessage("Datos sensibles removidos del reporte.");
    } catch (error) {
      setStatusMessage(error.message, true);
    }
  }

  async function syncSource(source) {
    if (!isAuthenticated && !adminPin.trim()) {
      setStatusMessage("Inicia sesion para sincronizar.", true);
      return;
    }
    try {
      const payload = await syncExternalSource({ adminPin, source });
      if (payload.source === "all") {
        const totalFetched = Object.values(payload.sources || {}).reduce((total, item) => total + (item.fetched || 0), 0);
        setStatusMessage(`Sync completo: ${totalFetched} registros leidos en fuentes externas.`);
      } else {
        const { fetched, inserted, updated, skipped } = payload.stats;
        setStatusMessage(`Sync ${source}: ${fetched} leidos, ${inserted} nuevos, ${updated} actualizados, ${skipped} omitidos.`);
      }
      const adminPayload = await fetchAdminPayload({ adminPin });
      setReports(adminPayload.reports);
      setMembers(adminPayload.members);
      setSyncSummary(adminPayload.syncSummary);
      await refreshHealth();
    } catch (error) {
      setStatusMessage(error.message, true);
    }
  }

  async function logoutAdmin() {
    try {
      await logoutAdminSession();
      setIsAuthenticated(false);
      setReports([]);
      setMembers([]);
      setSyncSummary([]);
      setAdminPin("");
      setStatusMessage("Sesion admin cerrada.");
    } catch (error) {
      setStatusMessage(error.message, true);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a className="admin-brand" href="index.html">
          <img src="./assets/icon.svg" alt="" />
          <span>AyudaVE</span>
        </a>
        <div>
          <h1>Moderacion de reportes</h1>
          <p>Validar, confirmar o cerrar reportes recibidos por la comunidad.</p>
        </div>
      </header>

      <form className="admin-login" id="loginPanel" onSubmit={loginAdmin}>
        <label>
          {isAuthenticated ? "Sesion de administracion" : "PIN de administracion"}
          <input
            autoComplete="current-password"
            disabled={isAuthenticated}
            onChange={(event) => setAdminPin(event.target.value)}
            placeholder={isAuthenticated ? "Sesion activa" : "Ingresar PIN"}
            type="password"
            value={adminPin}
          />
        </label>
        <button disabled={isAuthenticated || isCheckingSession} type="submit">
          {isCheckingSession ? "Verificando..." : isAuthenticated ? "Sesion activa" : "Entrar"}
        </button>
        {isAuthenticated ? (
          <>
            <button className="admin-secondary-button" onClick={loadReports} type="button">
              Actualizar cola
            </button>
            <button className="admin-secondary-button" onClick={logoutAdmin} type="button">
              Salir
            </button>
          </>
        ) : null}
        <p className={isError ? "is-error" : ""} role="status">
          {message}
        </p>
      </form>

      <section className="admin-health" aria-label="Estado del sistema">
        <article>
          <strong>{health?.database ? "Base activa" : "Base sin confirmar"}</strong>
          <span>{health ? `${health.total || 0} registros totales` : "Sin lectura de salud"}</span>
        </article>
        <article>
          <strong>{health?.lastSyncedAt ? new Date(health.lastSyncedAt).toLocaleString() : "Sin sync"}</strong>
          <span>ultimo sync externo</span>
        </article>
        <article>
          <strong>{health?.pending ?? 0}</strong>
          <span>pendientes de validar</span>
        </article>
        <article>
          <strong>{health?.externalPending ?? counts.externalPending}</strong>
          <span>externos a validar</span>
        </article>
        <article>
          <strong>{health?.missingCoordinates ?? counts.missingCoordinates}</strong>
          <span>sin coordenadas</span>
        </article>
        <article>
          <strong>{health?.privacyReviewed ?? counts.privacyReviewed}</strong>
          <span>privacidad saneada</span>
        </article>
        <button onClick={refreshHealth} type="button">Actualizar salud</button>
      </section>

      <section className="admin-summary" aria-label="Resumen">
        <article>
          <strong>{counts.pending}</strong>
          <span>sin validar</span>
        </article>
        <article>
          <strong>{counts.confirmed}</strong>
          <span>confirmados</span>
        </article>
        <article>
          <strong>{counts.resolved}</strong>
          <span>resueltos</span>
        </article>
        <article>
          <strong>{counts.urgent}</strong>
          <span>alta urgencia activos</span>
        </article>
        <article>
          <strong>{counts.privacy}</strong>
          <span>revisar privacidad</span>
        </article>
        <article>
          <strong>{counts.privacyReviewed}</strong>
          <span>privacidad saneada</span>
        </article>
        <article>
          <strong>{counts.missingCoordinates}</strong>
          <span>sin coordenadas</span>
        </article>
        <article>
          <strong>{counts.externalPending}</strong>
          <span>externos a validar</span>
        </article>
        <article>
          <strong>{members.length}</strong>
          <span>colaboradores registrados</span>
        </article>
      </section>

      <section className="admin-queue" aria-label="Colas de revision">
        {queueOptions.map(([value, label]) => (
          <button className={queueFilter === value ? "is-active" : ""} key={value} onClick={() => setQueueFilter(value)} type="button">
            {label}
          </button>
        ))}
      </section>

      <section className="admin-sync" aria-label="Sincronizar fuentes externas">
        <div>
          <h2>Sincronizacion externa</h2>
          <p>Importa datos publicos, conserva duplicados por fuente y deja visible que requieren validacion si no vienen confirmados.</p>
        </div>
        {syncSources.map(([source, label]) => (
          <button disabled={!isAuthenticated} key={source} onClick={() => syncSource(source)} type="button">
            {label}
          </button>
        ))}
      </section>

      {syncSummary.length > 0 ? (
        <section className="admin-source-grid" aria-label="Estado por fuente">
          {syncSummary.map((item) => (
            <article key={item.source}>
              <strong>{item.source}</strong>
              <span>{item.total} registros · {item.pending} sin validar · {item.confirmed} confirmados</span>
              <small>{item.lastSyncedAt ? `Ultimo sync: ${new Date(item.lastSyncedAt).toLocaleString()}` : "Sin cron registrado"}</small>
            </article>
          ))}
        </section>
      ) : null}

      {members.length > 0 ? (
        <section className="admin-members" aria-label="Colaboradores registrados">
          <div>
            <h2>Registro comunitario</h2>
            <p>Contactos privados para coordinacion. No se publican en mapa ni datos abiertos.</p>
          </div>
          {members.map((member) => (
            <article key={member.id}>
              <strong>{member.alias}</strong>
              <span>{member.role} · {member.area}</span>
              <small>{member.availability || "Sin disponibilidad"} · {member.contactType || "contacto"} {member.contactMasked || ""}</small>
              {member.notes ? <em>{member.notes}</em> : null}
              <b>{member.status}</b>
            </article>
          ))}
        </section>
      ) : null}

      <section className="admin-filters" aria-label="Filtros de moderacion">
        <input
          aria-label="Buscar en moderacion"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar zona, detalle, contacto o fuente"
          type="search"
          value={query}
        />
        <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
          <option value="todos">Todos los estados</option>
          <option value="Sin validar">Sin validar</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Resuelto">Resuelto</option>
        </select>
        <select onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
          {["Todos", ...needTypes].map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select onChange={(event) => setSourceFilter(event.target.value)} value={sourceFilter}>
          {sourceOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <strong>{filteredReports.length} visibles</strong>
      </section>

      <section className="admin-list" aria-live="polite">
        {filteredReports.map((report) => (
          <AdminReportCard key={`${report.id}-${report.status}`} onSanitizePrivacy={sanitizePrivacy} onUpdate={updateStatus} report={report} />
        ))}
      </section>
    </main>
  );
}
