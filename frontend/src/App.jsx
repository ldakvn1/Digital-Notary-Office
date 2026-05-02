import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Button,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Box,
  Paper,
  Typography,
  LinearProgress,
  Chip,
  Badge,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
  Tabs,
  Tab,
  Tooltip,
  Checkbox,
  TableSortLabel,
  TablePagination,
  Avatar,
  Menu,
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import Login from "./Login";
import CreateCaseDialog from "./CreateCaseDialog";
import CaseDetailModal from "./CaseDetailModal";
import UserManagement from "./UserManagement";
import CustomerManagement from "./CustomerManagement";
import ProfileManagement from "./ProfileManagement";
import TemplateManagement from "./TemplateManagement";
import TranslatorManagement from "./TranslatorManagement";
import ReceiptManagement from "./ReceiptManagement";
import DirectChatWidget from "./DirectChatWidget";
import TrackCase from "./TrackCase";
import ResetPassword from "./ResetPassword";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";
import { getCaseTypeLabel, getStatusLabel } from "./utils/displayLabels";
import notaryLogo from "./assets/notary-logo.svg";

function getDefaultViewByRole(role) {
  const roleKey = normalizeRoleKey(role);
  if (roleKey === "admin") return "dashboard";
  if (roleKey === "notary_officer") return "dashboard";
  if (roleKey === "staff") return "profile";
  if (roleKey === "viewer") return "dashboard";
  return "dashboard";
}
function normalizeRoleKey(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "quản trị viên" || normalized === "quan tri vien") return "admin";
  if (
    normalized === "notary_officer" ||
    normalized === "công chứng viên" ||
    normalized === "cong chung vien"
  ) {
    return "notary_officer";
  }
  if (normalized === "staff" || normalized === "nhân viên" || normalized === "nhan vien") return "staff";
  if (normalized === "accountant" || normalized === "kế toán viên" || normalized === "ke toan vien") {
    return "accountant";
  }
  if (normalized === "viewer" || normalized === "người xem" || normalized === "nguoi xem") return "viewer";
  return normalized;
}
function getAllowedViewsByRole(role) {
  const roleKey = normalizeRoleKey(role);
  const base = ["dashboard", "cases", "customers", "profile"];
  if (roleKey === "admin") return [...base, "receipts", "templates", "translators", "users"];
  if (roleKey === "accountant") return [...base, "receipts", "templates"];
  if (roleKey === "notary_officer") return [...base, "templates"];
  if (roleKey === "staff") return ["profile", "templates"];
  if (roleKey === "viewer") return ["dashboard", "templates"];
  return ["dashboard"];
}

export default function App() {
  const { t, language, setLanguage } = useI18n();
  const DEFAULT_TABLE_FILTERS = {
    caseId: "",
    customerName: "",
    phone: "",
    type: "",
    status: "",
    assignedTo: "",
    deadline: "",
    description: "",
    notes: "",
    feeStatus: "",
    feeAmount: "",
    feePaid: "",
    updatedAt: "",
  };
  const [cases, setCases] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [feeStatusFilter, setFeeStatusFilter] = useState("ALL");
  const [detailedStatusFilters, setDetailedStatusFilters] = useState([]);
  const [sidebarHidden, setSidebarHidden] = useState(
    () => localStorage.getItem("sidebar_hidden") === "1"
  );
  const [casePage, setCasePage] = useState(0);
  const [caseRowsPerPage, setCaseRowsPerPage] = useState(25);
  const [focusedCustomerId, setFocusedCustomerId] = useState(null);
  const [focusedReceiptCaseId, setFocusedReceiptCaseId] = useState(null);
  const [caseCustomerFilterId, setCaseCustomerFilterId] = useState(null);
  const [createCaseDialogOpen, setCreateCaseDialogOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem("token")
  );
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [view, setView] = useState(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return "dashboard";
    try {
      const parsed = JSON.parse(stored);
      const defaultView = getDefaultViewByRole(parsed?.role);
      const savedView = localStorage.getItem("app_view");
      const allowedViews = getAllowedViewsByRole(parsed?.role);
      return savedView && allowedViews.includes(savedView) ? savedView : defaultView;
    } catch {
      return "dashboard";
    }
  });
  const [loading, setLoading] = useState(false);
  const publicTrackCode = (() => {
    const path = window.location.pathname || "";
    if (!path.startsWith("/track/")) return "";
    return decodeURIComponent(path.replace("/track/", "")).trim();
  })();
  const resetPasswordToken = (() => {
    const path = window.location.pathname || "";
    if (path !== "/reset-password") return "";
    const params = new URLSearchParams(window.location.search || "");
    return params.get("token") || "";
  })();
  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardTab, setDashboardTab] = useState("dashboard");
  const [notifications, setNotifications] = useState([]);
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [batchAssignee, setBatchAssignee] = useState("");
  const [selectedBatchCaseIds, setSelectedBatchCaseIds] = useState([]);
  const [tableFilters, setTableFilters] = useState(DEFAULT_TABLE_FILTERS);
  const [caseSort, setCaseSort] = useState({ field: "updatedAt", direction: "desc" });
  const [dashboardCustomerSort, setDashboardCustomerSort] = useState({
    field: "linkedCases",
    direction: "desc",
  });
  const [accountMenuAnchor, setAccountMenuAnchor] = useState(null);
  const CASE_SORT_LABELS = {
    caseId: "Mã hồ sơ",
    customerName: t("app.customerName"),
    phone: t("app.phone"),
    type: t("app.type"),
    status: t("status.RECEIVED").includes("Received") ? "Status" : "Trạng thái",
    assignedTo: t("caseDetail.assignedTo"),
    deadline: t("caseDetail.deadline"),
    description: t("app.description"),
    notes: t("app.notes"),
    feeAmount: t("app.totalFeeAmount"),
    feePaid: t("app.totalFeePaid"),
    updatedAt: t("profile.latest10").includes("Latest") ? "Last updated" : "Cập nhật gần nhất",
  };
  const FEE_STATUS = {
    UNPAID: "UNPAID",
    PARTIAL: "PARTIAL",
    PAID_FULL: "PAID_FULL",
  };
  const PAYMENT_METHOD = {
    CASH: "CASH",
    BANK_TRANSFER: "BANK_TRANSFER",
  };
  const DASHBOARD_CUSTOMER_SORT_LABELS = {
    customerId: t("customers.customerCode"),
    fullName: t("customers.fullName"),
    phone: t("customers.phone"),
    email: t("customers.email"),
    linkedCases: t("app.linkedCases"),
  };
  const [confirmStatusChange, setConfirmStatusChange] = useState({
    open: false,
    id: null,
    nextStatus: "",
    notes: "",
  });
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const normalizedUserRole = normalizeRoleKey(user?.role);
  const isAdminUser = normalizedUserRole === "admin";

  const applyAccessToken = (accessToken) => {
    if (accessToken) {
      axios.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    } else {
      delete axios.defaults.headers.common.Authorization;
    }
  };

  // 👉 modal state
  const [selectedCase, setSelectedCase] = useState(null);
  const [openModal, setOpenModal] = useState(false);

  // 👉 workflow constants
  const WORKFLOW_STATUS = {
    RECEIVED: 'RECEIVED',
    RECEIPT: 'RECEIPT',
    LEGAL_CHECKING: 'LEGAL_CHECKING',
    DRAFTING: 'DRAFTING',
    REVIEWING: 'REVIEWING',
    APPROVED: 'APPROVED',
    NOTARIZED: 'NOTARIZED',
    DEBT: 'DEBT',
    ARCHIVED: 'ARCHIVED',
    CANCELLED: 'CANCELLED',
  };

  const WORKFLOW_STATUS_LABELS = {
    RECEIVED: t("status.RECEIVED"),
    RECEIPT: t("status.RECEIPT"),
    LEGAL_CHECKING: t("status.LEGAL_CHECKING"),
    DRAFTING: t("status.DRAFTING"),
    REVIEWING: t("status.REVIEWING"),
    APPROVED: t("status.APPROVED"),
    NOTARIZED: t("status.NOTARIZED"),
    DEBT: t("status.DEBT"),
    ARCHIVED: t("status.ARCHIVED"),
    CANCELLED: t("status.CANCELLED"),
  };
  const statusText = (status) => getStatusLabel(status, t);
  const caseTypeText = (type) => getCaseTypeLabel(type, t);

  const STATUS_COLORS = {
    RECEIVED: '#2196f3',
    RECEIPT: '#0ea5e9',
    LEGAL_CHECKING: '#ff9800',
    DRAFTING: '#9c27b0',
    REVIEWING: '#ff5722',
    APPROVED: '#4caf50',
    NOTARIZED: '#3f51b5',
    DEBT: '#f59e0b',
    ARCHIVED: '#607d8b',
    CANCELLED: '#ef4444',
  };
  const exportAccessByRole = {
    admin: {
      dashboardSummary: true,
      caseList: true,
      notaryRegister: true,
      operations: true,
      staff: true,
      finance: true,
      legal: true,
    },
    notary_officer: {
      dashboardSummary: true,
      caseList: true,
      notaryRegister: true,
      operations: true,
      staff: false,
      finance: false,
      legal: true,
    },
    staff: {
      dashboardSummary: true,
      caseList: true,
      notaryRegister: false,
      operations: false,
      staff: false,
      finance: false,
      legal: false,
    },
    viewer: {
      dashboardSummary: true,
      caseList: true,
      notaryRegister: false,
      operations: true,
      staff: false,
      finance: false,
      legal: false,
    },
    accountant: {
      dashboardSummary: true,
      caseList: true,
      notaryRegister: false,
      operations: false,
      staff: false,
      finance: true,
      legal: false,
    },
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    localStorage.setItem("app_view", view);
  }, [view, isLoggedIn]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      applyAccessToken(token);
    }
  }, []);
  useEffect(() => {
    if (!isLoggedIn) return;
    const syncCurrentUser = async () => {
      try {
        const res = await axios.get("http://localhost:4000/me");
        const nextUser = res?.data || null;
        if (!nextUser) return;
        setUser(nextUser);
        localStorage.setItem("user", JSON.stringify(nextUser));
        const savedView = localStorage.getItem("app_view");
        const defaultView = getDefaultViewByRole(nextUser?.role);
        const allowedViews = getAllowedViewsByRole(nextUser?.role);
        if (!savedView || !allowedViews.includes(savedView)) {
          setView(defaultView);
          localStorage.setItem("app_view", defaultView);
        }
      } catch (error) {
        console.error(error);
      }
    };
    syncCurrentUser();
  }, [isLoggedIn]);
  useEffect(() => {
    document.title = t("app.appName");
  }, [language, t]);
  useEffect(() => {
    document.documentElement.lang = language === "vi" ? "vi" : "en";
  }, [language]);
  useEffect(() => {
    const applyLocalizedValidityMessage = (event) => {
      const target = event?.target;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement) &&
        !(target instanceof HTMLSelectElement)
      ) {
        return;
      }
      target.setCustomValidity("");
      if (!target.validity || target.validity.valid) return;
      if (target.validity.valueMissing) {
        target.setCustomValidity(t("common.validationRequired"));
        return;
      }
      if (target.validity.typeMismatch && String(target.type || "").toLowerCase() === "email") {
        target.setCustomValidity(t("common.validationInvalidEmail"));
        return;
      }
      target.setCustomValidity(t("common.validationInvalidField"));
    };
    const clearValidityMessage = (event) => {
      const target = event?.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        target.setCustomValidity("");
      }
    };
    document.addEventListener("invalid", applyLocalizedValidityMessage, true);
    document.addEventListener("input", clearValidityMessage, true);
    document.addEventListener("change", clearValidityMessage, true);
    return () => {
      document.removeEventListener("invalid", applyLocalizedValidityMessage, true);
      document.removeEventListener("input", clearValidityMessage, true);
      document.removeEventListener("change", clearValidityMessage, true);
    };
  }, [language, t]);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        const status = error?.response?.status;
        const refreshToken = localStorage.getItem("refreshToken");
        if (
          (status === 401 || status === 403) &&
          refreshToken &&
          !originalRequest?._retry &&
          !originalRequest?.url?.includes("/auth/refresh") &&
          !originalRequest?.url?.includes("/login")
        ) {
          originalRequest._retry = true;
          try {
            const refreshRes = await axios.post("http://localhost:4000/auth/refresh", {
              refreshToken,
            });
            const newAccessToken = refreshRes.data.accessToken || refreshRes.data.token;
            const newRefreshToken = refreshRes.data.refreshToken;
            localStorage.setItem("token", newAccessToken);
            localStorage.setItem("refreshToken", newRefreshToken);
            applyAccessToken(newAccessToken);
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return axios(originalRequest);
          } catch (refreshError) {
            localStorage.removeItem("token");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("user");
            applyAccessToken(null);
            setIsLoggedIn(false);
            setUser(null);
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      if (view === "cases" || view === "dashboard" || view === "receipts") {
        fetchCases();
        fetchCustomers();
        if (view === "cases") {
          fetchAssignableUsers();
        }
      }
      if (view === "dashboard") {
        fetchDashboardStats();
      }
      fetchNotifications();
    }
  }, [isLoggedIn, view]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    const intervalId = setInterval(fetchNotifications, 60 * 1000);
    return () => clearInterval(intervalId);
  }, [isLoggedIn]);

  const fetchCases = async () => {
    setLoading(true);
    try {
      const includeDeleted = normalizedUserRole === "admin" ? "?includeDeleted=1" : "";
      const res = await axios.get(`http://localhost:4000/cases${includeDeleted}`);
      setCases(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await axios.get("http://localhost:4000/customers");
      setCustomers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setCustomers([]);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await axios.get("http://localhost:4000/dashboard/stats");
      setDashboardStats(res.data || null);
    } catch (err) {
      console.error(err);
      setDashboardStats(null);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await axios.get("http://localhost:4000/notifications");
      setNotifications(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setNotifications([]);
    }
  };
  const fetchAssignableUsers = async () => {
    if (!["admin", "notary_officer"].includes(normalizedUserRole)) {
      setAssignableUsers([]);
      return;
    }
    try {
      const res = await axios.get("http://localhost:4000/users");
      const users = Array.isArray(res.data) ? res.data : [];
      setAssignableUsers(
        users.filter(
          (item) =>
            item?.isActive !== false &&
            ["admin", "notary_officer"].includes(String(item?.role || "").toLowerCase()) &&
            String(item?.username || "").toLowerCase() !== String(user?.username || "").toLowerCase()
        )
      );
    } catch (err) {
      console.error(err);
      setAssignableUsers([]);
    }
  };

  const markNotificationAsRead = async (notificationId) => {
    try {
      await axios.post(`http://localhost:4000/notifications/${notificationId}/read`);
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? { ...item, status: "read" } : item))
      );
    } catch (err) {
      console.error(err);
    }
  };
  const handleNotificationClick = async (item) => {
    await markNotificationAsRead(item.id);
    setNotificationDrawerOpen(false);
    if (!item.caseId) return;
    setView("cases");
    setStatusFilter("ALL");
    setCaseCustomerFilterId(null);
    const matchedCase = cases.find((c) => c.id === item.caseId);
    if (matchedCase) {
      setSelectedCase(matchedCase);
      setOpenModal(true);
      return;
    }
    try {
      const res = await axios.get(`http://localhost:4000/cases/${item.caseId}`);
      if (res?.data?.id) {
        setSelectedCase(res.data);
        setOpenModal(true);
      }
    } catch (err) {
      console.error(err);
    }
  };
  const markAllNotificationsAsRead = async () => {
    try {
      await axios.post("http://localhost:4000/notifications/read-all");
      setNotifications((prev) => prev.map((item) => ({ ...item, status: "read" })));
    } catch (err) {
      console.error(err);
      toastApi.error(t("app.updateStatusError"));
    }
  };
  const clearReadNotifications = async () => {
    try {
      await axios.delete("http://localhost:4000/notifications/read");
      setNotifications((prev) => prev.filter((item) => item.status !== "read"));
    } catch (err) {
      console.error(err);
      toastApi.error(t("app.updateStatusError"));
    }
  };

  const handleLogin = (userData, tokens) => {
    localStorage.setItem("token", tokens.accessToken);
    localStorage.setItem("refreshToken", tokens.refreshToken);
    localStorage.setItem("user", JSON.stringify(userData));
    applyAccessToken(tokens.accessToken);
    setUser(userData);
    setIsLoggedIn(true);
    setView(getDefaultViewByRole(userData?.role));
  };


  const updateStatus = async (id, newStatus, notes = '') => {
    setConfirmStatusChange({ open: true, id, nextStatus: newStatus, notes });
  };

  const doUpdateStatus = async () => {
    const { id, nextStatus, notes } = confirmStatusChange;
    setConfirmStatusChange({ open: false, id: null, nextStatus: "", notes: "" });
    setLoading(true);
    try {
      const { data: updatedCase } = await axios.put(`http://localhost:4000/cases/${id}/status`, {
        status: nextStatus,
        notes
      });
      setCases((prev) =>
        prev.map((item) => (Number(item.id) === Number(id) ? { ...item, ...updatedCase } : item))
      );
      setSelectedCase((prev) =>
        prev && Number(prev.id) === Number(id) ? { ...prev, ...updatedCase } : prev
      );
      fetchCases();
    } catch (err) {
      console.error(err);
      const detail =
        typeof err?.response?.data === "string"
          ? err.response.data
          : err?.response?.data?.message || "";
      toastApi.error(detail || t("app.updateStatusError"));
    } finally {
      setLoading(false);
    }
  };

  const getNextStatuses = (currentStatus) => {
    const transitions = {
      [WORKFLOW_STATUS.RECEIVED]: [WORKFLOW_STATUS.RECEIPT],
      [WORKFLOW_STATUS.RECEIPT]: [WORKFLOW_STATUS.LEGAL_CHECKING],
      [WORKFLOW_STATUS.LEGAL_CHECKING]: [WORKFLOW_STATUS.DRAFTING, WORKFLOW_STATUS.RECEIVED],
      [WORKFLOW_STATUS.DRAFTING]: [WORKFLOW_STATUS.REVIEWING],
      [WORKFLOW_STATUS.REVIEWING]: [WORKFLOW_STATUS.APPROVED, WORKFLOW_STATUS.DRAFTING],
      [WORKFLOW_STATUS.APPROVED]: [WORKFLOW_STATUS.NOTARIZED],
      [WORKFLOW_STATUS.NOTARIZED]: [WORKFLOW_STATUS.DEBT],
      [WORKFLOW_STATUS.DEBT]: [WORKFLOW_STATUS.ARCHIVED],
      [WORKFLOW_STATUS.CANCELLED]: [],
    };
    return transitions[currentStatus] || [];
  };

  const openCaseListWithFilter = (filter) => {
    setCaseCustomerFilterId(null);
    setStatusFilter(filter);
    setDetailedStatusFilters([]);
    setView("cases");
  };
  const openCustomerManagementWithFocus = (customerId) => {
    setFocusedCustomerId(customerId);
    setView("customers");
  };
  const openCaseListForCustomer = (customer) => {
    setStatusFilter("ALL");
    setCaseCustomerFilterId(customer.id);
    setSearch("");
    setView("cases");
  };
  const openCaseListWithType = (type) => {
    setStatusFilter("ALL");
    setCaseCustomerFilterId(null);
    setSearch("");
    setTableFilters({ ...DEFAULT_TABLE_FILTERS, type: caseTypeText(type) });
    setView("cases");
  };
  const clearAllCaseFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setDetailedStatusFilters([]);
    setFeeStatusFilter("ALL");
    setCaseCustomerFilterId(null);
    setTableFilters(DEFAULT_TABLE_FILTERS);
    setCasePage(0);
  };
  const toggleBatchCaseSelection = (caseId) => {
    setSelectedBatchCaseIds((prev) =>
      prev.includes(caseId) ? prev.filter((id) => id !== caseId) : [...prev, caseId]
    );
  };
  const assignCasesBatch = async () => {
    if (!batchAssignee) {
      toastApi.warning("Vui lòng chọn người phụ trách để phân công hàng loạt.");
      return;
    }
    if (!selectedBatchCaseIds.length) {
      toastApi.warning("Vui lòng chọn ít nhất 1 hồ sơ chưa phân công.");
      return;
    }
    setLoading(true);
    try {
      let updatedCount = 0;
      try {
        const res = await axios.put("http://localhost:4000/cases/assign/batch", {
          assignedTo: batchAssignee,
          caseIds: selectedBatchCaseIds,
        });
        updatedCount = Number(res.data?.updatedCount || 0);
      } catch (batchError) {
        // Fallback for environments where batch endpoint is unavailable.
        if (batchError?.response?.status !== 404) {
          throw batchError;
        }
        await Promise.all(
          selectedBatchCaseIds.map((caseId) =>
            axios.put(`http://localhost:4000/cases/${caseId}/assign`, {
              assignedTo: batchAssignee,
            })
          )
        );
        updatedCount = selectedBatchCaseIds.length;
      }
      toastApi.success(`Đã phân công ${updatedCount} hồ sơ cho ${batchAssignee}.`);
      setSelectedBatchCaseIds([]);
      setBatchAssignee("");
      fetchCases();
    } catch (error) {
      console.error(error);
      toastApi.error("Không thể phân công hàng loạt. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const downloadCsvFile = (filename, headers, rows) => {
    const escapeCsv = (value) => {
      const raw = value === null || value === undefined ? "" : String(value);
      if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
        return `"${raw.replace(/"/g, '""')}"`;
      }
      return raw;
    };
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getExportTimestamp = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
  };

  const downloadManifestFile = (filename, payload) => {
    const manifestBlob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const manifestUrl = URL.createObjectURL(manifestBlob);
    const manifestLink = document.createElement("a");
    manifestLink.href = manifestUrl;
    manifestLink.download = filename;
    document.body.appendChild(manifestLink);
    manifestLink.click();
    document.body.removeChild(manifestLink);
    URL.revokeObjectURL(manifestUrl);
  };
  const assertCsvShape = (headers, rows, exportName) => {
    const headerLen = Array.isArray(headers) ? headers.length : 0;
    if (!headerLen) {
      throw new Error(`${exportName}: Empty header schema`);
    }
    const mismatchIndex = (rows || []).findIndex((row) => !Array.isArray(row) || row.length !== headerLen);
    if (mismatchIndex >= 0) {
      throw new Error(
        `${exportName}: Row ${mismatchIndex + 1} has ${(rows[mismatchIndex] || []).length} columns, expected ${headerLen}`
      );
    }
  };
  const getFilenameFromDisposition = (contentDisposition, fallbackFilename) => {
    const value = String(contentDisposition || "");
    const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch (_error) {
        return utf8Match[1];
      }
    }
    const plainMatch = value.match(/filename="?([^"]+)"?/i);
    if (plainMatch?.[1]) return plainMatch[1];
    return fallbackFilename;
  };
  const getFeeStatus = (caseItem) => {
    const feeAmount = Number(caseItem?.feeAmount || 0);
    const feePaid = Number(caseItem?.feePaid || 0);
    if (feePaid <= 0) return FEE_STATUS.UNPAID;
    if (feeAmount > 0 && feePaid < feeAmount) return FEE_STATUS.PARTIAL;
    if (feeAmount <= 0 && feePaid > 0) return FEE_STATUS.PAID_FULL;
    return FEE_STATUS.PAID_FULL;
  };
  const feeStatusText = (feeStatus) => {
    if (feeStatus === FEE_STATUS.UNPAID) return t("app.feeStatusUnpaid");
    if (feeStatus === FEE_STATUS.PARTIAL) return t("app.feeStatusPartial");
    return t("app.feeStatusPaidFull");
  };
  const isFinancialResetPending = (caseItem) => {
    const history = Array.isArray(caseItem?.history) ? caseItem.history : [];
    let latestResetTs = 0;
    let latestResumedTs = 0;
    history.forEach((item) => {
      const ts = new Date(item?.timestamp || 0).getTime();
      if (!ts) return;
      if (item?.action === "CASE_FINANCIAL_RESET" && ts > latestResetTs) latestResetTs = ts;
      if (item?.action === "CASE_FINANCIAL_RESUMED" && ts > latestResumedTs) latestResumedTs = ts;
    });
    return latestResetTs > 0 && latestResetTs > latestResumedTs;
  };
  const getPaymentMethod = (caseItem) =>
    String(caseItem?.paymentMethod || PAYMENT_METHOD.CASH).toUpperCase();

  const exportDashboardSummary = () => {
    const receivedUnassignedCount = cases.filter(
      (c) =>
        c.status === WORKFLOW_STATUS.RECEIVED &&
        !c.assignedTo &&
        !c.isDeleted &&
        c.status !== WORKFLOW_STATUS.CANCELLED
    ).length;
    const inProcessingAssignedCount = cases.filter(
      (c) =>
        Boolean(c.assignedTo) &&
        !c.isDeleted &&
        c.status !== WORKFLOW_STATUS.ARCHIVED &&
        c.status !== WORKFLOW_STATUS.CANCELLED
    ).length;
    const kpi = dashboardStats?.kpi || {
      totalCases: cases.length,
      activeCases: inProcessingAssignedCount,
      archivedCases: cases.filter((c) => c.status === WORKFLOW_STATUS.ARCHIVED).length,
      totalCustomers: customers.length,
    };
    const byStatus = dashboardStats?.byStatus || Object.fromEntries(
      Object.keys(WORKFLOW_STATUS_LABELS).map((status) => [status, cases.filter((c) => c.status === status).length])
    );
    const headers = [t("app.type"), t("common.value")];
    const rows = [
      [t("app.totalCases"), kpi.totalCases],
      [t("app.receivedCases"), receivedUnassignedCount],
      [t("app.activeCases"), kpi.activeCases],
      [t("app.doneCases"), kpi.archivedCases],
      [t("app.totalCustomers"), kpi.totalCustomers],
      ...Object.entries(byStatus).map(([status, count]) => [
        `${t("app.caseStatuses")} - ${statusText(status)}`,
        count,
      ]),
    ];
    const timestamp = getExportTimestamp();
    const filename =
      language === "vi" ? `Baocao_KPI_${timestamp}.csv` : `dashboard_summary_${timestamp}.csv`;
    try {
      assertCsvShape(headers, rows, "FE-KPI");
      downloadCsvFile(filename, headers, rows);
      toastApi.success(t("app.exportSummarySuccess"));
    } catch (error) {
      console.error(error);
      toastApi.error(t("app.exportFailedSchemaMismatch"));
    }
  };

  const exportCaseList = () => {
    const dateLocale = language === "vi" ? "vi-VN" : "en-US";
    const headers = [
      language === "vi" ? "Mã hồ sơ" : "Case ID",
      t("app.customerName"),
      t("app.phone"),
      t("app.type"),
      t("app.caseStatuses"),
      t("caseDetail.assignedTo"),
      t("caseDetail.deadline"),
      t("app.description"),
      t("app.notes"),
      t("app.feeStatus"),
      ...(showFinancialAmountColumns ? [t("app.totalFeeAmount"), t("app.totalFeePaid")] : []),
      t("common.updatedAt"),
    ];
    const rows = displayedCases.map((c) => {
      return [
        c.caseId,
        c.customerName,
        c.phone,
        caseTypeText(c.type),
        statusText(c.status),
        c.assignedTo || "-",
        c.deadline ? new Date(c.deadline).toLocaleDateString(dateLocale) : "-",
        c.description || "",
        c.notes || "",
        feeStatusText(getFeeStatus(c)),
        ...(showFinancialAmountColumns
          ? [
              Number(c.feeAmount || 0),
              Number(c.feePaid || 0),
            ]
          : []),
        c.updatedAt ? new Date(c.updatedAt).toLocaleString(dateLocale) : "-",
      ];
    });
    const timestamp = getExportTimestamp();
    const filename =
      language === "vi" ? `Baocao_Hoso_${timestamp}.csv` : `case_list_report_${timestamp}.csv`;
    try {
      assertCsvShape(headers, rows, "FE-CASE-LIST");
      downloadCsvFile(filename, headers, rows);
      toastApi.success(t("app.exportCaseSuccess"));
    } catch (error) {
      console.error(error);
      toastApi.error(t("app.exportFailedSchemaMismatch"));
    }
  };
  const exportFeeKpi = () => {
    const totalFeeAmount = cases.reduce((sum, item) => sum + Number(item.feeAmount || 0), 0);
    const totalFeePaid = cases.reduce((sum, item) => sum + Number(item.feePaid || 0), 0);
    const totalOutstanding = Math.max(0, totalFeeAmount - totalFeePaid);
    const feeByStatus = cases.reduce(
      (acc, item) => {
        const feeStatus = getFeeStatus(item);
        acc[feeStatus] = (acc[feeStatus] || 0) + 1;
        return acc;
      },
      {
        [FEE_STATUS.UNPAID]: 0,
        [FEE_STATUS.PARTIAL]: 0,
        [FEE_STATUS.PAID_FULL]: 0,
      }
    );
    const feeByPaymentMethod = cases.reduce(
      (acc, item) => {
        const method = getPaymentMethod(item);
        acc[method] = (acc[method] || 0) + 1;
        return acc;
      },
      {
        [PAYMENT_METHOD.CASH]: 0,
        [PAYMENT_METHOD.BANK_TRANSFER]: 0,
      }
    );
    const headers = [t("app.type"), t("common.value")];
    const rows = [
      [t("app.totalCases"), cases.length],
      [t("app.totalFeeAmount"), totalFeeAmount],
      [t("app.totalFeePaid"), totalFeePaid],
      [t("app.totalFeeOutstanding"), totalOutstanding],
      [t("app.feeStatusUnpaid"), feeByStatus[FEE_STATUS.UNPAID]],
      [t("app.feeStatusPartial"), feeByStatus[FEE_STATUS.PARTIAL]],
      [t("app.feeStatusPaidFull"), feeByStatus[FEE_STATUS.PAID_FULL]],
      [t("app.paymentMethodCash"), feeByPaymentMethod[PAYMENT_METHOD.CASH]],
      [t("app.paymentMethodBankTransfer"), feeByPaymentMethod[PAYMENT_METHOD.BANK_TRANSFER]],
    ];
    const timestamp = getExportTimestamp();
    const filename =
      language === "vi" ? `Baocao_ThuPhi_KPI_${timestamp}.csv` : `fee_kpi_report_${timestamp}.csv`;
    try {
      assertCsvShape(headers, rows, "FE-FEE-KPI");
      downloadCsvFile(filename, headers, rows);
      toastApi.success(t("app.exportFeeKpiSuccess"));
    } catch (error) {
      console.error(error);
      toastApi.error(t("app.exportFailedSchemaMismatch"));
    }
  };

  const exportNotaryRegister = async () => {
    try {
      const response = await axios.get("http://localhost:4000/notary-register/export", {
        params: { lang: language === "en" ? "en" : "vi" },
        responseType: "blob",
      });
      const stamp = getExportTimestamp();
      const fallbackFilename =
        language === "vi"
          ? `SoCongChung_${stamp}.csv`
          : `notary_register_${stamp}.csv`;
      const filename = getFilenameFromDisposition(response.headers?.["content-disposition"], fallbackFilename);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toastApi.success(t("app.exportNotarySuccess"));
    } catch (error) {
      console.error(error);
      toastApi.error(t("app.createCaseError"));
    }
  };

  const exportEnterpriseReport = async (type) => {
    try {
      const response = await axios.get("http://localhost:4000/reports/enterprise/export", {
        params: { type, lang: language === "en" ? "en" : "vi" },
        responseType: "blob",
      });
      const hash = response.headers["x-content-sha256"];
      const stamp = getExportTimestamp();
      const fallbackFilename =
        language === "vi" ? `BaoCao_${type}_${stamp}.csv` : `${type}_report_${stamp}.csv`;
      const filename = getFilenameFromDisposition(response.headers?.["content-disposition"], fallbackFilename);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      downloadManifestFile(`manifest.${filename}.json`, {
        exportedAt: new Date().toISOString(),
        reportType: type,
        fileName: filename,
        contentSha256: hash || "",
        source: "/reports/enterprise/export",
        filters: { type },
      });
      toastApi.success(hash ? `Export ${type} thành công. SHA-256: ${hash}` : `Export ${type} thành công.`);
    } catch (error) {
      console.error(error);
      toastApi.error("Không thể export báo cáo enterprise.");
    }
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      try {
        await axios.post("http://localhost:4000/auth/logout", { refreshToken });
      } catch (error) {
        console.error(error);
      }
    }
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("app_view");
    applyAccessToken(null);
    setIsLoggedIn(false);
    setUser(null);
  };
  const toggleSidebar = () => {
    setSidebarHidden((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_hidden", next ? "1" : "0");
      return next;
    });
  };

  const filteredCases = Array.isArray(cases)
    ? cases.filter((c) =>
        (caseCustomerFilterId ? c.customerId === caseCustomerFilterId : true) &&
        [c.customerName, c.caseId, c.phone, c.assignedTo, c.type, c.description, c.notes]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search.toLowerCase()))
      )
    : [];
  const activeCustomerFilter =
    caseCustomerFilterId && Array.isArray(customers)
      ? customers.find((customer) => customer.id === caseCustomerFilterId) || null
      : null;
  const statusFilteredCases = filteredCases.filter((c) => {
    if (statusFilter === "ALL") return true;
    if (statusFilter === "RECEIVED_UNASSIGNED") {
      return c.status === WORKFLOW_STATUS.RECEIVED && !c.assignedTo && !c.isDeleted;
    }
    if (statusFilter === "ACTIVE") {
      return (
        Boolean(c.assignedTo) &&
        c.status !== WORKFLOW_STATUS.ARCHIVED &&
        c.status !== WORKFLOW_STATUS.CANCELLED &&
        c.status !== WORKFLOW_STATUS.RECEIVED &&
        !c.isDeleted
      );
    }
    if (statusFilter === "ARCHIVED") return c.status === WORKFLOW_STATUS.ARCHIVED;
    if (statusFilter === "CANCELLED") return c.status === WORKFLOW_STATUS.CANCELLED || c.isDeleted;
    return c.status === statusFilter;
  });
  const detailedStatusFilteredCases =
    detailedStatusFilters.length > 0
      ? statusFilteredCases.filter((c) => detailedStatusFilters.includes(c.status))
      : statusFilteredCases;
  const feeStatusFilteredCases =
    feeStatusFilter === "ALL"
      ? detailedStatusFilteredCases
      : detailedStatusFilteredCases.filter((item) => getFeeStatus(item) === feeStatusFilter);
  const normalize = (value) => String(value || "").toLowerCase().trim();
  const matchesTextFilter = (value, filterValue) => {
    const q = normalize(filterValue);
    if (!q) return true;
    return normalize(value).includes(q);
  };
  const tableFilteredCases = feeStatusFilteredCases.filter((c) => {
    const deadlineText = c.deadline
      ? new Date(c.deadline).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US")
      : "";
    const updatedAtText = c.updatedAt
      ? new Date(c.updatedAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")
      : "";
    const caseStatusText = statusText(c.status);
    const caseFeeStatusText = feeStatusText(getFeeStatus(c));
    const feeAmountText = Number(c.feeAmount || 0).toLocaleString(language === "vi" ? "vi-VN" : "en-US");
    const feePaidText = Number(c.feePaid || 0).toLocaleString(language === "vi" ? "vi-VN" : "en-US");
    return (
      matchesTextFilter(c.caseId, tableFilters.caseId) &&
      matchesTextFilter(c.customerName, tableFilters.customerName) &&
      matchesTextFilter(c.phone, tableFilters.phone) &&
      matchesTextFilter(caseTypeText(c.type), tableFilters.type) &&
      matchesTextFilter(caseStatusText, tableFilters.status) &&
      matchesTextFilter(c.assignedTo || "-", tableFilters.assignedTo) &&
      matchesTextFilter(deadlineText, tableFilters.deadline) &&
      matchesTextFilter(c.description, tableFilters.description) &&
      matchesTextFilter(c.notes, tableFilters.notes) &&
      matchesTextFilter(caseFeeStatusText, tableFilters.feeStatus) &&
      matchesTextFilter(feeAmountText, tableFilters.feeAmount) &&
      matchesTextFilter(feePaidText, tableFilters.feePaid) &&
      matchesTextFilter(updatedAtText, tableFilters.updatedAt)
    );
  });
  const getComparableCaseValue = (item, field) => {
    if (field === "deadline") return new Date(item.deadline || 0).getTime();
    if (field === "updatedAt") return new Date(item.updatedAt || 0).getTime();
    if (field === "status") return statusText(item.status);
    if (field === "type") return caseTypeText(item.type);
    if (field === "assignedTo") return item.assignedTo || "";
    if (field === "feeAmount") return Number(item.feeAmount || 0);
    if (field === "feePaid") return Number(item.feePaid || 0);
    return item[field] || "";
  };
  const displayedCases = tableFilteredCases.slice().sort((a, b) => {
    const aValue = getComparableCaseValue(a, caseSort.field);
    const bValue = getComparableCaseValue(b, caseSort.field);
    if (typeof aValue === "number" && typeof bValue === "number") {
      return caseSort.direction === "asc" ? aValue - bValue : bValue - aValue;
    }
    const compared = String(aValue).localeCompare(String(bValue), "vi", { sensitivity: "base" });
    return caseSort.direction === "asc" ? compared : -compared;
  });
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(displayedCases.length / caseRowsPerPage) - 1);
    if (casePage > maxPage) setCasePage(maxPage);
  }, [displayedCases.length, caseRowsPerPage, casePage]);
  const pagedCases = displayedCases.slice(
    casePage * caseRowsPerPage,
    casePage * caseRowsPerPage + caseRowsPerPage
  );
  const showDescriptionNotesColumn = true;
  const showFinancialAmountColumns = ["admin", "accountant"].includes(normalizedUserRole);
  const canBatchAssign = ["admin", "notary_officer"].includes(normalizedUserRole);
  const selectableBatchCaseIds = displayedCases
    .filter((item) => !item.isDeleted)
    .map((item) => item.id);
  const allSelectableCasesChecked =
    selectableBatchCaseIds.length > 0 &&
    selectableBatchCaseIds.every((id) => selectedBatchCaseIds.includes(id));
  const selectedBatchCount = selectedBatchCaseIds.length;
  const truncateText = (value, maxLength = 80) => {
    const text = String(value || "").trim();
    if (!text) return "-";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  };
  const unreadCount = notifications.filter((item) => item.status === "unread").length;
  const linkedCaseCountByCustomerId = cases.reduce((acc, caseItem) => {
    if (caseItem.isDeleted || !caseItem.customerId) return acc;
    acc[caseItem.customerId] = (acc[caseItem.customerId] || 0) + 1;
    return acc;
  }, {});
  const dashboardCustomers = customers
    .map((customer) => ({
      ...customer,
      linkedCases: linkedCaseCountByCustomerId[customer.id] || 0,
    }))
    .sort((a, b) => {
      const aValue = dashboardCustomerSort.field === "linkedCases"
        ? Number(a.linkedCases || 0)
        : String(a[dashboardCustomerSort.field] || "");
      const bValue = dashboardCustomerSort.field === "linkedCases"
        ? Number(b.linkedCases || 0)
        : String(b[dashboardCustomerSort.field] || "");
      if (typeof aValue === "number" && typeof bValue === "number") {
        return dashboardCustomerSort.direction === "asc" ? aValue - bValue : bValue - aValue;
      }
      const compared = aValue.localeCompare(bValue, "vi", { sensitivity: "base" });
      return dashboardCustomerSort.direction === "asc" ? compared : -compared;
    });
  const currentUsername = String(user?.username || "").toLowerCase();
  const currentFullName = String(user?.fullName || "").toLowerCase();
  const isCaseAssignedToCurrentUser = (caseItem) => {
    const assignee = String(caseItem?.assignedTo || "").toLowerCase().trim();
    if (!assignee) return false;
    return assignee === currentUsername || (currentFullName && assignee === currentFullName);
  };
  const isClosedCaseStatus = (status) =>
    status === WORKFLOW_STATUS.ARCHIVED || status === WORKFLOW_STATUS.CANCELLED;
  const isActionableCase = (caseItem) => !caseItem?.isDeleted && !isClosedCaseStatus(caseItem?.status);
  const dashboardRelatedCases = cases
    .filter((item) => isActionableCase(item))
    .filter((item) => {
      if (isCaseAssignedToCurrentUser(item)) return true;
      if (["admin", "notary_officer"].includes(normalizedUserRole) && !item.assignedTo) return true;
      return false;
    })
    .sort((a, b) => {
      const aAssigned = isCaseAssignedToCurrentUser(a) ? 1 : 0;
      const bAssigned = isCaseAssignedToCurrentUser(b) ? 1 : 0;
      if (aAssigned !== bAssigned) return bAssigned - aAssigned;
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });
  const dashboardRelatedCasePreview = dashboardRelatedCases.slice(0, 5);
  const myAssignedCaseCount = dashboardRelatedCases.filter((item) => isCaseAssignedToCurrentUser(item)).length;
  const unassignedQueueCount = dashboardRelatedCases.filter((item) => !item.assignedTo).length;
  const now = Date.now();
  const overdueCaseCount = dashboardRelatedCases.filter(
    (item) => item.deadline && new Date(item.deadline).getTime() < now
  ).length;
  const dueSoonCaseCount = dashboardRelatedCases.filter((item) => {
    if (!item.deadline) return false;
    const deadlineTs = new Date(item.deadline).getTime();
    const diff = deadlineTs - now;
    return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 2;
  }).length;
  const toggleCaseSort = (field) => {
    setCaseSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };
  const toggleDashboardCustomerSort = (field) => {
    setDashboardCustomerSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };
  const reportAccess = exportAccessByRole[normalizedUserRole] || {
    dashboardSummary: false,
    caseList: false,
    notaryRegister: false,
    operations: false,
    staff: false,
    finance: false,
    legal: false,
  };
  const hasAnyReportExportAccess = Object.values(reportAccess).some(Boolean);
  const hasAnyTableFilter = Object.values(tableFilters).some((value) => String(value || "").trim() !== "");
  const hasAnyCaseFilter =
    search.trim() !== "" ||
    statusFilter !== "ALL" ||
    detailedStatusFilters.length > 0 ||
    feeStatusFilter !== "ALL" ||
    Boolean(caseCustomerFilterId) ||
    hasAnyTableFilter;
  useEffect(() => {
    setSelectedBatchCaseIds((prev) =>
      prev.filter((id) => cases.some((item) => item.id === id && !item.assignedTo && !item.isDeleted))
    );
  }, [cases]);
  const renderReportExportButton = ({ allowed, onClick, label, variant = "outlined" }) => {
    if (allowed) {
      return (
        <Button variant={variant} onClick={onClick}>
          {label}
        </Button>
      );
    }
    return (
      <Tooltip title={t("app.noReportExportPermission")} arrow>
        <span>
          <Button variant={variant} disabled>
            {label}
          </Button>
        </span>
      </Tooltip>
    );
  };

  if (publicTrackCode) {
    return <TrackCase initialCode={publicTrackCode} />;
  }
  if (resetPasswordToken || window.location.pathname === "/reset-password") {
    return <ResetPassword token={resetPasswordToken} />;
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
      {/* SIDEBAR */}
      {!sidebarHidden && (
      <Box
        sx={{
          width: 288,
          bgcolor: "#0b1220",
          color: "white",
          p: 2.5,
          borderRight: "1px solid rgba(148,163,184,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 3, px: 1 }}>
          <Avatar src={notaryLogo} variant="rounded" sx={{ width: 34, height: 34 }} />
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.2 }}>
            {t("app.appName")}
          </Typography>
        </Box>
          <IconButton
            size="small"
            onClick={toggleSidebar}
            sx={{ color: "#cbd5e1", mt: 0.5 }}
            aria-label="Ẩn sidebar"
          >
            <MenuOpenIcon fontSize="small" />
          </IconButton>
        </Box>

        <Stack spacing={1}>
          {[
            { id: "dashboard", label: t("nav.dashboard") },
            { id: "cases", label: t("nav.cases") },
            { id: "customers", label: t("nav.customers") },
            ...(normalizedUserRole === "admin" || normalizedUserRole === "accountant"
              ? [{ id: "receipts", label: "🧾 Quản lý phiếu thu" }]
              : []),
            ...(isAdminUser
              ? [
                  { id: "templates", label: t("nav.templates") },
                  { id: "translators", label: t("nav.translators") },
                ]
              : []),
            ...(!isAdminUser ? [{ id: "templates", label: t("nav.templates") }] : []),
          ].map((item) => (
            <Button
              key={item.id}
              onClick={() => setView(item.id)}
              variant={view === item.id ? "contained" : "text"}
              sx={{
                justifyContent: "flex-start",
                color: view === item.id ? "#fff" : "#cbd5e1",
                bgcolor: view === item.id ? "primary.main" : "transparent",
              }}
            >
              {item.label}
            </Button>
          ))}
          {isAdminUser && (
            <Button
              onClick={() => setView("users")}
              variant={view === "users" ? "contained" : "text"}
              sx={{
                justifyContent: "flex-start",
                color: view === "users" ? "#fff" : "#cbd5e1",
                bgcolor: view === "users" ? "primary.main" : "transparent",
              }}
            >
              {t("nav.users")}
            </Button>
          )}
        </Stack>

      </Box>
      )}

      {/* MAIN */}
      <Box sx={{ flex: 1, p: 3, overflowY: "auto" }}>
        <Box
          sx={{
            position: "fixed",
            top: 10,
            right: 16,
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            gap: 1,
            bgcolor: "rgba(255,255,255,0.94)",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            px: 1,
            py: 0.5,
            boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
            {t("common.language")}
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Button
              size="small"
              variant={language === "vi" ? "contained" : "text"}
              onClick={() => setLanguage("vi")}
              sx={{ minWidth: 38, px: 1, py: 0.25, fontSize: 12 }}
            >
              VI
            </Button>
            <Button
              size="small"
              variant={language === "en" ? "contained" : "text"}
              onClick={() => setLanguage("en")}
              sx={{ minWidth: 38, px: 1, py: 0.25, fontSize: 12 }}
            >
              EN
            </Button>
          </Box>
          <Divider orientation="vertical" flexItem />
          <IconButton
            onClick={() => setNotificationDrawerOpen(true)}
            sx={{ color: "#0f172a" }}
            aria-label="notifications"
          >
            <Badge badgeContent={unreadCount} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>
          <Button
            size="small"
            onClick={(e) => setAccountMenuAnchor(e.currentTarget)}
            sx={{ textTransform: "none", minWidth: 0, px: 0.75, gap: 0.75 }}
          >
            <Avatar src={user?.avatarUrl || undefined} sx={{ width: 28, height: 28 }}>
              {String(user?.fullName || user?.username || "U").slice(0, 1).toUpperCase()}
            </Avatar>
            <Typography variant="caption" sx={{ color: "text.primary", fontWeight: 600, maxWidth: 120 }} noWrap>
              {user?.fullName || user?.username}
            </Typography>
          </Button>
          <Menu
            anchorEl={accountMenuAnchor}
            open={Boolean(accountMenuAnchor)}
            onClose={() => setAccountMenuAnchor(null)}
          >
            <MenuItem
              onClick={() => {
                setAccountMenuAnchor(null);
                setView("profile");
              }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <AccountCircleOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {t("nav.profile")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAccountMenuAnchor(null);
                logout();
              }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <LogoutOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {t("common.logout")}
            </MenuItem>
          </Menu>
        </Box>
        {sidebarHidden && (
          <IconButton
            size="small"
            onClick={toggleSidebar}
            sx={{
              position: "fixed",
              top: 14,
              left: 14,
              zIndex: 1200,
              bgcolor: "#0b1220",
              color: "#fff",
              "&:hover": { bgcolor: "#111c31" },
            }}
            aria-label="Hiện sidebar"
          >
            <MenuIcon fontSize="small" />
          </IconButton>
        )}
        {view === "cases" ? (
          <>
            <Typography variant="h5" mb={3}>{t("app.casesTitle")}</Typography>

            <Paper sx={{ p: 2, mt: 1, mb: 3, borderRadius: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Typography variant="h6">{t("app.createCase")}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {t("app.createCaseModernHint")}
                </Typography>
              </Box>
              <Button variant="contained" onClick={() => setCreateCaseDialogOpen(true)}>
                {t("app.createCaseBtn")}
              </Button>
            </Paper>

            {/* SEARCH */}
            <TextField
              placeholder={t("app.searching")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ mb: 2, width: "100%" }}
            />
            {caseCustomerFilterId && (
              <Paper
                sx={{
                  p: 1.5,
                  mb: 2,
                  borderRadius: 2,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  bgcolor: "#f8fafc",
                }}
              >
                <Typography variant="body2">
                  Đang lọc theo khách hàng: <b>{activeCustomerFilter?.fullName || "Không xác định"}</b>
                </Typography>
                <Button
                  size="small"
                  onClick={() => setCaseCustomerFilterId(null)}
                >
                  Bỏ lọc
                </Button>
              </Paper>
            )}
            <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
              {[
                { id: "ALL", label: t("app.totalCases") },
                { id: "RECEIVED_UNASSIGNED", label: t("app.receivedCases") },
                { id: "ACTIVE", label: t("app.activeCases") },
                { id: "ARCHIVED", label: t("app.doneCases") },
                ...(normalizedUserRole === "admin"
                  ? [{ id: "CANCELLED", label: t("status.CANCELLED") }]
                  : []),
              ].map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  clickable
                  color={statusFilter === item.id ? "primary" : "default"}
                  variant={statusFilter === item.id ? "filled" : "outlined"}
                  onClick={() => {
                    setStatusFilter(item.id);
                    setDetailedStatusFilters([]);
                  }}
                />
              ))}
            </Box>
            <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
              {[
                { id: "ALL", label: t("app.feeFilterAll") },
                { id: FEE_STATUS.UNPAID, label: t("app.feeStatusUnpaid") },
                { id: FEE_STATUS.PARTIAL, label: t("app.feeStatusPartial") },
                { id: FEE_STATUS.PAID_FULL, label: t("app.feeStatusPaidFull") },
              ].map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  clickable
                  color={feeStatusFilter === item.id ? "secondary" : "default"}
                  variant={feeStatusFilter === item.id ? "filled" : "outlined"}
                  onClick={() => setFeeStatusFilter(item.id)}
                />
              ))}
              <Button size="small" variant="outlined" onClick={clearAllCaseFilters} disabled={!hasAnyCaseFilter}>
                Xóa toàn bộ bộ lọc
              </Button>
              <Button size="small" variant="contained" onClick={exportCaseList} disabled={displayedCases.length === 0}>
                {t("common.quickExportCsv")}
              </Button>
            </Box>
            {canBatchAssign && (
              <Paper
                sx={{
                  p: 2,
                  mb: 2,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "#f8fafc",
                }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Điều phối phân công theo batch
                </Typography>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <FormControl sx={{ minWidth: 240 }}>
                    <InputLabel>Người phụ trách</InputLabel>
                    <Select
                      value={batchAssignee}
                      label="Người phụ trách"
                      onChange={(e) => setBatchAssignee(e.target.value)}
                    >
                      {assignableUsers.map((item) => (
                        <MenuItem key={item.username} value={item.username}>
                          {item.fullName || item.username} ({item.username})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    onClick={assignCasesBatch}
                    disabled={loading || !selectedBatchCount || !batchAssignee}
                  >
                    Phân công {selectedBatchCount || 0} hồ sơ
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Có thể chọn nhiều hồ sơ để phân công hoặc phân công lại theo batch.
                  </Typography>
                </Box>
              </Paper>
            )}

            <Paper sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: "#f8fafc" }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="body2" sx={{ minWidth: 150 }}>
                  Chi tiết trạng thái:
                </Typography>
                <FormControl size="small" sx={{ minWidth: 280 }}>
                  <Select
                    multiple
                    displayEmpty
                    value={detailedStatusFilters}
                    onChange={(e) =>
                      setDetailedStatusFilters(
                        Array.isArray(e.target.value) ? e.target.value : String(e.target.value).split(",")
                      )
                    }
                    renderValue={(selected) => {
                      if (!selected?.length) return "Tất cả trạng thái";
                      return selected.map((status) => WORKFLOW_STATUS_LABELS[status] || status).join(", ");
                    }}
                  >
                    {Object.entries(WORKFLOW_STATUS_LABELS).map(([status, label]) => (
                      <MenuItem key={status} value={status}>
                        <Checkbox size="small" checked={detailedStatusFilters.includes(status)} />
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {detailedStatusFilters.length > 0 && (
                  <Button size="small" onClick={() => setDetailedStatusFilters([])}>
                    Xóa lọc chi tiết
                  </Button>
                )}
              </Box>
            </Paper>

            {/* TABLE */}
            <TableContainer component={Paper} sx={{ borderRadius: 3, maxHeight: 640 }}>
              <Box sx={{ px: 2, pt: 1.5 }}>
                <Tooltip
                  arrow
                  title={`Đang sắp xếp theo "${CASE_SORT_LABELS[caseSort.field]}": ${
                    caseSort.direction === "asc" ? "tăng dần" : "giảm dần"
                  }`}
                >
                  <Typography variant="caption" color="text.secondary">
                    ↕ Sắp xếp: {CASE_SORT_LABELS[caseSort.field]} ({caseSort.direction === "asc" ? "A→Z" : "Z→A"})
                  </Typography>
                </Tooltip>
              </Box>
              <Table stickyHeader>
                <TableHead sx={{ bgcolor: "#f8fafc" }}>
                  <TableRow>
                    {canBatchAssign && (
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={allSelectableCasesChecked}
                          indeterminate={selectedBatchCount > 0 && !allSelectableCasesChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBatchCaseIds(selectableBatchCaseIds);
                            } else {
                              setSelectedBatchCaseIds([]);
                            }
                          }}
                          inputProps={{ "aria-label": "Chọn tất cả hồ sơ trong danh sách" }}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <TableSortLabel
                        active={caseSort.field === "caseId"}
                        direction={caseSort.field === "caseId" ? caseSort.direction : "asc"}
                        onClick={() => toggleCaseSort("caseId")}
                      >
                        Mã hồ sơ
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={caseSort.field === "customerName"}
                        direction={caseSort.field === "customerName" ? caseSort.direction : "asc"}
                        onClick={() => toggleCaseSort("customerName")}
                      >
                        {t("app.customerName")}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={caseSort.field === "phone"}
                        direction={caseSort.field === "phone" ? caseSort.direction : "asc"}
                        onClick={() => toggleCaseSort("phone")}
                      >
                        {t("app.phone")}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={caseSort.field === "type"}
                        direction={caseSort.field === "type" ? caseSort.direction : "asc"}
                        onClick={() => toggleCaseSort("type")}
                      >
                        {t("app.type")}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={caseSort.field === "status"}
                        direction={caseSort.field === "status" ? caseSort.direction : "asc"}
                        onClick={() => toggleCaseSort("status")}
                      >
                        {t("status.RECEIVED").includes("Received") ? "Status" : "Trạng thái"}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={caseSort.field === "assignedTo"}
                        direction={caseSort.field === "assignedTo" ? caseSort.direction : "asc"}
                        onClick={() => toggleCaseSort("assignedTo")}
                      >
                        {t("caseDetail.assignedTo")}
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={caseSort.field === "deadline"}
                        direction={caseSort.field === "deadline" ? caseSort.direction : "asc"}
                        onClick={() => toggleCaseSort("deadline")}
                      >
                        {t("caseDetail.deadline")}
                      </TableSortLabel>
                    </TableCell>
                    {showDescriptionNotesColumn && (
                      <TableCell>
                        <TableSortLabel
                          active={caseSort.field === "description"}
                          direction={caseSort.field === "description" ? caseSort.direction : "asc"}
                          onClick={() => toggleCaseSort("description")}
                        >
                          {t("app.description")}
                        </TableSortLabel>
                      </TableCell>
                    )}
                    {showDescriptionNotesColumn && (
                      <TableCell>
                        <TableSortLabel
                          active={caseSort.field === "notes"}
                          direction={caseSort.field === "notes" ? caseSort.direction : "asc"}
                          onClick={() => toggleCaseSort("notes")}
                        >
                          {t("app.notes")}
                        </TableSortLabel>
                      </TableCell>
                    )}
                    <TableCell>
                      {t("app.feeStatus")}
                    </TableCell>
                    {showFinancialAmountColumns && (
                      <TableCell>
                        <TableSortLabel
                          active={caseSort.field === "feeAmount"}
                          direction={caseSort.field === "feeAmount" ? caseSort.direction : "asc"}
                          onClick={() => toggleCaseSort("feeAmount")}
                        >
                          {t("app.totalFeeAmount")}
                        </TableSortLabel>
                      </TableCell>
                    )}
                    {showFinancialAmountColumns && (
                      <TableCell>
                        <TableSortLabel
                          active={caseSort.field === "feePaid"}
                          direction={caseSort.field === "feePaid" ? caseSort.direction : "asc"}
                          onClick={() => toggleCaseSort("feePaid")}
                        >
                          {t("app.totalFeePaid")}
                        </TableSortLabel>
                      </TableCell>
                    )}
                    <TableCell>
                      <TableSortLabel
                        active={caseSort.field === "updatedAt"}
                        direction={caseSort.field === "updatedAt" ? caseSort.direction : "asc"}
                        onClick={() => toggleCaseSort("updatedAt")}
                      >
                        {t("profile.latest10").includes("Latest") ? "Last updated" : "Cập nhật gần nhất"}
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    {canBatchAssign && <TableCell />}
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder={t("app.feeStatus")}
                        value={tableFilters.feeStatus || ""}
                        onChange={(e) =>
                          setTableFilters((prev) => ({ ...prev, feeStatus: e.target.value }))
                        }
                        autoComplete="off"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Lọc mã"
                        value={tableFilters.caseId}
                        onChange={(e) => setTableFilters((prev) => ({ ...prev, caseId: e.target.value }))}
                        autoComplete="off"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Lọc tên"
                        value={tableFilters.customerName}
                        onChange={(e) => setTableFilters((prev) => ({ ...prev, customerName: e.target.value }))}
                        autoComplete="off"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Lọc SĐT"
                        value={tableFilters.phone}
                        onChange={(e) => setTableFilters((prev) => ({ ...prev, phone: e.target.value }))}
                        autoComplete="off"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Lọc loại"
                        value={tableFilters.type}
                        onChange={(e) => setTableFilters((prev) => ({ ...prev, type: e.target.value }))}
                        autoComplete="off"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Lọc trạng thái"
                        value={tableFilters.status}
                        onChange={(e) => setTableFilters((prev) => ({ ...prev, status: e.target.value }))}
                        autoComplete="off"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Lọc người xử lý"
                        value={tableFilters.assignedTo}
                        onChange={(e) => setTableFilters((prev) => ({ ...prev, assignedTo: e.target.value }))}
                        autoComplete="off"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Lọc hạn chót"
                        value={tableFilters.deadline}
                        onChange={(e) => setTableFilters((prev) => ({ ...prev, deadline: e.target.value }))}
                        autoComplete="off"
                        fullWidth
                      />
                    </TableCell>
                    {showDescriptionNotesColumn && (
                      <TableCell>
                        <TextField
                          size="small"
                          placeholder="Lọc mô tả"
                          value={tableFilters.description}
                          onChange={(e) =>
                            setTableFilters((prev) => ({ ...prev, description: e.target.value }))
                          }
                          autoComplete="off"
                          fullWidth
                        />
                      </TableCell>
                    )}
                    {showDescriptionNotesColumn && (
                      <TableCell>
                        <TextField
                          size="small"
                          placeholder="Lọc ghi chú"
                          value={tableFilters.notes}
                          onChange={(e) => setTableFilters((prev) => ({ ...prev, notes: e.target.value }))}
                          autoComplete="off"
                          fullWidth
                        />
                      </TableCell>
                    )}
                    {showFinancialAmountColumns && (
                      <TableCell>
                        <TextField
                          size="small"
                          placeholder={t("app.totalFeeAmount")}
                          value={tableFilters.feeAmount}
                          onChange={(e) => setTableFilters((prev) => ({ ...prev, feeAmount: e.target.value }))}
                          autoComplete="off"
                          fullWidth
                        />
                      </TableCell>
                    )}
                    {showFinancialAmountColumns && (
                      <TableCell>
                        <TextField
                          size="small"
                          placeholder={t("app.totalFeePaid")}
                          value={tableFilters.feePaid}
                          onChange={(e) => setTableFilters((prev) => ({ ...prev, feePaid: e.target.value }))}
                          autoComplete="off"
                          fullWidth
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Lọc cập nhật"
                        value={tableFilters.updatedAt}
                        onChange={(e) => setTableFilters((prev) => ({ ...prev, updatedAt: e.target.value }))}
                        autoComplete="off"
                        fullWidth
                      />
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedCases.map((c) => {
                    const deadlineDate = c.deadline ? new Date(c.deadline) : null;
                    const isOverdue =
                      deadlineDate && deadlineDate < new Date() && c.status !== WORKFLOW_STATUS.ARCHIVED;
                    return (
                    <TableRow
                      key={c.id}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => {
                        setSelectedCase(c);
                        setOpenModal(true);
                      }}
                    >
                      {canBatchAssign && (
                        <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            size="small"
                            disabled={Boolean(c.isDeleted)}
                            checked={selectedBatchCaseIds.includes(c.id)}
                            onChange={() => toggleBatchCaseSelection(c.id)}
                            inputProps={{ "aria-label": `Chọn hồ sơ ${c.caseId}` }}
                          />
                        </TableCell>
                      )}
                      <TableCell sx={{ fontFamily: "monospace", fontWeight: 600 }}>{c.caseId}</TableCell>
                      <TableCell>{c.customerName}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell>{caseTypeText(c.type)}</TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                          <Chip
                            size="small"
                            label={statusText(c.status)}
                            sx={{
                              bgcolor: STATUS_COLORS[c.status],
                              color: "#fff",
                              fontWeight: 600,
                            }}
                          />
                          {isFinancialResetPending(c) && (
                            <Chip size="small" color="warning" variant="outlined" label="Đang làm lại tài chính" />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{c.assignedTo || "-"}</TableCell>
                      <TableCell>
                        {deadlineDate ? (
                          <Chip
                            size="small"
                            label={deadlineDate.toLocaleDateString(language === "vi" ? "vi-VN" : "en-US")}
                            color={isOverdue ? "error" : "default"}
                            variant={isOverdue ? "filled" : "outlined"}
                          />
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      {showDescriptionNotesColumn && (
                        <TableCell>
                          <Tooltip title={c.description || "-"} placement="top-start" arrow>
                            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                              {truncateText(c.description)}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                      )}
                      {showDescriptionNotesColumn && (
                        <TableCell>
                          <Tooltip title={c.notes || "-"} placement="top-start" arrow>
                            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                              {truncateText(c.notes)}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                      )}
                      <TableCell>
                        <Chip
                          size="small"
                          label={feeStatusText(getFeeStatus(c))}
                          color={
                            getFeeStatus(c) === FEE_STATUS.PAID_FULL
                              ? "success"
                              : getFeeStatus(c) === FEE_STATUS.PARTIAL
                                ? "warning"
                                : "default"
                          }
                          variant={getFeeStatus(c) === FEE_STATUS.UNPAID ? "outlined" : "filled"}
                        />
                      </TableCell>
                      {showFinancialAmountColumns && (
                        <TableCell>
                          {Number(c.feeAmount || 0).toLocaleString(language === "vi" ? "vi-VN" : "en-US")} đ
                        </TableCell>
                      )}
                      {showFinancialAmountColumns && (
                        <TableCell>
                          {Number(c.feePaid || 0).toLocaleString(language === "vi" ? "vi-VN" : "en-US")} đ
                        </TableCell>
                      )}
                      <TableCell>
                        {c.updatedAt
                          ? new Date(c.updatedAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")
                          : "-"}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={displayedCases.length}
                page={casePage}
                onPageChange={(_event, nextPage) => setCasePage(nextPage)}
                rowsPerPage={caseRowsPerPage}
                onRowsPerPageChange={(event) => {
                  const nextSize = Number(event.target.value) || 25;
                  setCaseRowsPerPage(nextSize);
                  setCasePage(0);
                }}
                rowsPerPageOptions={[10, 25, 50, 100]}
                labelRowsPerPage={t("common.rowsPerPage")}
                labelDisplayedRows={({ from, to, count }) =>
                  t("common.paginationDisplayedRows", { from, to, count })
                }
              />
            </TableContainer>
          </>
        ) : view === "dashboard" ? (
          <Box>
            <Typography variant="h5" mb={3} fontWeight="bold">
              {t("app.dashboardTitle")}
            </Typography>
            <Paper sx={{ mb: 2, borderRadius: 2 }}>
              <Tabs
                value={dashboardTab}
                onChange={(_e, nextValue) => setDashboardTab(nextValue)}
                sx={{ px: 1 }}
              >
                <Tab value="dashboard" label={t("app.dashboardTab")} />
                <Tab value="reports" label={t("app.reportsTab")} />
              </Tabs>
            </Paper>
            {dashboardTab === "reports" && (
            <Paper
              sx={{
                mb: 3,
                p: 2.5,
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              }}
            >
              <Typography variant="h6" fontWeight="bold" mb={0.5}>
                {t("app.reportExportsTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3} sx={{ lineHeight: 1.6 }}>
                {t("app.reportExportsHint")}
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 1.25,
                }}
              >
                {renderReportExportButton({
                  allowed: reportAccess.finance,
                  onClick: exportFeeKpi,
                  label: t("app.exportFeeKpiCsv"),
                })}
                {renderReportExportButton({
                  allowed: reportAccess.dashboardSummary,
                  onClick: exportDashboardSummary,
                  label: t("app.exportKpiCsv"),
                  variant: "contained",
                })}
                {renderReportExportButton({
                  allowed: reportAccess.caseList,
                  onClick: exportCaseList,
                  label: t("app.exportCaseCsv"),
                })}
                {renderReportExportButton({
                  allowed: reportAccess.notaryRegister,
                  onClick: exportNotaryRegister,
                  label: t("app.exportNotaryRegister"),
                })}
                {renderReportExportButton({
                  allowed: reportAccess.operations,
                  onClick: () => exportEnterpriseReport("operations"),
                  label: t("app.exportOperationsCsv"),
                })}
                {renderReportExportButton({
                  allowed: reportAccess.staff,
                  onClick: () => exportEnterpriseReport("staff"),
                  label: t("app.exportStaffCsv"),
                })}
                {renderReportExportButton({
                  allowed: reportAccess.finance,
                  onClick: () => exportEnterpriseReport("finance"),
                  label: t("app.exportFinanceCsv"),
                })}
                {renderReportExportButton({
                  allowed: reportAccess.legal,
                  onClick: () => exportEnterpriseReport("legal"),
                  label: t("app.exportLegalComplianceCsv"),
                })}
              </Box>
              {!hasAnyReportExportAccess && (
                <Typography variant="body2" color="warning.main" mt={1.5}>
                  {t("app.noReportExportPermission")}
                </Typography>
              )}
            </Paper>
            )}
            {dashboardTab === "reports" && (
              <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
                <Typography variant="h6" mb={2} fontWeight="bold">
                  {t("app.feeKpiTitle")}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2 }}>
                  {[
                    {
                      label: t("app.totalFeeAmount"),
                      value: cases.reduce((sum, item) => sum + Number(item.feeAmount || 0), 0),
                      color: "primary.main",
                    },
                    {
                      label: t("app.totalFeePaid"),
                      value: cases.reduce((sum, item) => sum + Number(item.feePaid || 0), 0),
                      color: "success.main",
                    },
                    {
                      label: t("app.totalFeeOutstanding"),
                      value: Math.max(
                        0,
                        cases.reduce((sum, item) => sum + Number(item.feeAmount || 0), 0) -
                          cases.reduce((sum, item) => sum + Number(item.feePaid || 0), 0)
                      ),
                      color: "warning.main",
                    },
                    {
                      label: t("app.feeStatusUnpaid"),
                      value: cases.filter((item) => getFeeStatus(item) === FEE_STATUS.UNPAID).length,
                      color: "text.primary",
                    },
                    {
                      label: t("app.feeStatusPartial"),
                      value: cases.filter((item) => getFeeStatus(item) === FEE_STATUS.PARTIAL).length,
                      color: "text.primary",
                    },
                    {
                      label: t("app.feeStatusPaidFull"),
                      value: cases.filter((item) => getFeeStatus(item) === FEE_STATUS.PAID_FULL).length,
                      color: "text.primary",
                    },
                    {
                      label: t("app.paymentMethodCash"),
                      value: cases.filter((item) => getPaymentMethod(item) === PAYMENT_METHOD.CASH).length,
                      color: "text.primary",
                    },
                    {
                      label: t("app.paymentMethodBankTransfer"),
                      value: cases.filter((item) => getPaymentMethod(item) === PAYMENT_METHOD.BANK_TRANSFER).length,
                      color: "text.primary",
                    },
                  ].map((item) => (
                    <Paper key={item.label} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        {item.label}
                      </Typography>
                      <Typography variant="h5" sx={{ mt: 0.5, color: item.color, fontWeight: 700 }}>
                        {Number(item.value).toLocaleString(language === "vi" ? "vi-VN" : "en-US")}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </Paper>
            )}

            {/* KPI CARDS + MY WORK QUEUE */}
            {dashboardTab === "dashboard" && (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.2fr 2fr" }, gap: 2.5, mb: 3 }}>
                <Paper sx={{ p: 3, borderRadius: 2 }}>
                  <Typography variant="h6" fontWeight="bold" mb={0.5}>
                    {t("app.dashboardMyQueueTitle")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {t("app.dashboardMyQueueHint")}
                  </Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, mb: 2 }}>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">{t("app.dashboardMyQueueAssigned")}</Typography>
                      <Typography variant="h6" fontWeight="bold">{myAssignedCaseCount}</Typography>
                    </Paper>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">{t("app.dashboardMyQueueUnassigned")}</Typography>
                      <Typography variant="h6" fontWeight="bold">{unassignedQueueCount}</Typography>
                    </Paper>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">{t("app.dashboardMyQueueOverdue")}</Typography>
                      <Typography variant="h6" fontWeight="bold" color="error.main">{overdueCaseCount}</Typography>
                    </Paper>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">{t("app.dashboardMyQueueDueSoon")}</Typography>
                      <Typography variant="h6" fontWeight="bold" color="warning.main">{dueSoonCaseCount}</Typography>
                    </Paper>
                  </Box>
                  {dashboardRelatedCasePreview.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {t("app.dashboardMyQueueEmpty")}
                    </Typography>
                  ) : (
                    <Stack spacing={1.2}>
                      {dashboardRelatedCasePreview.map((item) => (
                        <Box
                          key={item.id}
                          sx={{
                            p: 1.2,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1.5,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1,
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {item.caseId || `#${item.id}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {(item.customerName || "-")} - {statusText(item.status)}
                            </Typography>
                          </Box>
                          <Button
                            size="small"
                            onClick={() => {
                              setSelectedCase(item);
                              setOpenModal(true);
                            }}
                          >
                            {t("common.view")}
                          </Button>
                        </Box>
                      ))}
                    </Stack>
                  )}
                  <Button size="small" sx={{ mt: 1.5 }} onClick={() => openCaseListWithFilter("ALL")}>
                    {t("app.dashboardMyQueueSeeAll")}
                  </Button>
                </Paper>

                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2.5 }}>
                  <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary" mb={1}>{t("app.totalCases")}</Typography>
                    <Typography variant="h4" color="primary" fontWeight="bold">
                      {dashboardStats?.kpi?.totalCases ?? cases.length}
                    </Typography>
                    <Button size="small" sx={{ mt: 1 }} onClick={() => openCaseListWithFilter("ALL")}>
                      {t("common.view")}
                    </Button>
                  </Paper>

                  <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary" mb={1}>{t("app.receivedCases")}</Typography>
                    <Typography variant="h4" color="info.main" fontWeight="bold">
                      {cases.filter(
                        (c) => c.status === WORKFLOW_STATUS.RECEIVED && !c.assignedTo && !c.isDeleted
                      ).length}
                    </Typography>
                    <Button size="small" sx={{ mt: 1 }} onClick={() => openCaseListWithFilter("RECEIVED_UNASSIGNED")}>
                      {t("common.view")}
                    </Button>
                  </Paper>

                  <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary" mb={1}>{t("app.activeCases")}</Typography>
                    <Typography variant="h4" color="warning.main" fontWeight="bold">
                      {cases.filter(
                        (c) =>
                          Boolean(c.assignedTo) &&
                          !c.isDeleted &&
                          c.status !== WORKFLOW_STATUS.ARCHIVED &&
                          c.status !== WORKFLOW_STATUS.CANCELLED
                      ).length}
                    </Typography>
                    <Button size="small" sx={{ mt: 1 }} onClick={() => openCaseListWithFilter("ACTIVE")}>
                      {t("common.view")}
                    </Button>
                  </Paper>

                  <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary" mb={1}>{t("app.doneCases")}</Typography>
                    <Typography variant="h4" color="success.main" fontWeight="bold">
                      {dashboardStats?.kpi?.archivedCases ??
                        cases.filter((c) => c.status === WORKFLOW_STATUS.ARCHIVED).length}
                    </Typography>
                    <Button size="small" sx={{ mt: 1 }} onClick={() => openCaseListWithFilter("ARCHIVED")}>
                      {t("common.view")}
                    </Button>
                  </Paper>

                  <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary" mb={1}>{t("app.totalCustomers")}</Typography>
                    <Typography variant="h4" color="info.main" fontWeight="bold">
                      {dashboardStats?.kpi?.totalCustomers ?? customers.length}
                    </Typography>
                    <Button
                      size="small"
                      sx={{ mt: 1 }}
                      onClick={() => {
                        setFocusedCustomerId(null);
                        setView("customers");
                      }}
                    >
                      {t("common.view")}
                    </Button>
                  </Paper>
                </Box>
              </Box>
            )}

            {/* DETAILED STATS */}
            {dashboardTab === "dashboard" && (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 3, mb: 3 }}>
              {/* Thống kê theo trạng thái */}
              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" mb={2} fontWeight="bold">{t("app.caseStatuses")}</Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  {[
                    {
                      key: "RECEIVED_UNASSIGNED",
                      label: t("app.receivedCases"),
                      color: STATUS_COLORS[WORKFLOW_STATUS.RECEIVED],
                      count: cases.filter(
                        (c) => c.status === WORKFLOW_STATUS.RECEIVED && !c.assignedTo && !c.isDeleted
                      ).length,
                    },
                    {
                      key: "ACTIVE_ASSIGNED",
                      label: t("app.activeCases"),
                      color: STATUS_COLORS[WORKFLOW_STATUS.LEGAL_CHECKING],
                      count: cases.filter(
                        (c) =>
                          Boolean(c.assignedTo) &&
                          !c.isDeleted &&
                          c.status !== WORKFLOW_STATUS.ARCHIVED &&
                          c.status !== WORKFLOW_STATUS.CANCELLED
                      ).length,
                    },
                    ...Object.entries(WORKFLOW_STATUS_LABELS)
                      .filter(([status]) => status !== WORKFLOW_STATUS.RECEIVED)
                      .map(([status, label]) => ({
                        key: status,
                        label,
                        color: STATUS_COLORS[status],
                        count:
                          dashboardStats?.byStatus?.[status] ??
                          cases.filter((c) => c.status === status).length,
                      })),
                  ].map((item) => {
                    const percentage = cases.length > 0 ? (item.count / cases.length * 100).toFixed(1) : 0;
                    return (
                      <Box key={item.key} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2">{item.label}</Typography>
                          <LinearProgress 
                            variant="determinate" 
                            value={Number(percentage)}
                            sx={{ height: 6, borderRadius: 3, bgcolor: '#e0e0e0', '& .MuiLinearProgress-bar': { bgcolor: item.color } }}
                          />
                        </Box>
                        <Typography variant="body2" fontWeight="bold" sx={{ ml: 2, minWidth: 70, textAlign: "right" }}>
                          {item.count} ({percentage}%)
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Paper>

              {/* Thống kê theo loại giao dịch */}
              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" mb={2} fontWeight="bold">{t("app.transactionTypes")}</Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  {Object.entries(dashboardStats?.byType || {}).map(([type, count]) => {
                    return (
                      <Box
                        key={type}
                        onClick={() => openCaseListWithType(type)}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          borderRadius: 1,
                          px: 1,
                          py: 0.5,
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <Typography variant="body2">{caseTypeText(type)}</Typography>
                        <Typography variant="body2" fontWeight="bold" color="primary">
                          {count}
                        </Typography>
                      </Box>
                    );
                  }) ||
                    [...new Set(cases.map((c) => c.type))].map((type) => {
                      const count = cases.filter((c) => c.type === type).length;
                      return (
                        <Box
                          key={type}
                          onClick={() => openCaseListWithType(type)}
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            borderRadius: 1,
                            px: 1,
                            py: 0.5,
                            "&:hover": { bgcolor: "action.hover" },
                          }}
                        >
                          <Typography variant="body2">{caseTypeText(type)}</Typography>
                          <Typography variant="body2" fontWeight="bold" color="primary">
                            {count}
                          </Typography>
                        </Box>
                      );
                    })}
                </Box>
              </Paper>
            </Box>
            )}

            {/* CUSTOMER LIST */}
            {dashboardTab === "reports" && dashboardCustomers.length > 0 && (
              <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
                <Typography variant="h6" mb={2} fontWeight="bold">{t("app.customerList")}</Typography>
                <Tooltip
                  arrow
                  title={`Đang sắp xếp theo "${DASHBOARD_CUSTOMER_SORT_LABELS[dashboardCustomerSort.field]}": ${
                    dashboardCustomerSort.direction === "asc" ? "tăng dần" : "giảm dần"
                  }`}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                    ↕ Sắp xếp: {DASHBOARD_CUSTOMER_SORT_LABELS[dashboardCustomerSort.field]} (
                    {dashboardCustomerSort.direction === "asc" ? "A→Z" : "Z→A"})
                  </Typography>
                </Tooltip>
                <TableContainer>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: "#f8fafc" }}>
                      <TableRow>
                        <TableCell>
                          <TableSortLabel
                            active={dashboardCustomerSort.field === "customerId"}
                            direction={
                              dashboardCustomerSort.field === "customerId"
                                ? dashboardCustomerSort.direction
                                : "asc"
                            }
                            onClick={() => toggleDashboardCustomerSort("customerId")}
                          >
                            {t("customers.customerCode")}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel
                            active={dashboardCustomerSort.field === "fullName"}
                            direction={
                              dashboardCustomerSort.field === "fullName"
                                ? dashboardCustomerSort.direction
                                : "asc"
                            }
                            onClick={() => toggleDashboardCustomerSort("fullName")}
                          >
                            {t("customers.fullName")}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel
                            active={dashboardCustomerSort.field === "phone"}
                            direction={
                              dashboardCustomerSort.field === "phone"
                                ? dashboardCustomerSort.direction
                                : "asc"
                            }
                            onClick={() => toggleDashboardCustomerSort("phone")}
                          >
                            {t("customers.phone")}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel
                            active={dashboardCustomerSort.field === "email"}
                            direction={
                              dashboardCustomerSort.field === "email"
                                ? dashboardCustomerSort.direction
                                : "asc"
                            }
                            onClick={() => toggleDashboardCustomerSort("email")}
                          >
                            {t("customers.email")}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="center">
                          <TableSortLabel
                            active={dashboardCustomerSort.field === "linkedCases"}
                            direction={
                              dashboardCustomerSort.field === "linkedCases"
                                ? dashboardCustomerSort.direction
                                : "asc"
                            }
                            onClick={() => toggleDashboardCustomerSort("linkedCases")}
                          >
                            {t("app.linkedCases")}
                          </TableSortLabel>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dashboardCustomers.map((customer) => (
                        <TableRow key={customer.id} hover>
                          <TableCell sx={{ fontFamily: "monospace" }}>
                            <Button
                              size="small"
                              onClick={() => openCustomerManagementWithFocus(customer.id)}
                              sx={{ textTransform: "none", p: 0, fontFamily: "monospace" }}
                            >
                              {customer.customerId}
                            </Button>
                          </TableCell>
                          <TableCell>{customer.fullName}</TableCell>
                          <TableCell>{customer.phone || "-"}</TableCell>
                          <TableCell>{customer.email || "-"}</TableCell>
                          <TableCell align="center">
                            <Button size="small" onClick={() => openCaseListForCustomer(customer)}>
                              {customer.linkedCases}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}

            {/* RECENT ACTIVITY */}
            {dashboardTab === "reports" && (
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="h6" mb={2} fontWeight="bold">{t("app.recentActivity")}</Typography>
              <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
                {(dashboardStats?.recentCases || cases.slice().reverse().slice(0, 10)).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("common.noData")}
                  </Typography>
                ) : (
                  (dashboardStats?.recentCases || cases.slice().reverse().slice(0, 10)).map((c, idx) => (
                    <Box
                      key={c.id}
                      sx={{
                        py: 1,
                        borderBottom: idx < 9 ? "1px solid #eee" : "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight="500">
                          {c.customerName || "-"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {c.caseId} • {caseTypeText(c.type)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {t("common.updatedAt")}: {c.updatedAt ? new Date(c.updatedAt).toLocaleString("vi-VN") : "-"}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <Chip label={statusText(c.status)} size="small" sx={{ bgcolor: STATUS_COLORS[c.status], color: "white" }} />
                        {isFinancialResetPending(c) && (
                          <Chip size="small" color="warning" variant="outlined" label="Đang làm lại tài chính" />
                        )}
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            </Paper>
            )}
          </Box>
        ) : view === "customers" ? (
          <CustomerManagement
            currentUser={user}
            focusCustomerId={focusedCustomerId}
            onFocusConsumed={() => setFocusedCustomerId(null)}
          />
        ) : view === "receipts" ? (
          <ReceiptManagement
            cases={cases}
            focusCaseId={focusedReceiptCaseId}
            onFocusConsumed={() => setFocusedReceiptCaseId(null)}
            toastApi={toastApi}
          />
        ) : view === "profile" ? (
          <ProfileManagement
            user={user}
            onUserUpdated={(nextUser) => {
              setUser(nextUser);
              localStorage.setItem("user", JSON.stringify(nextUser));
            }}
            onRequireRelogin={logout}
          />
        ) : view === "templates" ? (
          <TemplateManagement userRole={normalizedUserRole} username={user?.username} />
        ) : view === "translators" ? (
          <TranslatorManagement />
        ) : (
          <UserManagement currentUser={user} />
        )}
      </Box>

      {/* MODAL */}
      <CreateCaseDialog
        open={createCaseDialogOpen}
        onClose={() => setCreateCaseDialogOpen(false)}
        customers={customers}
        onCreated={() => {
          fetchCases();
          fetchCustomers();
          fetchDashboardStats();
        }}
        toastApi={toastApi}
      />
      <CaseDetailModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        caseData={selectedCase}
        onStatusUpdate={updateStatus}
        onCaseDeleted={() => {
          setOpenModal(false);
          fetchCases();
          fetchDashboardStats();
        }}
        currentUser={user}
        workflowStatus={WORKFLOW_STATUS}
        statusLabels={WORKFLOW_STATUS_LABELS}
        statusColors={STATUS_COLORS}
        getNextStatuses={getNextStatuses}
        onOpenReceiptManagement={(caseItem) => {
          setOpenModal(false);
          setFocusedReceiptCaseId(caseItem?.id || null);
          setView("receipts");
        }}
      />
      <Drawer
        anchor="right"
        open={notificationDrawerOpen}
        onClose={() => setNotificationDrawerOpen(false)}
      >
        <Box sx={{ width: 380, p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="h6">
              {t("app.notifications")} ({unreadCount})
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button size="small" onClick={markAllNotificationsAsRead} disabled={unreadCount === 0}>
                {t("app.markAllRead")}
              </Button>
              <Button
                size="small"
                color="error"
                onClick={clearReadNotifications}
                disabled={notifications.filter((item) => item.status === "read").length === 0}
              >
                {t("app.clearRead")}
              </Button>
            </Box>
          </Box>
          <Divider sx={{ mb: 1 }} />
          <List>
            {notifications.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t("app.noNotifications")}
              </Typography>
            )}
            {notifications.map((item) => (
              <ListItem key={item.id} disablePadding sx={{ mb: 1 }}>
                <ListItemButton
                  onClick={() => handleNotificationClick(item)}
                  sx={{
                    borderRadius: 1,
                    bgcolor: item.status === "unread" ? "#f3f6ff" : "transparent",
                  }}
                >
                  <ListItemText
                    primary={item.message}
                    secondary={new Date(item.createdAt).toLocaleString("vi-VN")}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
      <Dialog
        open={confirmStatusChange.open}
        onClose={() => setConfirmStatusChange({ open: false, id: null, nextStatus: "", notes: "" })}
      >
        <DialogTitle>{t("app.confirmStatusChange")}</DialogTitle>
        <DialogContent>
          {t("app.confirmStatusChangeText", {
            status: statusText(confirmStatusChange.nextStatus),
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmStatusChange({ open: false, id: null, nextStatus: "", notes: "" })}>
            {t("common.cancel")}
          </Button>
          <Button variant="contained" onClick={doUpdateStatus}>
            {t("common.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
      <DirectChatWidget currentUser={user} toastApi={toastApi} />
      <ToastHost toast={toast} onClose={closeToast} />
    </Box>
  );
}
