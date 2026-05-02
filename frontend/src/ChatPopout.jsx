import { useEffect, useState } from "react";
import axios from "axios";
import { Box, Button, Stack, Typography } from "@mui/material";
import DirectChatWidget from "./DirectChatWidget";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";

function applyAuthFromStorage() {
  const token = localStorage.getItem("token");
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
}

export default function ChatPopout() {
  const { t } = useI18n();
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    applyAuthFromStorage();
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? JSON.parse(raw) : null);
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
          <DirectChatWidget currentUser={user} toastApi={toastApi} isPopout />
        </Box>
      )}
      <ToastHost toast={toast} onClose={closeToast} />
    </Box>
  );
}
