import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { helpPoints, seedReports } from "../data/catalog";
import { createServerReport, fetchMissingPeoplePage, fetchServerPayload, fetchSyncStatus, validateHelpPoint } from "../lib/api";
import { getTranslator } from "../lib/i18n";
import {
  loadLocalReports,
  mergeReports,
  coordinatesToLegacyPosition,
  inferApproximateCoordinates,
  parseOptionalCoordinate,
  redactSensitiveText,
  saveLocalReports,
  trimText,
} from "../lib/report-utils";
import { AlertsDrawer } from "./AlertsDrawer";
import { DirectoryView } from "./DirectoryView";
import { HelpPanel } from "./HelpPanel";
import { HelpGuide } from "./HelpGuide";
import { Icon } from "./Icon";
import { MapPanel } from "./MapPanel";
import { PeopleView } from "./PeopleView";
import { ReportDetail } from "./ReportDetail";
import { ReportPanel } from "./ReportPanel";
import { ReportsList } from "./ReportsList";
import { SourceFreshness } from "./SourceFreshness";
import { StatsStrip } from "./StatsStrip";
import { Topbar } from "./Topbar";
import { UtilityLinks } from "./UtilityLinks";

const views = ["mapa", "reportar", "directorio", "personas", "alertas", "ayuda"];
const placeValidationsKey = "ayudave-place-validations";
const missingPeoplePageSize = 300;

function normalizeHashView() {
  const hashView = window.location.hash.replace("#", "");
  return views.includes(hashView) ? hashView : "mapa";
}

function baselineReports() {
  return mergeReports(seedReports, loadLocalReports());
}

function pointKey(point) {
  return String(point.id || `${point.name || ""}-${point.service || ""}-${point.area || ""}`);
}

function loadPlaceValidations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(placeValidationsKey) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePlaceValidations(validations) {
  localStorage.setItem(placeValidationsKey, JSON.stringify(validations));
}

function withLocalPlaceValidations(points, validations = loadPlaceValidations()) {
  return points.map((point) => ({ ...point, userValidation: validations[pointKey(point)] || null }));
}

function applyPlaceVote(point, vote) {
  const previousVote = point.userValidation;
  const isReviewVote = vote === "review" || vote === "incorrect";
  const wasReviewVote = previousVote === "review" || previousVote === "incorrect";
  const activeDelta = (vote === "active" ? 1 : 0) - (previousVote === "active" ? 1 : 0);
  const reviewDelta = (isReviewVote ? 1 : 0) - (wasReviewVote ? 1 : 0);
  const validationActive = Math.max(0, Number(point.validationActive || 0) + activeDelta);
  const validationReview = Math.max(0, Number(point.validationReview || 0) + reviewDelta);
  return {
    ...point,
    validationActive,
    validationReview,
    userValidation: vote,
    status: isReviewVote ? "Sin validar" : point.status,
  };
}

export function PublicApp() {
  const [activeView, setActiveView] = useState(() => normalizeHashView());
  const [language, setLanguage] = useState(() => localStorage.getItem("ayudave-language") || "es");
  const [currentStatus, setCurrentStatus] = useState("todos");
  const [currentType, setCurrentType] = useState("Todos");
  const [query, setQuery] = useState("");
  const [reports, setReports] = useState(() => baselineReports());
  const [directoryPoints, setDirectoryPoints] = useState(() => withLocalPlaceValidations(helpPoints));
  const [missingPeople, setMissingPeople] = useState([]);
  const [missingPeopleCounts, setMissingPeopleCounts] = useState(null);
  const [missingPeoplePage, setMissingPeoplePage] = useState({ hasMore: false, nextOffset: 0, total: 0 });
  const [isLoadingMorePeople, setIsLoadingMorePeople] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [serverSyncAvailable, setServerSyncAvailable] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [isReportPanelOpen, setIsReportPanelOpen] = useState(true);
  const [reportInitialType, setReportInitialType] = useState("Agua");
  const [reportPanelVersion, setReportPanelVersion] = useState(0);
  const isSyncingLocalReports = useRef(false);
  const t = useMemo(() => getTranslator(language), [language]);

  useEffect(() => {
    localStorage.setItem("ayudave-language", language);
  }, [language]);

  useEffect(() => {
    function handleHashChange() {
      const nextView = normalizeHashView();
      setActiveView(nextView);
      if (nextView === "reportar") setIsReportPanelOpen(true);
    }

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  function navigateView(view) {
    if (!views.includes(view)) return;
    setActiveView(view);
    if (view === "reportar") setIsReportPanelOpen(true);
    if (window.location.hash !== `#${view}`) {
      window.location.hash = view;
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchServerPayload(), fetchSyncStatus()])
      .then(([payloadResult, syncResult]) => {
        if (cancelled) return;

        if (payloadResult.status === "fulfilled") {
          const { reports: serverReports, helpPoints: serverHelpPoints, missingPeople: serverMissingPeople, missingPeopleCounts: serverPeopleCounts } = payloadResult.value;
          const trustedReports = serverReports.length > 0 ? serverReports : seedReports;
          setReports((current) => mergeReports(trustedReports, current.filter((item) => item.id.startsWith("local-"))));
          setDirectoryPoints(withLocalPlaceValidations(serverHelpPoints.length > 0 ? serverHelpPoints : helpPoints));
          setMissingPeople(serverMissingPeople);
          setMissingPeopleCounts(serverPeopleCounts);
          setMissingPeoplePage({
            hasMore: !!serverPeopleCounts && serverMissingPeople.length < serverPeopleCounts.total,
            nextOffset: serverMissingPeople.length,
            total: serverPeopleCounts?.total || serverMissingPeople.length,
          });
          setServerSyncAvailable(true);
        } else {
          setServerSyncAvailable(false);
        }

        if (syncResult.status === "fulfilled") {
          setSyncStatus(syncResult.value);
        }
      })
      .catch(() => {
        if (!cancelled) setServerSyncAvailable(false);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingReports(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLoadMorePeople = useCallback(() => {
    if (isLoadingMorePeople || !missingPeoplePage.hasMore) return;
    setIsLoadingMorePeople(true);
    fetchMissingPeoplePage({ limit: missingPeoplePageSize, offset: missingPeoplePage.nextOffset })
      .then((payload) => {
        setMissingPeople((current) => {
          const byId = new Map(current.map((person) => [person.id, person]));
          for (const person of payload.people) {
            byId.set(person.id, person);
          }
          return Array.from(byId.values());
        });
        setMissingPeopleCounts(payload.counts || null);
        setMissingPeoplePage({
          hasMore: !!payload.pagination?.hasMore,
          nextOffset: payload.pagination?.nextOffset || missingPeoplePage.nextOffset + payload.people.length,
          total: payload.pagination?.total || missingPeoplePage.total,
        });
      })
      .catch(() => {
        setMissingPeoplePage((current) => ({ ...current, hasMore: false }));
      })
      .finally(() => setIsLoadingMorePeople(false));
  }, [isLoadingMorePeople, missingPeoplePage.hasMore, missingPeoplePage.nextOffset, missingPeoplePage.total]);

  useEffect(() => {
    const localReports = reports.filter((report) => report.id.startsWith("local-"));
    saveLocalReports(localReports);
  }, [reports]);

  const localReports = useMemo(
    () => reports.filter((report) => report.id.startsWith("local-")),
    [reports],
  );

  const syncLocalReports = useCallback(async () => {
    if (isSyncingLocalReports.current || localReports.length === 0) return;
    isSyncingLocalReports.current = true;
    try {
      for (const report of localReports) {
        const serverReport = await createServerReport(report);
        setReports((current) => current.map((item) => (item.id === report.id ? serverReport : item)));
      }
      setServerSyncAvailable(true);
    } catch {
      setServerSyncAvailable(false);
    } finally {
      isSyncingLocalReports.current = false;
    }
  }, [localReports]);

  useEffect(() => {
    if (serverSyncAvailable && localReports.length > 0) {
      const syncTimer = window.setTimeout(syncLocalReports, 0);
      return () => window.clearTimeout(syncTimer);
    }
    return undefined;
  }, [localReports.length, serverSyncAvailable, syncLocalReports]);

  async function handleCreateReport(formReport) {
    const safeArea = redactSensitiveText(trimText(formReport.area, 140));
    const safeCity = redactSensitiveText(trimText(formReport.city, 80)) || safeArea.slice(0, 80);
    const safeDetail = redactSensitiveText(trimText(formReport.detail, 520));
    const safeContact = redactSensitiveText(trimText(formReport.contact, 120)) || "Sin validar";
    const privacyWasRedacted = [safeArea, safeCity, safeDetail, safeContact].some((value) => value.includes("[dato privado removido]"));
    const formLat = parseOptionalCoordinate(formReport.lat);
    const formLng = parseOptionalCoordinate(formReport.lng);
    const approximateCoordinates = inferApproximateCoordinates(safeCity, safeArea);
    const lat = formLat ?? approximateCoordinates.lat;
    const lng = formLng ?? approximateCoordinates.lng;
    const legacyPosition = coordinatesToLegacyPosition(lat, lng);
    const localReport = {
      id: `local-${Date.now()}`,
      type: formReport.type,
      area: safeArea,
      city: safeCity,
      priority: formReport.priority,
      status: "Sin validar",
      detail: safeDetail,
      contact: safeContact,
      privacyReview: false,
      privacyReviewed: privacyWasRedacted,
      lat,
      lng,
      x: legacyPosition.x,
      y: legacyPosition.y,
      createdAt: "Guardado localmente",
    };

    setReports((current) => mergeReports([localReport], current));
    try {
      const serverReport = await createServerReport(localReport);
      setReports((current) => current.map((report) => (report.id === localReport.id ? serverReport : report)));
      setServerSyncAvailable(true);
    } catch (error) {
      console.warn(error.message);
      setServerSyncAvailable(false);
    }
  }

  async function handleValidateHelpPoint(point, vote) {
    const key = pointKey(point);
    const validations = { ...loadPlaceValidations(), [key]: vote };
    savePlaceValidations(validations);
    setDirectoryPoints((current) => current.map((item) => (pointKey(item) === key ? applyPlaceVote(item, vote) : item)));

    if (!point.id) return;
    try {
      const serverVote = vote === "incorrect" ? "review" : vote;
      const serverPoint = await validateHelpPoint({ id: point.id, vote: serverVote });
      setDirectoryPoints((current) => current.map((item) => (
        pointKey(item) === key || item.id === serverPoint.id
          ? { ...serverPoint, userValidation: vote }
          : item
      )));
      setServerSyncAvailable(true);
    } catch (error) {
      console.warn(error.message);
      setServerSyncAvailable(false);
    }
  }

  const filteredReports = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return reports.filter((report) => {
      const statusMatch = currentStatus === "todos" || report.status === currentStatus;
      const typeMatch = currentType === "Todos" || report.type === currentType;
      const haystack = `${report.type} ${report.area} ${report.city} ${report.detail}`.toLowerCase();
      return statusMatch && typeMatch && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [currentStatus, currentType, query, reports]);

  const filteredHelpPoints = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return directoryPoints.filter((point) => {
      const statusMatch = currentStatus === "todos" || point.status === currentStatus || (currentStatus === "Confirmado" && point.status === "Abierto");
      const typeMatch = currentType === "Todos" || point.type === currentType;
      const haystack = `${point.name || ""} ${point.type || ""} ${point.area || ""} ${point.service || ""} ${point.status || ""}`.toLowerCase();
      return statusMatch && typeMatch && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [currentStatus, currentType, directoryPoints, query]);

  const pendingCount = localReports.length;
  const showMapExperience = activeView === "mapa" || activeView === "reportar";
  const showReportPanel = activeView === "reportar" && isReportPanelOpen;

  return (
    <div className="app-shell">
      <Topbar
        activeView={activeView}
        language={language}
        onViewChange={navigateView}
        serverSyncAvailable={serverSyncAvailable}
        setLanguage={setLanguage}
        t={t}
      />
      <main className={`dashboard ${showReportPanel ? "" : "dashboard-full"}`}>
        {showReportPanel ? (
          <ReportPanel
            key={`${reportInitialType}-${reportPanelVersion}`}
            onClose={() => setIsReportPanelOpen(false)}
            onCreateReport={handleCreateReport}
            pendingCount={pendingCount}
            serverSyncAvailable={serverSyncAvailable}
            initialType={reportInitialType}
            t={t}
          />
        ) : null}
        <section className={`work-area view-${activeView}`} id={`view-${activeView}`} aria-labelledby={`${activeView}-title`}>
          {showMapExperience ? (
            <>
              <MapPanel
                helpPoints={filteredHelpPoints}
                currentType={currentType}
                onSelectReport={setSelectedReport}
                query={query}
                reports={filteredReports}
                selectedReport={selectedReport}
                setCurrentType={setCurrentType}
                setQuery={setQuery}
                t={t}
              />
              <div className="operations-strip">
                <StatsStrip
                  helpCount={directoryPoints.length}
                  isLoading={isLoadingReports}
                  reports={reports}
                  serverSyncAvailable={serverSyncAvailable}
                  t={t}
                />
                <SourceFreshness syncStatus={syncStatus} t={t} />
              </div>
              <div className="content-grid">
                <ReportsList
                  currentStatus={currentStatus}
                  onSelectReport={setSelectedReport}
                  isLoading={isLoadingReports}
                  reports={filteredReports}
                  selectedReportId={selectedReport?.id}
                  setCurrentStatus={setCurrentStatus}
                  t={t}
                />
                {selectedReport ? (
                  <ReportDetail onClose={() => setSelectedReport(null)} report={selectedReport} t={t} />
                ) : (
                  <HelpPanel helpPoints={filteredHelpPoints.slice(0, 12)} onNavigate={navigateView} onValidatePoint={handleValidateHelpPoint} t={t} />
                )}
              </div>
            </>
          ) : null}
          {activeView === "directorio" ? <DirectoryView helpPoints={directoryPoints} onValidatePoint={handleValidateHelpPoint} t={t} /> : null}
          {activeView === "personas" ? (
            <PeopleView
              counts={missingPeopleCounts}
              hasMore={missingPeoplePage.hasMore}
              isLoadingMore={isLoadingMorePeople}
              onLoadMore={handleLoadMorePeople}
              people={missingPeople}
              total={missingPeoplePage.total}
              t={t}
            />
          ) : null}
          {activeView === "alertas" ? (
            <AlertsDrawer
              open
              reports={reports}
              serverSyncAvailable={serverSyncAvailable}
              syncStatus={syncStatus}
              t={t}
            />
          ) : null}
          {activeView === "ayuda" ? (
            <HelpGuide
              helpPoints={directoryPoints}
              onNavigate={navigateView}
              onStartReport={(type = "Agua") => {
                setReportInitialType(type);
                setReportPanelVersion((version) => version + 1);
                navigateView("reportar");
              }}
              reports={reports}
              syncStatus={syncStatus}
              t={t}
            />
          ) : null}
        </section>
      </main>
      <footer className="bottom-bar">
        <Icon name="info" />
        <p>{t.footer.responsibility}</p>
        <UtilityLinks onNavigate={navigateView} t={t} />
      </footer>
    </div>
  );
}
