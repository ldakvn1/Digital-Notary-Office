/** Decode JWT payload (no signature verification — only for client hints). */
export function decodeAccessTokenPayload(accessToken) {
  if (!accessToken || typeof accessToken !== "string") return null;
  try {
    const part = accessToken.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** Ensure `user.id` is set from access token when API omitted it (legacy sessions). */
export function mergeUserIdFromToken(user, accessToken) {
  if (!user || typeof user !== "object") return user;
  const existing = Number(user.id);
  if (Number.isFinite(existing) && existing > 0) return user;
  const payload = decodeAccessTokenPayload(accessToken);
  const id = Number(payload?.id);
  if (!Number.isFinite(id) || id <= 0) return user;
  return { ...user, id };
}
