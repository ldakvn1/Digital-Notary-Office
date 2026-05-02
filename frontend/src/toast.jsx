import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, LinearProgress, Slide, Snackbar, Typography } from "@mui/material";

function SlideLeftTransition(props) {
  return <Slide {...props} direction="left" />;
}

export function useToastQueue(defaultAutoHideMs = 3200) {
  const [queue, setQueue] = useState([]);
  const dedupeRef = useRef(new Map());
  const pushToast = useCallback(
    ({ message, severity = "info", autoHideDuration = defaultAutoHideMs }) => {
      const dedupeKey = `${severity}:${message}`;
      const now = Date.now();
      const lastAt = dedupeRef.current.get(dedupeKey);
      if (lastAt && now - lastAt < 1400) return;
      dedupeRef.current.set(dedupeKey, now);

      const item = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        message,
        severity,
        autoHideDuration,
      };
      setQueue((prev) => [...prev, item]);
    },
    [defaultAutoHideMs]
  );

  const closeToast = useCallback(() => {
    setQueue((prev) => (prev.length > 0 ? prev.slice(1) : prev));
  }, []);

  const current = queue[0] || null;

  const api = useMemo(
    () => ({
      show: pushToast,
      success: (message) => pushToast({ message, severity: "success" }),
      error: (message) => pushToast({ message, severity: "error" }),
      warning: (message) => pushToast({ message, severity: "warning" }),
      info: (message) => pushToast({ message, severity: "info" }),
    }),
    [pushToast]
  );

  return { toast: current, closeToast, api };
}

export function ToastHost({ toast, onClose }) {
  const duration = toast?.autoHideDuration || 3200;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!toast) return undefined;
    setProgress(100);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(next);
    }, 40);
    return () => clearInterval(timer);
  }, [toast, duration]);

  return (
    <Snackbar
      key={toast?.id}
      open={Boolean(toast)}
      autoHideDuration={duration}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      TransitionComponent={SlideLeftTransition}
    >
      <Alert
        severity={toast?.severity || "info"}
        variant="filled"
        onClose={onClose}
        sx={{
          minWidth: 360,
          borderRadius: 2,
          boxShadow: "0 12px 28px rgba(2,6,23,0.28)",
          backdropFilter: "blur(4px)",
          bgcolor: "rgba(15,23,42,0.92)",
          color: "#f8fafc",
          "& .MuiAlert-icon": { color: "#fff", alignItems: "center" },
          "& .MuiAlert-action": { color: "#fff" },
        }}
      >
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {toast?.message || ""}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              mt: 1,
              height: 4,
              borderRadius: 10,
              bgcolor: "rgba(255,255,255,0.22)",
              "& .MuiLinearProgress-bar": { bgcolor: "#ffffff" },
            }}
          />
        </Box>
      </Alert>
    </Snackbar>
  );
}
