const apiUrl = "api.php";

export async function fetchServerReports() {
  const payload = await fetchServerPayload();
  return payload.reports;
}

export async function fetchServerPayload() {
  const response = await fetch(`${apiUrl}?t=${Date.now()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/json")) {
    throw new Error("API no disponible");
  }
  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.reports)) {
    throw new Error(payload.error || "Respuesta invalida");
  }
  return {
    reports: payload.reports,
    helpPoints: Array.isArray(payload.helpPoints) ? payload.helpPoints : [],
    missingPeople: Array.isArray(payload.missingPeople) ? payload.missingPeople : [],
  };
}

export async function fetchHealth() {
  const response = await fetch(`${apiUrl}?action=health&t=${Date.now()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok || !payload.health) {
    throw new Error(payload.error || "No se pudo leer estado del sistema.");
  }
  return payload.health;
}

export async function fetchSyncStatus() {
  const response = await fetch(`${apiUrl}?action=sync_status&t=${Date.now()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok || payload.schema !== "ayudave-sync-status-v1") {
    throw new Error(payload.error || "No se pudo leer sincronizacion.");
  }
  return payload;
}

export async function createServerReport(report) {
  const response = await fetch(apiUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(report),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok || !payload.report) {
    throw new Error(payload.error || "No se pudo sincronizar");
  }
  return payload.report;
}

export async function validateHelpPoint({ id, vote }) {
  const response = await fetch(apiUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "validate_help_point",
      id,
      vote,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok || !payload.helpPoint) {
    throw new Error(payload.error || "No se pudo validar el lugar.");
  }
  return payload.helpPoint;
}

export async function registerCommunityMember(member) {
  const response = await fetch(apiUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "register_member",
      ...member,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok || !payload.member) {
    throw new Error(payload.error || "No se pudo registrar.");
  }
  return payload.member;
}

export async function updateServerReportStatus({ id, status, adminPin = "" }) {
  const response = await fetch(apiUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "update_status",
      admin_pin: adminPin,
      id,
      status,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok || !payload.report) {
    throw new Error(payload.error || "No se pudo actualizar.");
  }
  return payload.report;
}

export async function sanitizeServerReportPrivacy({ id, adminPin = "" }) {
  const response = await fetch(apiUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "sanitize_privacy",
      admin_pin: adminPin,
      id,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok || !payload.report) {
    throw new Error(payload.error || "No se pudo limpiar privacidad.");
  }
  return payload.report;
}

export async function fetchAdminPayload({ adminPin = "" } = {}) {
  const response = await fetch(apiUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "admin_payload",
      admin_pin: adminPin,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok || !Array.isArray(payload.reports)) {
    throw new Error(payload.error || "No se pudo cargar moderacion.");
  }
  return {
    reports: payload.reports,
    members: Array.isArray(payload.members) ? payload.members : [],
    syncSummary: Array.isArray(payload.syncSummary) ? payload.syncSummary : [],
    generatedAt: payload.generatedAt || null,
  };
}

export async function loginAdminSession({ adminPin }) {
  const response = await fetch(apiUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "admin_login",
      admin_pin: adminPin,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok || !payload.authenticated) {
    throw new Error(payload.error || "No se pudo iniciar sesion.");
  }
  return payload;
}

export async function fetchAdminSession() {
  const response = await fetch(apiUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "admin_session" }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "No se pudo validar sesion.");
  }
  return payload;
}

export async function logoutAdminSession() {
  const response = await fetch(apiUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "admin_logout" }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "No se pudo cerrar sesion.");
  }
  return payload;
}

export async function syncExternalSource({ adminPin = "", source }) {
  const response = await fetch(apiUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "sync_external",
      admin_pin: adminPin,
      source,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "No se pudo sincronizar fuente externa.");
  }
  return payload;
}
