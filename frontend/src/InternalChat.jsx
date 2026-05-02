import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "./apiBase";
import axios from "axios";
import {
  Avatar,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useI18n } from "./i18n";

const POLL_INTERVAL_MS = 5000;

export default function InternalChat({ currentUser, toastApi }) {
  const { t, language } = useI18n();
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const listRef = useRef(null);

  const me = String(currentUser?.username || "").toLowerCase();

  const loadMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await axios.get(API_BASE + "/chat/messages", {
        params: { limit: 100 },
      });
      setMessages(Array.isArray(res.data) ? res.data : []);
      if (!silent) {
        setTimeout(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
        }, 0);
      }
    } catch (error) {
      if (!silent) {
        console.error(error);
        toastApi?.error(t("chat.loadError"));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages(false);
    const timer = setInterval(() => {
      loadMessages(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const canSend = useMemo(() => draft.trim().length > 0 && !sending, [draft, sending]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await axios.post(API_BASE + "/chat/messages", { content });
      setMessages((prev) => [...prev, res.data]);
      setDraft("");
    } catch (error) {
      console.error(error);
      toastApi?.error(t("chat.sendError"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" mb={2}>
        {t("chat.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        {t("chat.subtitle")}
      </Typography>

      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Box
          ref={listRef}
          sx={{
            height: "55vh",
            minHeight: 300,
            overflowY: "auto",
            pr: 1,
            display: "flex",
            flexDirection: "column",
            gap: 1.25,
            mb: 2,
          }}
        >
          {!loading && messages.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("chat.empty")}
            </Typography>
          ) : (
            messages.map((item) => {
              const senderUsername = String(item.senderUsername || "").toLowerCase();
              const isMine = senderUsername && senderUsername === me;
              return (
                <Stack
                  key={item.id}
                  direction="row"
                  spacing={1}
                  sx={{
                    justifyContent: isMine ? "flex-end" : "flex-start",
                  }}
                >
                  {!isMine && (
                    <Avatar src={item.senderAvatarUrl || undefined} sx={{ width: 30, height: 30 }}>
                      {String(item.senderFullName || item.senderUsername || "U")
                        .slice(0, 1)
                        .toUpperCase()}
                    </Avatar>
                  )}
                  <Box
                    sx={{
                      maxWidth: "70%",
                      bgcolor: isMine ? "primary.main" : "grey.100",
                      color: isMine ? "#fff" : "text.primary",
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        color: isMine ? "rgba(255,255,255,0.9)" : "text.secondary",
                        mb: 0.5,
                      }}
                    >
                      {item.senderFullName || item.senderUsername || "-"}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {item.content}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        mt: 0.5,
                        textAlign: "right",
                        color: isMine ? "rgba(255,255,255,0.9)" : "text.secondary",
                      }}
                    >
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")
                        : "-"}
                    </Typography>
                  </Box>
                </Stack>
              );
            })
          )}
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={5}
            placeholder={t("chat.inputPlaceholder")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button variant="contained" disabled={!canSend} onClick={handleSend}>
            {sending ? t("chat.sending") : t("chat.send")}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
