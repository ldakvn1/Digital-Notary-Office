import { useEffect, useState } from "react";
import { API_BASE } from "./apiBase";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Divider,
  Grid,
  Chip,
  Avatar,
  Tooltip,
  LinearProgress,
} from "@mui/material";
import axios from "axios";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";
import { getCaseTypeLabel, getStatusLabel } from "./utils/displayLabels";
import { evaluatePasswordPolicy } from "./utils/passwordPolicy";

export default function ProfileManagement({ user, onUserUpdated, onRequireRelogin }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState({
    fullName: "",
    email: "",
    phone: "",
    avatarUrl: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const passwordPolicy = evaluatePasswordPolicy(passwordForm.newPassword);
  const strengthLabel =
    passwordPolicy.score < 40 ? t("common.weak") : passwordPolicy.score < 80 ? t("common.medium") : t("common.strong");

  const fetchProfile = async () => {
    try {
      const res = await axios.get(API_BASE + "/me");
      const nextProfile = {
        fullName: res.data.fullName || "",
        email: res.data.email || "",
        phone: res.data.phone || "",
        avatarUrl: res.data.avatarUrl || "",
      };
      setProfile(nextProfile);
      onUserUpdated?.({ ...user, ...nextProfile });
    } catch (error) {
      console.error("fetchProfile failed", error);
    }
  };

  const fetchReport = async () => {
    try {
      const res = await axios.get(API_BASE + "/me/report");
      setReport(res.data);
    } catch (error) {
      console.error("fetchReport failed", error);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchReport();
  }, []);

  const saveProfile = async () => {
    setLoading(true);
    try {
      const payload = {
        ...profile,
        avatarUrl: profile.avatarUrl ? profile.avatarUrl : null,
      };
      const res = await axios.put(API_BASE + "/me", payload);
      onUserUpdated?.({
        ...user,
        fullName: res.data.fullName || "",
        email: res.data.email || "",
        phone: res.data.phone || "",
        avatarUrl: res.data.avatarUrl || "",
      });
      toastApi.success(t("profile.saveProfile"));
    } catch (error) {
      toastApi.error(error.response?.data?.message || error.response?.data || "Cap nhat that bai");
    } finally {
      setLoading(false);
    }
  };
  const uploadAvatar = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await axios.post(API_BASE + "/me/avatar-upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const nextAvatarUrl = res.data?.avatarUrl || "";
      setProfile((prev) => ({ ...prev, avatarUrl: nextAvatarUrl }));
      onUserUpdated?.({ ...user, avatarUrl: nextAvatarUrl });
      toastApi.success(t("profile.uploadAvatarSuccess"));
    } catch (error) {
      console.error(error);
      toastApi.error(t("profile.uploadAvatarError"));
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toastApi.warning(t("profile.changePassword"));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toastApi.warning(t("profile.confirmPassword"));
      return;
    }
    if (!passwordPolicy.isValid) {
      toastApi.warning(t("common.passwordRuleHint"));
      return;
    }

    setLoading(true);
    try {
      await axios.put(API_BASE + "/me/password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toastApi.success(t("profile.changePasswordBtn"));
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => onRequireRelogin?.(), 1200);
    } catch (error) {
      if (error.response?.data?.code === "WEAK_PASSWORD") {
        toastApi.error(t("common.passwordRuleHint"));
        return;
      }
      toastApi.error(error.response?.data?.message || error.response?.data || t("profile.changePasswordFailed"));
    } finally {
      setLoading(false);
    }
  };

  const visibleToast =
    toast?.message === t("profile.accountInfo") || toast?.message === "Thông tin tài khoản" || toast?.message === "Account information"
      ? null
      : toast;

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" mb={2}>{t("profile.accountInfo")}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
          <Avatar src={profile.avatarUrl || undefined} sx={{ width: 52, height: 52 }}>
            {String(profile.fullName || user?.username || "U").slice(0, 1).toUpperCase()}
          </Avatar>
          <Button variant="outlined" component="label" size="small" disabled={loading}>
            {t("profile.uploadAvatar")}
            <input
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => uploadAvatar(e.target.files?.[0] || null)}
            />
          </Button>
          {profile.avatarUrl && (
            <Button
              size="small"
              onClick={() => setProfile((prev) => ({ ...prev, avatarUrl: "" }))}
            >
              {t("profile.useDefaultAvatar")}
            </Button>
          )}
          <TextField
            sx={{ minWidth: 220 }}
            label={t("profile.username")}
            value={user?.username || ""}
            disabled
          />
          <TextField
            sx={{ minWidth: 220 }}
            label={t("profile.roleLabel")}
            value={user?.role ? t(`roles.${user.role}`) : ""}
            disabled
          />
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label={t("profile.fullName")}
              value={profile.fullName}
              onChange={(e) => setProfile((prev) => ({ ...prev, fullName: e.target.value }))}
              required
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label={t("profile.phone")}
              value={profile.phone}
              onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Email"
              value={profile.email}
              onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
            />
          </Grid>
        </Grid>
        <Button sx={{ mt: 2 }} variant="contained" onClick={saveProfile} disabled={loading}>
          {t("profile.saveProfile")}
        </Button>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" mb={2}>{t("profile.changePassword")}</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              type="password"
              label={t("profile.currentPassword")}
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              required
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              type="password"
              label={t("profile.newPassword")}
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              autoComplete="new-password"
              required
            />
            <Tooltip
              arrow
              title={`${t("common.passwordRuleMinLength")}; ${t("common.passwordRuleLowercase")}; ${t("common.passwordRuleUppercase")}; ${t("common.passwordRuleNumber")}; ${t("common.passwordRuleSpecial")}`}
            >
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t("common.passwordStrength")}: {strengthLabel} ({passwordPolicy.score}%)
                </Typography>
                <LinearProgress variant="determinate" value={passwordPolicy.score} sx={{ mt: 0.5, height: 8, borderRadius: 5 }} />
              </Box>
            </Tooltip>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              type="password"
              label={t("profile.confirmPassword")}
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              autoComplete="new-password"
              required
            />
          </Grid>
        </Grid>
        <Button sx={{ mt: 2 }} color="warning" variant="contained" onClick={changePassword} disabled={loading}>
          {t("profile.changePasswordBtn")}
        </Button>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" mb={2}>{t("profile.reportTitle")}</Typography>
        {!report ? (
          <Typography color="text.secondary">{t("profile.reportLoading")}</Typography>
        ) : (
          <>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Chip label={`${t("profile.assignedTotal")}: ${report.kpi.totalAssigned}`} />
              <Chip color="primary" label={`${t("profile.processing")}: ${report.kpi.openCases}`} />
              <Chip color="success" label={`${t("profile.completed")}: ${report.kpi.closedCases}`} />
              <Chip color="error" label={`${t("profile.overdue")}: ${report.kpi.overdueCases}`} />
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle2" mb={1}>{t("profile.latest10")}</Typography>
            <Box sx={{ display: "grid", gap: 1 }}>
              {(report.recentCases || []).map((item) => (
                <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {item.caseId} - {item.customerName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t("app.caseStatuses")}: {getStatusLabel(item.status, t)} | {t("app.type")}:{" "}
                    {getCaseTypeLabel(item.type, t)}
                  </Typography>
                </Paper>
              ))}
              {(report.recentCases || []).length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  {t("profile.noAssigned")}
                </Typography>
              )}
            </Box>
          </>
        )}
      </Paper>
      <ToastHost toast={visibleToast} onClose={closeToast} />
    </Box>
  );
}
