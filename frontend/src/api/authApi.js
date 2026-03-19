const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const API_BASE_URL = configuredApiBaseUrl ? configuredApiBaseUrl.replace(/\/+$/, "") : "http://localhost:3000";

export async function registerUser({ username, password }) {
  await request("/api/users", {
    method: "POST",
    body: {
      username,
      password,
    },
  });
}

export async function loginUser({ username, password }) {
  return request("/api/auth/tokens", {
    method: "POST",
    body: {
      username,
      password,
    },
  });
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await readJsonSafe(response);

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Request failed (${response.status})`;
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
