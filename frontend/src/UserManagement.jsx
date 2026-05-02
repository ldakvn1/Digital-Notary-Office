import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./apiBase";
import {
  Box,
  Chip,
  FormControlLabel,
  Paper,
  Button,
  Switch,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Typography,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Tooltip,
  Avatar,
  IconButton,
  Menu,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { viVN } from "@mui/x-date-pickers/locales";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import axios from "axios";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";
import { downloadCsvFile, getExportTimestamp } from "./utils/csvExport";

export default function UserManagement({ currentUser }) {
  const { t, language } = useI18n();
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [isActive, setIsActive] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState({ open: false, username: "" });
  const [showLockedOnly, setShowLockedOnly] = useState(false);
  const [securityLogsOpen, setSecurityLogsOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState({ anchorEl: null, user: null });
  const [securityLogs, setSecurityLogs] = useState([]);
  const [auditScope, setAuditScope] = useState("all");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [userSort, setUserSort] = useState({ field: "username", direction: "asc" });
  const [securityLogSort, setSecurityLogSort] = useState({ field: "timestamp", direction: "desc" });
  const [userPage, setUserPage] = useState(0);
  const [userRowsPerPage, setUserRowsPerPage] = useState(10);
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const USER_SORT_LABELS = {
    username: t("users.username"),
    fullName: t("users.fullName"),
    role: t("users.role"),
    email: t("users.email"),
    passwordPolicy: t("users.passwordPolicy"),
    loginLock: t("users.loginLock"),
  };
  const SECURITY_LOG_SORT_LABELS = {
    timestamp: t("users.time"),
    action: t("users.action"),
    actor: t("users.actor"),
    caseId: t("users.case"),
    targetUsername: t("users.targetUser"),
    notes: t("users.notes"),
  };

  const ROLE_LABELS = {
    admin: t("roles.admin"),
    notary_officer: t("roles.notary_officer"),
    accountant: t("roles.accountant"),
    staff: t("roles.staff"),
    viewer: t("roles.viewer"),
  };

  const getPasswordStrength = (value) => {
    if (!value) {
      return { score: 0, label: t("users.empty"), color: "#9ca3af" };
    }

    let score = 0;
    if (value.length >= 8) score += 25;
    if (/[A-Z]/.test(value)) score += 20;
    if (/[a-z]/.test(value)) score += 20;
    if (/\d/.test(value)) score += 20;
    if (/[^A-Za-z0-9]/.test(value)) score += 15;

    if (score < 45) return { score, label: t("users.weak"), color: "#ef4444" };
    if (score < 75) return { score, label: t("users.medium"), color: "#f59e0b" };
    return { score, label: t("users.strong"), color: "#10b981" };
  };

  const passwordStrength = getPasswordStrength(password);
  const dayjsFromIsoDate = (value) => (value ? dayjs(value, "YYYY-MM-DD") : null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get(API_BASE + "/users");
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    const timerId = setTimeout(() => {
      fetchUsers();
    }, 0);
    return () => clearTimeout(timerId);
  }, [fetchUsers]);

  const resetForm = () => {
    setUsername("");
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("staff");
    setIsActive(true);
    setEditingUser(null);
    setAvatarUrl("");
    setFormError("");
  };
  const getAvatarFallback = (value) => {
    const text = String(value || "").trim();
    if (!text) return "U";
    return text.slice(0, 1).toUpperCase();
  };
  const renderUserStatusIcons = (userRow) => {
    const hasPasswordWarning = Boolean(userRow.mustChangePassword);
    const hasAccountWarning = Boolean(userRow.isLoginLocked || !userRow.isActive);
    const accountStatusTitle = userRow.isLoginLocked
      ? `${t("users.lockedLv")} ${userRow.loginLockLevel || 1}`
      : t("users.disabled");
    const passwordPolicyTitle = t("users.mustChangeFirstLogin");
    return (
      <Tooltip title={userRow.isActive ? t("users.active") : t("users.disabled")} arrow>
        <Box sx={{ position: "relative", width: 36, height: 36 }}>
          <Avatar
            src={userRow.avatarUrl || undefined}
            sx={{
              width: 36,
              height: 36,
              opacity: userRow.isActive ? 1 : 0.55,
              outline: "2px solid",
              outlineColor: userRow.isActive ? "success.main" : "grey.400",
            }}
          >
            {getAvatarFallback(userRow.fullName || userRow.username)}
          </Avatar>
        {hasPasswordWarning && (
          <Tooltip title={passwordPolicyTitle} arrow>
            <Box
              sx={{
                position: "absolute",
                right: -5,
                top: -4,
                width: 15,
                height: 15,
                borderRadius: "50%",
                bgcolor: "warning.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 0 2px #fff",
              }}
            >
              <ErrorOutlineOutlinedIcon sx={{ fontSize: 10, color: "#fff" }} />
            </Box>
          </Tooltip>
        )}
        {hasAccountWarning && (
          <Tooltip title={accountStatusTitle} arrow>
            <Box
              sx={{
                position: "absolute",
                right: -5,
                bottom: -4,
                width: 15,
                height: 15,
                borderRadius: "50%",
                bgcolor: userRow.isLoginLocked ? "error.main" : "grey.500",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 0 2px #fff",
              }}
            >
              {userRow.isLoginLocked ? (
                <LockOutlinedIcon sx={{ fontSize: 10, color: "#fff" }} />
              ) : (
                <BlockOutlinedIcon sx={{ fontSize: 10, color: "#fff" }} />
              )}
            </Box>
          </Tooltip>
        )}
        </Box>
      </Tooltip>
    );
  };
  const uploadAvatar = async (file) => {
    if (!file) return;
    try {
      setAvatarUploading(true);
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await axios.post(API_BASE + "/users/avatar-upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAvatarUrl(res.data?.avatarUrl || "");
      toastApi.success("Đã tải hình đại diện.");
    } catch (err) {
      console.error(err);
      toastApi.error("Không thể tải hình đại diện.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    setFormError("");
    const normalizedUsername = username.trim().toLowerCase();

    if (!normalizedUsername || !role) {
      setFormError("Vui lòng nhập các trường bắt buộc: Tài khoản và Vai trò.");
      return;
    }
    if (!String(fullName || "").trim()) {
      setFormError("Vui lòng nhập Họ và tên.");
      return;
    }

    if (normalizedUsername.length < 3) {
      setFormError("Username phải có ít nhất 3 ký tự.");
      return;
    }

    try {
      if (editingUser) {
        if (password && password.length < 8) {
          setFormError("Mật khẩu mới phải có ít nhất 8 ký tự.");
          return;
        }
        await axios.put(`${API_BASE}/users/${editingUser}`, {
          role,
          password: password || undefined,
          fullName: fullName || undefined,
          email: email || undefined,
          avatarUrl: avatarUrl || null,
          isActive,
        });
        toastApi.success(t("users.updateSuccess"));
      } else {
        if (!email.trim()) {
          setFormError("Vui lòng nhập email để gửi tài khoản.");
          return;
        }
        const createRes = await axios.post(API_BASE + "/users", {
          username: normalizedUsername,
          fullName: fullName || undefined,
          email: email.trim(),
          role,
          avatarUrl: avatarUrl || undefined,
        });
        const emailSent = Boolean(createRes.data?.emailSent);
        const temporaryPassword = createRes.data?.temporaryPassword;
        if (emailSent) {
          toastApi.success("Đã tạo user và gửi email thông tin đăng nhập.");
        } else {
          toastApi.warning(
            `Đã tạo user nhưng chưa gửi email (SMTP chưa cấu hình). Mật khẩu tạm: ${temporaryPassword}`
          );
        }
      }

      resetForm();
      fetchUsers();
    } catch (err) {
      console.error(err);
      const responseData = err.response?.data;
      if (responseData?.errors?.length) {
        const message = responseData.errors
          .map((item) => `${item.field}: ${item.message}`)
          .join("\n");
        setFormError(`Dữ liệu chưa hợp lệ: ${message}`);
        return;
      }
      if (err.response?.status === 409) {
        if (responseData?.code === "EMAIL_ALREADY_IN_USE") {
          setFormError("Email đã được dùng bởi tài khoản khác.");
        } else {
          setFormError(responseData?.message || "Username đã tồn tại. Vui lòng chọn username khác.");
        }
        return;
      }
      if (err.response?.status === 403) {
        setFormError("Bạn không có quyền tạo/cập nhật user.");
        return;
      }
      setFormError(responseData?.message || responseData || "Lỗi khi lưu user.");
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user.username);
    setUsername(user.username);
    setFullName(user.fullName || "");
    setEmail(user.email || "");
    setRole(user.role);
    setIsActive(user.isActive !== false);
    setAvatarUrl(user.avatarUrl || "");
    setPassword("");
  };

  const handleDelete = async (usernameToDelete) => {
    if (usernameToDelete === currentUser.username) {
      toastApi.warning(t("users.cannotDeleteSelf"));
      return;
    }
    setConfirmDelete({ open: true, username: usernameToDelete });
  };

  const confirmDeleteUser = async () => {
    const usernameToDelete = confirmDelete.username;
    setConfirmDelete({ open: false, username: "" });
    try {
      await axios.delete(`${API_BASE}/users/${usernameToDelete}`);
      fetchUsers();
      toastApi.success(t("users.deleteSuccess"));
    } catch (err) {
      console.error(err);
      const backendMessage =
        typeof err?.response?.data === "string"
          ? err.response.data
          : err?.response?.data?.message || "";
      toastApi.error(
        backendMessage
          ? `${t("users.deleteError")}: ${backendMessage}`
          : t("users.deleteError")
      );
    }
  };

  const handleUnlockLogin = async (usernameToUnlock) => {
    try {
      await axios.post(`${API_BASE}/users/${usernameToUnlock}/unlock-login`);
      toastApi.success("Đã mở khóa đăng nhập cho user.");
      fetchUsers();
    } catch (err) {
      console.error(err);
      toastApi.error("Không thể mở khóa đăng nhập.");
    }
  };

  const handleReissueInitialPassword = async (usernameTarget) => {
    try {
      const res = await axios.post(`${API_BASE}/users/${usernameTarget}/reissue-initial-password`);
      if (res.data?.emailSent) {
        toastApi.success("Đã cấp lại mật khẩu tạm và gửi email.");
      } else {
        toastApi.warning(
          `Đã cấp lại mật khẩu tạm nhưng chưa gửi email (SMTP). Mật khẩu tạm: ${res.data?.temporaryPassword}`
        );
      }
      fetchUsers();
    } catch (err) {
      console.error(err);
      toastApi.error(err.response?.data?.message || err.response?.data || "Không thể cấp lại mật khẩu tạm.");
    }
  };
  const handleReissueInitialPasswordNoEmail = async (usernameTarget) => {
    try {
      const res = await axios.post(
        `${API_BASE}/users/${usernameTarget}/reissue-initial-password-no-email`
      );
      toastApi.warning(
        `Đã cấp mật khẩu tạm cho user (không email). Mật khẩu tạm: ${res.data?.temporaryPassword}`
      );
      fetchUsers();
    } catch (err) {
      console.error(err);
      toastApi.error(
        err.response?.data?.message || err.response?.data || "Không thể cấp mật khẩu tạm không email."
      );
    }
  };

  const handleToggleUserActive = async (userRow) => {
    if (userRow.username === currentUser.username && userRow.isActive) {
      toastApi.warning("Không thể tự vô hiệu hóa tài khoản đang đăng nhập.");
      return;
    }
    try {
      await axios.put(`${API_BASE}/users/${userRow.username}`, {
        isActive: !userRow.isActive,
      });
      setUsers((prev) =>
        prev.map((item) =>
          item.username === userRow.username ? { ...item, isActive: !Boolean(userRow.isActive) } : item
        )
      );
      toastApi.success(!userRow.isActive ? "Đã kích hoạt tài khoản." : "Đã vô hiệu hóa tài khoản.");
      fetchUsers();
    } catch (err) {
      console.error(err);
      toastApi.error("Không thể cập nhật trạng thái tài khoản.");
    }
  };

  const visibleUsers = showLockedOnly ? users.filter((item) => item.isLoginLocked) : users;
  const getUserSortValue = (item, field) => {
    if (field === "fullName") return item.fullName || item.username || "";
    if (field === "role") return ROLE_LABELS[item.role] || item.role || "";
    if (field === "email") return item.email || "";
    if (field === "passwordPolicy")
      return `${item.isActive ? "1" : "0"}-${item.mustChangePassword ? "1" : "0"}`;
    if (field === "loginLock")
      return item.isLoginLocked
        ? `${item.loginLockLevel || 0}-${item.loginLockUntil || ""}`
        : "0";
    return item[field] || "";
  };
  const sortedVisibleUsers = visibleUsers.slice().sort((a, b) => {
    const aValue = getUserSortValue(a, userSort.field);
    const bValue = getUserSortValue(b, userSort.field);
    const compared = String(aValue).localeCompare(String(bValue), "vi", { sensitivity: "base" });
    return userSort.direction === "asc" ? compared : -compared;
  });
  const pagedVisibleUsers = sortedVisibleUsers.slice(
    userPage * userRowsPerPage,
    userPage * userRowsPerPage + userRowsPerPage
  );
  const quickExportUsers = () => {
    const dateLocale = language === "vi" ? "vi-VN" : "en-US";
    const headers = [
      t("users.username"),
      t("users.fullName"),
      t("users.role"),
      t("users.email"),
      t("users.passwordPolicy"),
      t("users.loginLock"),
    ];
    const rows = sortedVisibleUsers.map((userRow) => [
      userRow.username || "",
      userRow.fullName || "",
      ROLE_LABELS[userRow.role] || userRow.role || "",
      userRow.email || "",
      `${userRow.isActive ? t("users.active") : t("users.disabled")} | ${
        userRow.mustChangePassword ? t("users.mustChangeFirstLogin") : t("users.normalPassword")
      }`,
      userRow.isLoginLocked
        ? `${t("users.lockedLv")} ${userRow.loginLockLevel || 1} (${t("users.until")}: ${
            userRow.loginLockUntil ? new Date(userRow.loginLockUntil).toLocaleString(dateLocale) : "-"
          })`
        : t("users.normal"),
    ]);
    const filename =
      language === "vi"
        ? `DanhSachNguoiDung_Nhanh_${getExportTimestamp()}.csv`
        : `users_quick_view_${getExportTimestamp()}.csv`;
    downloadCsvFile(filename, headers, rows);
    toastApi.success(language === "vi" ? "Đã kết xuất nhanh danh sách người dùng." : "User quick export completed.");
  };
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sortedVisibleUsers.length / userRowsPerPage) - 1);
    if (userPage > maxPage) setUserPage(maxPage);
  }, [sortedVisibleUsers.length, userRowsPerPage, userPage]);
  const sortedSecurityLogs = securityLogs.slice().sort((a, b) => {
    if (securityLogSort.field === "timestamp") {
      const aValue = new Date(a.timestamp || 0).getTime();
      const bValue = new Date(b.timestamp || 0).getTime();
      return securityLogSort.direction === "asc" ? aValue - bValue : bValue - aValue;
    }
    const compared = String(a[securityLogSort.field] || "").localeCompare(
      String(b[securityLogSort.field] || ""),
      "vi",
      { sensitivity: "base" }
    );
    return securityLogSort.direction === "asc" ? compared : -compared;
  });
  const toggleUserSort = (field) => {
    setUserSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };
  const toggleSecurityLogSort = (field) => {
    setSecurityLogSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const loadSecurityLogs = async () => {
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("scope", auditScope);
      if (auditFrom) params.set("from", new Date(`${auditFrom}T00:00:00`).toISOString());
      if (auditTo) params.set("to", new Date(`${auditTo}T23:59:59`).toISOString());
      if (auditSearch.trim()) params.set("search", auditSearch.trim());
      const res = await axios.get(
        `${API_BASE}/admin/audit-logs?${params.toString()}`
      );
      setSecurityLogs(Array.isArray(res.data) ? res.data : []);
      setSecurityLogsOpen(true);
    } catch (err) {
      console.error(err);
      toastApi.error("Không thể tải security audit logs.");
    }
  };

  const exportAuditLogs = async (format) => {
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      params.set("scope", auditScope);
      if (auditFrom) params.set("from", new Date(`${auditFrom}T00:00:00`).toISOString());
      if (auditTo) params.set("to", new Date(`${auditTo}T23:59:59`).toISOString());
      if (auditSearch.trim()) params.set("search", auditSearch.trim());
      const res = await axios.get(
        `${API_BASE}/admin/audit-logs/export?${params.toString()}`,
        { responseType: "blob" }
      );
      const hash = res.headers["x-content-sha256"];
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      const fileName = `audit_logs_${auditScope}.${format}`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      const manifestPayload = {
        exportedAt: new Date().toISOString(),
        reportType: "audit_logs",
        fileName,
        contentSha256: hash || "",
        source: "/admin/audit-logs/export",
        filters: {
          scope: auditScope,
          from: auditFrom || null,
          to: auditTo || null,
          search: auditSearch.trim() || null,
          format,
        },
      };
      const manifestBlob = new Blob([JSON.stringify(manifestPayload, null, 2)], {
        type: "application/json;charset=utf-8;",
      });
      const manifestUrl = URL.createObjectURL(manifestBlob);
      const manifestLink = document.createElement("a");
      manifestLink.href = manifestUrl;
      manifestLink.download = `manifest.${fileName}.json`;
      document.body.appendChild(manifestLink);
      manifestLink.click();
      document.body.removeChild(manifestLink);
      URL.revokeObjectURL(manifestUrl);
      toastApi.success(
        hash
          ? `Đã export audit logs ${format.toUpperCase()}. SHA-256: ${hash}`
          : `Đã export audit logs ${format.toUpperCase()}.`
      );
    } catch (err) {
      console.error(err);
      toastApi.error(`Không thể export audit logs ${format.toUpperCase()}.`);
    }
  };
  const openActionMenu = (event, userRow) => {
    setActionMenu({ anchorEl: event.currentTarget, user: userRow });
  };
  const closeActionMenu = () => {
    setActionMenu({ anchorEl: null, user: null });
  };

  return (
    <Box>
      <Typography variant="h5" mb={3}>
        {t("users.title")}
      </Typography>

      <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
        <Typography variant="subtitle1" mb={2}>
          {editingUser ? t("users.updateUser") : t("users.createNew")}
        </Typography>
        {formError && (
          <Typography variant="body2" color="error" sx={{ mb: 1.5 }}>
            {formError}
          </Typography>
        )}

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 220 }}>
            <Avatar src={avatarUrl || undefined} sx={{ width: 48, height: 48 }}>
              {getAvatarFallback(fullName || username)}
            </Avatar>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Button variant="outlined" size="small" component="label" disabled={avatarUploading}>
                {avatarUploading ? "Đang tải..." : "Tải hình đại diện"}
                <input
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => uploadAvatar(e.target.files?.[0] || null)}
                />
              </Button>
              {avatarUrl && (
                <Button size="small" color="inherit" onClick={() => setAvatarUrl("")}>
                  Dùng hình đại diện mặc định
                </Button>
              )}
            </Box>
          </Box>
          <TextField
            label={t("users.username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!!editingUser}
            required
            sx={{ minWidth: 180 }}
          />
          <TextField
            label={t("users.fullName")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            sx={{ minWidth: 220 }}
          />
          <TextField
            label={t("users.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required={!editingUser}
            sx={{ minWidth: 220 }}
          />

          {editingUser && (
            <>
              <TextField
                label={t("users.password")}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                helperText={t("users.passwordHintEdit")}
                sx={{ minWidth: 180 }}
              />
              <Box sx={{ minWidth: 200, flex: 1 }}>
                <Typography variant="caption" sx={{ color: passwordStrength.color }}>
                  {t("users.strength")}: {passwordStrength.label}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={passwordStrength.score}
                  sx={{
                    mt: 0.5,
                    height: 8,
                    borderRadius: 5,
                    bgcolor: "#e5e7eb",
                    "& .MuiLinearProgress-bar": {
                      backgroundColor: passwordStrength.color,
                    },
                  }}
                />
              </Box>
            </>
          )}

          <FormControl sx={{ minWidth: 180 }} required>
            <InputLabel required>{t("users.role")}</InputLabel>
            <Select
              value={role}
              label={t("users.role")}
              onChange={(e) => setRole(e.target.value)}
            >
              <MenuItem value="admin">{ROLE_LABELS.admin}</MenuItem>
              <MenuItem value="notary_officer">{ROLE_LABELS.notary_officer}</MenuItem>
              <MenuItem value="accountant">{ROLE_LABELS.accountant}</MenuItem>
              <MenuItem value="staff">{ROLE_LABELS.staff}</MenuItem>
              <MenuItem value="viewer">{ROLE_LABELS.viewer}</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={!editingUser}
              />
            }
            label={t("users.active")}
          />

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Button variant="contained" onClick={handleSave}>
              {editingUser ? t("common.update") : t("users.addUser")}
            </Button>
            {editingUser && (
              <Button variant="outlined" onClick={resetForm}>
                {t("common.cancel")}
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="subtitle1" mb={2}>
          {t("users.userList")}
        </Typography>
        <LocalizationProvider
          dateAdapter={AdapterDayjs}
          adapterLocale={language === "vi" ? "vi" : "en"}
          localeText={language === "vi" ? viVN.components.MuiLocalizationProvider.defaultProps.localeText : undefined}
        >
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "flex-start", mb: 1 }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <Select value={auditScope} displayEmpty onChange={(e) => setAuditScope(e.target.value)}>
                <MenuItem value="all">{t("users.auditScopeAll")}</MenuItem>
                <MenuItem value="case">{t("users.auditScopeCase")}</MenuItem>
                <MenuItem value="user">{t("users.auditScopeUser")}</MenuItem>
              </Select>
            </FormControl>
            <DatePicker
              format="DD/MM/YYYY"
              value={dayjsFromIsoDate(auditFrom)}
              onChange={(value) => setAuditFrom(value && value.isValid() ? value.format("YYYY-MM-DD") : "")}
              slotProps={{
                textField: { size: "small", sx: { minWidth: 170 }, placeholder: t("users.from") },
              }}
            />
            <DatePicker
              format="DD/MM/YYYY"
              value={dayjsFromIsoDate(auditTo)}
              onChange={(value) => setAuditTo(value && value.isValid() ? value.format("YYYY-MM-DD") : "")}
              slotProps={{
                textField: { size: "small", sx: { minWidth: 170 }, placeholder: t("users.to") },
              }}
            />
            <TextField
              size="small"
              placeholder={t("users.searchNotesDetails")}
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              sx={{ minWidth: 220 }}
            />
            <Button variant="outlined" onClick={loadSecurityLogs}>
              {t("users.viewSecurityAuditLogs")}
            </Button>
            <Button variant="outlined" onClick={() => exportAuditLogs("csv")}>
              {t("users.exportCsv")}
            </Button>
            <Button variant="outlined" onClick={() => exportAuditLogs("pdf")}>
              {t("users.exportPdf")}
            </Button>
            <Button variant="contained" onClick={quickExportUsers}>
              {t("common.quickExportCsv")}
            </Button>
            <FormControlLabel
              control={
                <Switch
                  checked={showLockedOnly}
                  onChange={(e) => setShowLockedOnly(e.target.checked)}
                />
              }
              label={t("users.lockedOnly")}
            />
          </Box>
          {(auditScope !== "all" || auditFrom || auditTo || auditSearch.trim()) && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
              {auditScope !== "all" && (
                <Chip
                  size="small"
                  color="primary"
                  label={`${t("users.auditScope")}: ${
                    auditScope === "case"
                      ? t("users.auditScopeCase")
                      : auditScope === "user"
                        ? t("users.auditScopeUser")
                        : t("users.auditScopeAll")
                  }`}
                  onDelete={() => setAuditScope("all")}
                />
              )}
              {auditFrom && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${t("users.from")}: ${auditFrom}`}
                  onDelete={() => setAuditFrom("")}
                />
              )}
              {auditTo && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${t("users.to")}: ${auditTo}`}
                  onDelete={() => setAuditTo("")}
                />
              )}
              {auditSearch.trim() && (
                <Chip
                  size="small"
                  color="primary"
                  label={`${t("common.search")}: ${auditSearch.trim()}`}
                  onDelete={() => setAuditSearch("")}
                />
              )}
            </Box>
          )}
        </LocalizationProvider>
        {(showLockedOnly || userSort.field !== "username" || userSort.direction !== "asc") && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
            {showLockedOnly && (
              <Chip
                size="small"
                color="warning"
                label={t("users.lockedOnly")}
                onDelete={() => setShowLockedOnly(false)}
              />
            )}
            {(userSort.field !== "username" || userSort.direction !== "asc") && (
              <Chip
                size="small"
                variant="outlined"
                label={`Sắp xếp: ${USER_SORT_LABELS[userSort.field]} (${userSort.direction === "asc" ? "tăng dần" : "giảm dần"})`}
                onDelete={() => setUserSort({ field: "username", direction: "asc" })}
              />
            )}
          </Box>
        )}

        <TableContainer sx={{ maxHeight: 560 }}>
          <Tooltip
            arrow
            title={`Đang sắp xếp theo "${USER_SORT_LABELS[userSort.field]}": ${
              userSort.direction === "asc" ? "tăng dần" : "giảm dần"
            }`}
          >
            <Typography variant="caption" color="text.secondary" sx={{ px: 1, pt: 0.5, display: "block" }}>
              ↕ Sắp xếp: {USER_SORT_LABELS[userSort.field]} ({userSort.direction === "asc" ? "A→Z" : "Z→A"})
            </Typography>
          </Tooltip>
          <Table stickyHeader>
            <TableHead sx={{ bgcolor: "#f8fafc" }}>
              <TableRow>
                <TableCell>Hình đại diện</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={userSort.field === "username"}
                    direction={userSort.field === "username" ? userSort.direction : "asc"}
                    onClick={() => toggleUserSort("username")}
                  >
                    {t("users.username")}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={userSort.field === "fullName"}
                    direction={userSort.field === "fullName" ? userSort.direction : "asc"}
                    onClick={() => toggleUserSort("fullName")}
                  >
                    {t("users.fullName")}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={userSort.field === "role"}
                    direction={userSort.field === "role" ? userSort.direction : "asc"}
                    onClick={() => toggleUserSort("role")}
                  >
                    {t("users.role")}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={userSort.field === "email"}
                    direction={userSort.field === "email" ? userSort.direction : "asc"}
                    onClick={() => toggleUserSort("email")}
                  >
                    {t("users.email")}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">{t("users.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedVisibleUsers.map((userRow) => (
                <TableRow key={userRow.username} hover>
                  <TableCell>
                    {renderUserStatusIcons(userRow)}
                  </TableCell>
                  <TableCell>{userRow.username}</TableCell>
                  <TableCell>{userRow.fullName || "-"}</TableCell>
                  <TableCell>{ROLE_LABELS[userRow.role] || userRow.role}</TableCell>
                  <TableCell>{userRow.email || "-"}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={(event) => openActionMenu(event, userRow)}>
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Menu
            anchorEl={actionMenu.anchorEl}
            open={Boolean(actionMenu.anchorEl)}
            onClose={closeActionMenu}
          >
            <MenuItem
              onClick={() => {
                handleEdit(actionMenu.user);
                closeActionMenu();
              }}
            >
              <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("common.edit")}</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                handleDelete(actionMenu.user.username);
                closeActionMenu();
              }}
            >
              <ListItemIcon><DeleteOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("common.delete")}</ListItemText>
            </MenuItem>
            <MenuItem
              disabled={!actionMenu.user?.isLoginLocked}
              onClick={() => {
                handleUnlockLogin(actionMenu.user.username);
                closeActionMenu();
              }}
            >
              <ListItemIcon><LockOpenOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("users.unlockLogin")}</ListItemText>
            </MenuItem>
            <MenuItem
              disabled={!actionMenu.user?.email}
              onClick={() => {
                handleReissueInitialPassword(actionMenu.user.username);
                closeActionMenu();
              }}
            >
              <ListItemIcon><KeyOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("users.reissuePassword")}</ListItemText>
            </MenuItem>
            <MenuItem
              disabled={Boolean(actionMenu.user?.email)}
              onClick={() => {
                handleReissueInitialPasswordNoEmail(actionMenu.user.username);
                closeActionMenu();
              }}
            >
              <ListItemIcon><VpnKeyOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t("users.reissuePasswordNoEmail")}</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => {
                handleToggleUserActive(actionMenu.user);
                closeActionMenu();
              }}
            >
              <ListItemIcon>
                {actionMenu.user?.isActive ? (
                  <BlockOutlinedIcon fontSize="small" />
                ) : (
                  <CheckCircleOutlinedIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>{actionMenu.user?.isActive ? t("users.disable") : t("users.enable")}</ListItemText>
            </MenuItem>
          </Menu>
        </TableContainer>
        <TablePagination
          component="div"
          count={sortedVisibleUsers.length}
          page={userPage}
          onPageChange={(_event, nextPage) => setUserPage(nextPage)}
          rowsPerPage={userRowsPerPage}
          onRowsPerPageChange={(event) => {
            setUserRowsPerPage(Number(event.target.value) || 10);
            setUserPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage={t("common.rowsPerPage")}
          labelDisplayedRows={({ from, to, count }) =>
            t("common.paginationDisplayedRows", { from, to, count })
          }
        />
      </Paper>
      <Dialog open={confirmDelete.open} onClose={() => setConfirmDelete({ open: false, username: "" })}>
        <DialogTitle>{t("users.confirmDeleteTitle")}</DialogTitle>
        <DialogContent>
          {t("users.confirmDeleteText", { username: confirmDelete.username })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete({ open: false, username: "" })}>{t("common.cancel")}</Button>
          <Button color="error" variant="contained" onClick={confirmDeleteUser}>{t("common.delete")}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={securityLogsOpen} onClose={() => setSecurityLogsOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{t("users.securityAuditLogsTitle")}</DialogTitle>
        <DialogContent>
          <TableContainer>
            <Tooltip
              arrow
              title={`Đang sắp xếp theo "${SECURITY_LOG_SORT_LABELS[securityLogSort.field]}": ${
                securityLogSort.direction === "asc" ? "tăng dần" : "giảm dần"
              }`}
            >
              <Typography variant="caption" color="text.secondary" sx={{ px: 1, pt: 0.5, display: "block" }}>
                ↕ Sắp xếp: {SECURITY_LOG_SORT_LABELS[securityLogSort.field]} (
                {securityLogSort.direction === "asc" ? "A→Z" : "Z→A"})
              </Typography>
            </Tooltip>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={securityLogSort.field === "timestamp"}
                      direction={securityLogSort.field === "timestamp" ? securityLogSort.direction : "asc"}
                      onClick={() => toggleSecurityLogSort("timestamp")}
                    >
                      {t("users.time")}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={securityLogSort.field === "action"}
                      direction={securityLogSort.field === "action" ? securityLogSort.direction : "asc"}
                      onClick={() => toggleSecurityLogSort("action")}
                    >
                      {t("users.action")}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={securityLogSort.field === "actor"}
                      direction={securityLogSort.field === "actor" ? securityLogSort.direction : "asc"}
                      onClick={() => toggleSecurityLogSort("actor")}
                    >
                      {t("users.actor")}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={securityLogSort.field === "caseId"}
                      direction={securityLogSort.field === "caseId" ? securityLogSort.direction : "asc"}
                      onClick={() => toggleSecurityLogSort("caseId")}
                    >
                      {t("users.case")}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={securityLogSort.field === "targetUsername"}
                      direction={securityLogSort.field === "targetUsername" ? securityLogSort.direction : "asc"}
                      onClick={() => toggleSecurityLogSort("targetUsername")}
                    >
                      {t("users.targetUser")}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={securityLogSort.field === "notes"}
                      direction={securityLogSort.field === "notes" ? securityLogSort.direction : "asc"}
                      onClick={() => toggleSecurityLogSort("notes")}
                    >
                      {t("users.notes")}
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedSecurityLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>{log.actor}</TableCell>
                    <TableCell>{log.caseId || "-"}</TableCell>
                    <TableCell>{log.targetUsername || "-"}</TableCell>
                    <TableCell>{log.notes || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSecurityLogsOpen(false)}>{t("common.close")}</Button>
        </DialogActions>
      </Dialog>
      <ToastHost toast={toast} onClose={closeToast} />
    </Box>
  );
}
