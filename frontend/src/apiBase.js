const rawEnv = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function stripTrailingSlashes(s) {
  return String(s || "").replace(/\/+$/, "");
}

/** True if hostname looks like a private LAN address (not localhost). */
function isPrivateLanHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h || h === "localhost" || h === "127.0.0.1") return false;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h);
}

/**
 * When the UI is opened via localhost but VITE_API_URL points at a LAN IP, use localhost + same port
 * for API and Socket.IO so the dev machine talks to its own backend (avoids flaky WS to another NIC/IP).
 * Remote devices should open the UI via the LAN host so API_BASE stays on that host.
 */
export function resolveApiBase() {
  let base = stripTrailingSlashes(rawEnv);
  if (typeof window === "undefined") return base;
  try {
    const api = new URL(base);
    const pageHost = window.location.hostname;
    const pageIsLocal = pageHost === "localhost" || pageHost === "127.0.0.1";
    if (pageIsLocal && isPrivateLanHost(api.hostname)) {
      api.hostname = "localhost";
      return stripTrailingSlashes(api.origin);
    }
    return stripTrailingSlashes(api.origin);
  } catch {
    return base;
  }
}

/** Resolved once at module load in the browser (SPA). */
export const API_BASE = resolveApiBase();
