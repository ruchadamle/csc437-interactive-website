const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function isLocalHostname(hostname) {
  if (!hostname) {
    return false;
  }
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

function getDefaultBaseUrl() {
  if (typeof window !== "undefined" && isLocalHostname(window.location.hostname)) {
    return "http://localhost:3000";
  }
  return "";
}

export function getBackendBaseUrl() {
  const defaultBaseUrl = getDefaultBaseUrl();
  if (!configuredApiBaseUrl) {
    return defaultBaseUrl;
  }

  const normalizedConfiguredBaseUrl = normalizeBaseUrl(configuredApiBaseUrl);

  if (typeof window !== "undefined") {
    try {
      const parsedUrl = new URL(normalizedConfiguredBaseUrl, window.location.origin);
      const currentIsLocal = isLocalHostname(window.location.hostname);
      const configuredIsLocal = isLocalHostname(parsedUrl.hostname);

      // Never use localhost base URLs when the app is served from a non-local origin.
      if (!currentIsLocal && configuredIsLocal) {
        return "";
      }
    } catch {
      // If URL parsing fails, fall back to configured value.
    }
  }

  return normalizedConfiguredBaseUrl;
}
