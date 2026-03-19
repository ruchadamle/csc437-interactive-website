import { getBackendBaseUrl } from "../config/backendBaseUrl.js";

export async function fetchPokemon() {
  const data = await request("/api/pokemon");
  return (data?.pokemon ?? [])
    .map(normalizePokemonRecord)
    .filter(Boolean);
}

export async function fetchThemes(userId, token) {
  const data = await request(`/api/users/${encodeURIComponent(userId)}/themes`, {
    token,
  });
  return (data?.themes ?? [])
    .map(normalizeThemeRecord)
    .filter(Boolean);
}

export async function createTheme(userId, pokemonKey, token) {
  const data = await request(`/api/users/${encodeURIComponent(userId)}/themes`, {
    method: "POST",
    body: { pokemonKey },
    token,
  });
  return normalizeThemeRecord(data?.theme);
}

export async function deleteTheme(userId, pokemonKey, token) {
  await request(`/api/users/${encodeURIComponent(userId)}/themes/${encodeURIComponent(pokemonKey)}`, {
    method: "DELETE",
    token,
  });
}

async function request(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await readJsonSafe(response);

  if (!response.ok) {
    const message = payload?.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function readJsonSafe(response) {
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizePokemonRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const dex = Number(record.dex);
  if (!Number.isInteger(dex) || dex <= 0) {
    return null;
  }

  const types = Array.isArray(record.types)
    ? record.types.filter((type) => typeof type === "string" && type.trim().length > 0)
    : [];
  if (types.length === 0) {
    return null;
  }

  if (typeof record.key !== "string" || typeof record.name !== "string" || typeof record.imageSrc !== "string") {
    return null;
  }

  return {
    ...record,
    dex,
    types,
  };
}

function normalizeThemeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  if (typeof record.id !== "string" || typeof record.pokemonKey !== "string" || typeof record.pokemonName !== "string") {
    return null;
  }

  const dex = Number(record.dex);
  if (!Number.isInteger(dex) || dex <= 0) {
    return null;
  }

  const types = Array.isArray(record.types)
    ? record.types.filter((type) => typeof type === "string" && type.trim().length > 0)
    : [];
  if (types.length === 0) {
    return null;
  }

  return {
    ...record,
    dex,
    types,
  };
}
