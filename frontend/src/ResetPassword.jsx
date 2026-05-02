import { useState } from "react";
import axios from "axios";
import { Box, Button, LinearProgress, Paper, TextField, Tooltip, Typography } from "@mui/material";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";
import { evaluatePasswordPolicy } from "./utils/passwordPolicy";

export default function ResetPassword({ token = "" }) {
  const { t } = useI18n();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const passwordPolicy = evaluatePasswordPolicy(newPassword);
  const strengthLabel =
    passwordPolicy.score < 40 ? t("common.weak") : passwordPolicy.score < 80 ? t("common.medium") : t("common.strong");

  const submitReset = async () => {
    if (!token) {
      toastApi.error(t("resetPassword.missingToken"));
      return;
    }
    if (!passwordPolicy.isValid) {
      toastApi.warning(t("common.passwordRuleHint"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toastApi.warning(t("resetPassword.confirmPasswordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post("http://localhost:4000/auth/reset-password", {
        token,
        newPassword,
      });
      toastApi.success(res.data?.message || t("resetPassword.success"));
    } catch (err) {
      if (err.response?.data?.code === "WEAK_PASSWORD") {
        toastApi.error(t("common.passwordRuleHint"));
        return;
      }
      toastApi.error(err.response?.data?.message || err.response?.data || t("resetPassword.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg,#e0ecff 0%,#f3f6fb 45%,#f5f3ff 100%)",
        p: 2,
      }}
    >
      <Paper sx={{ p: 4, width: 420, borderRadius: 4 }}>
        <Typography variant="h5" mb={1}>
          {t("resetPassword.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {t("resetPassword.description")}
        </Typography>
        <TextField
          fullWidth
          type="password"
          label={t("resetPassword.newPassword")}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
          sx={{ mb: 2 }}
        />
        <Tooltip
          arrow
          title={`${t("common.passwordRuleMinLength")}; ${t("common.passwordRuleLowercase")}; ${t("common.passwordRuleUppercase")}; ${t("common.passwordRuleNumber")}; ${t("common.passwordRuleSpecial")}`}
        >
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {t("common.passwordStrength")}: {strengthLabel} ({passwordPolicy.score}%)
            </Typography>
            <LinearProgress variant="determinate" value={passwordPolicy.score} sx={{ mt: 0.5, height: 8, borderRadius: 5 }} />
          </Box>
        </Tooltip>
        <TextField
          fullWidth
          type="password"
          label={t("resetPassword.confirmNewPassword")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          sx={{ mb: 2 }}
        />
        <Button fullWidth variant="contained" onClick={submitReset} disabled={loading}>
          {loading ? t("resetPassword.submitting") : t("resetPassword.submit")}
        </Button>
      </Paper>
      <ToastHost toast={toast} onClose={closeToast} />
    </Box>
  );
}
