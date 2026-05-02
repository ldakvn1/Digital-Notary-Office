import { useState } from "react";
import { API_BASE } from "./apiBase";
import axios from "axios";
import {
  Alert,
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { useI18n } from "./i18n";
import { getAuditActionLabel, getCaseTypeLabel, getStatusLabel } from "./utils/displayLabels";

export default function TrackCase({ initialCode = "" }) {
  const { language, t } = useI18n();
  const [code, setCode] = useState(initialCode);
  const [otp, setOtp] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const toStatusLabel = (status) => getStatusLabel(status, t);
  const toActionLabel = (action) => getAuditActionLabel(action, language);
  const toTypeLabel = (type) => getCaseTypeLabel(type, t);

  const doLookup = async () => {
    if (!code.trim() || !/^\d{4}$/.test(otp.trim())) {
      setError("Vui lòng nhập mã tra cứu và OTP 4 số cuối CCCD.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/public/track/${code.trim()}`, {
        otp: otp.trim(),
      });
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setResult(null);
      setError(err?.response?.data || "Không tra cứu được hồ sơ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <Paper sx={{ width: "100%", maxWidth: 720, p: 3, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700} mb={1}>
          Tra cứu hồ sơ công chứng
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Nhập mã tra cứu và OTP là 4 số cuối CCCD của khách hàng.
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
          <TextField
            label="Mã tra cứu"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            sx={{ minWidth: 260, flex: 1 }}
          />
          <TextField
            label="OTP (4 số cuối CCCD)"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
            sx={{ minWidth: 220 }}
          />
          <Button variant="contained" onClick={doLookup} disabled={loading}>
            {loading ? "Đang tra cứu..." : "Tra cứu"}
          </Button>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {result?.case && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography><b>Mã hồ sơ:</b> {result.case.caseId}</Typography>
            <Typography><b>Khách hàng:</b> {result.case.customerNameMasked}</Typography>
            <Typography><b>SĐT:</b> {result.case.phoneMasked || "-"}</Typography>
            <Typography><b>Loại giao dịch:</b> {toTypeLabel(result.case.type)}</Typography>
            <Typography><b>Trạng thái:</b> {toStatusLabel(result.case.status)}</Typography>
            <Typography>
              <b>Cập nhật gần nhất:</b>{" "}
              {result.case.updatedAt ? new Date(result.case.updatedAt).toLocaleString("vi-VN") : "-"}
            </Typography>
            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              Tiến trình hồ sơ
            </Typography>
            <List dense>
              {(result.timeline || []).map((item, index) => (
                <ListItem key={`${item.timestamp}-${index}`} disableGutters>
                  <ListItemText
                    primary={`${toActionLabel(item.action)}${
                      item.toStatus ? ` -> ${toStatusLabel(item.toStatus)}` : ""
                    }`}
                    secondary={new Date(item.timestamp).toLocaleString("vi-VN")}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
      </Paper>
    </Box>
  );
}
