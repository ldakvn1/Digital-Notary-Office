import { useEffect, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import DirectChatWidget from "./DirectChatWidget";
import { mergeUserIdFromToken } from "./authToken";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";
import { syncAxiosAuthFromStorage } from "./axiosAuthBootstrap";

const DNO_CHAT_POPOUT_ACTIVE_KEY = "dno_chat_popout_active";
const DNO_CHAT_POPOUT_HEARTBEAT_MS = 3000;

export default function ChatPopout() {
  const { t } = useI18n();
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    syncAxiosAuthFromStorage();
    try {
      const raw = localStorage.getItem("user");
      const token = localStorage.getItem("token");
      if (!raw) {
        setUser(null);
      } else {
        const merged = mergeUserIdFromToken(JSON.parse(raw), token);
        setUser(merged);
        if (merged?.id) localStorage.setItem("user", JSON.stringify(merged));
      }
    } catch {
      setUser(null);
    }
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!authChecked) return undefined;
    const prevTitle = document.title;
    if (localStorage.getItem("token") && user) {
      document.title = t("chatWidget.title");
    }
    return () => {
      document.title = prevTitle;
    };
  }, [authChecked, user, t]);

  const hasSession = Boolean(localStorage.getItem("token") && user);

  useEffect(() => {
    if (!hasSession) return undefined;
    let heartbeat = null;
    const clear = () => {
      try {
        localStorage.removeItem(DNO_CHAT_POPOUT_ACTIVE_KEY);
      } catch (_e) {
        /* ignore */
      }
    };
    const touch = () => {
      try {
        localStorage.setItem(DNO_CHAT_POPOUT_ACTIVE_KEY, String(Date.now()));
      } catch (_e2) {
        /* ignore */
      }
    };
    try {
      touch();
      heartbeat = window.setInterval(touch, DNO_CHAT_POPOUT_HEARTBEAT_MS);
    } catch (_e2) {
      /* ignore */
    }
    window.addEventListener("beforeunload", clear);
    window.addEventListener("pagehide", clear);
    return () => {
      window.removeEventListener("beforeunload", clear);
      window.removeEventListener("pagehide", clear);
      if (heartbeat != null) window.clearInterval(heartbeat);
      clear();
    };
  }, [hasSession]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {!authChecked ? null : !hasSession ? (
        <Box
          sx={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
          }}
        >
          <Stack spacing={2} alignItems="center" maxWidth={440}>
            <Typography variant="h6" textAlign="center">
              {t("chatWidget.popoutNeedLogin")}
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {t("chatWidget.popoutNeedLoginHint")}
            </Typography>
            {typeof window !== "undefined" && window.opener && (
              <Button variant="contained" onClick={() => window.opener.focus()}>
                {t("chatWidget.popoutBringMainFocus")}
              </Button>
            )}
          </Stack>
        </Box>
      ) : (
        <Box sx={{ height: "100vh", width: "100vw", overflow: "hidden" }}>
          <DirectChatWidget
            currentUser={user}
            toastApi={toastApi}
            isPopout
            defaultCallVideoEnabled={import.meta.env.PROD}
          />
        </Box>
      )}
      <ToastHost toast={toast} onClose={closeToast} />
    </Box>
  );
}
