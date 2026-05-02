/** Default STUN for WebRTC when VITE_WEBRTC_ICE_SERVERS is missing or invalid. */
export const DEFAULT_WEBRTC_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export function parseWebRtcIceServers() {
  try {
    const raw = import.meta?.env?.VITE_WEBRTC_ICE_SERVERS;
    if (!raw || typeof raw !== "string") return DEFAULT_WEBRTC_ICE_SERVERS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_WEBRTC_ICE_SERVERS;
  } catch {
    return DEFAULT_WEBRTC_ICE_SERVERS;
  }
}

export function newWebRtcCallId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** User-facing toast for getUserMedia / WebRTC failures (secure context, permissions, hardware). */
export function toastGetUserMediaFailure(toastApi, t, err) {
  if (!toastApi?.error || !t) return;
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    toastApi.error(t("chatWidget.callMediaNeedsSecureContext"));
    return;
  }
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    toastApi.error(t("chatWidget.callMediaPermissionDenied"));
    return;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    toastApi.error(t("chatWidget.callMediaNoDevice"));
    return;
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    toastApi.error(t("chatWidget.callMediaInUse"));
    return;
  }
  if (name === "OverconstrainedError") {
    toastApi.error(t("chatWidget.callMediaConstraint"));
    return;
  }
  if (name === "NotSupportedError" || name === "TypeError" || name === "SecurityError") {
    toastApi.error(t("chatWidget.callMediaNotSupported"));
    return;
  }
  toastApi.error(t("chatWidget.callMediaPermissionError"));
}
