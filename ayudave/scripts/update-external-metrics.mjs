import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const source = {
  id: "desaparecidos_terremoto_venezuela",
  name: "Desaparecidos Terremoto Venezuela",
  url: "https://desaparecidosterremotovenezuela.com/",
  api: "https://desaparecidos-terremoto-api.theempire.tech/api/metricas",
  mode: "aggregate_snapshot",
};

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function normalizeMetrics(payload) {
  const geo = payload && typeof payload.geo === "object" ? payload.geo : payload || {};
  const children = Array.isArray(payload?.children) ? payload.children : [];

  return {
    totalPeople: toInteger(geo.totalPersonas ?? geo.personasUnicas ?? geo.total),
    withoutContact: toInteger(geo.sinContacto),
    localized: toInteger(geo.localizados ?? geo.localizado),
    localizedHospital: toInteger(geo.localizadosHospital),
    localizedCenter: toInteger(geo.localizadosCentro),
    reportedConcerns: toInteger(geo.denunciadas),
    topRegions: children.slice(0, 5).map((child) => {
      const metrics = child && typeof child.metrics === "object" ? child.metrics : {};
      return {
        name: String(child?.nombre || child?.name || "Sin nombre").slice(0, 80),
        total: toInteger(metrics.totalPersonas ?? metrics.personasUnicas),
        withoutContact: toInteger(metrics.sinContacto),
        localized: toInteger(metrics.localizados ?? metrics.localizado),
      };
    }),
  };
}

async function main() {
  const response = await fetch(source.api, {
    headers: {
      Accept: "application/json",
      "User-Agent": "AyudaVE/1.0 snapshot updater",
    },
  });
  if (!response.ok) {
    throw new Error(`External metrics failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const snapshot = {
    schema: "ayudave-external-metrics-snapshot-v1",
    snapshotAt: new Date().toISOString(),
    source,
    privacy: {
      aggregateOnly: true,
      peopleImported: false,
      note: "Snapshot agregado sin fichas personales, fotos, documentos ni contactos.",
    },
    metrics: normalizeMetrics(payload),
  };

  const outputPath = join(process.cwd(), "external-metrics.json");
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Updated external metrics snapshot: ${snapshot.metrics.totalPeople} total`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
