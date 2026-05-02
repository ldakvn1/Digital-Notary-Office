import { API_BASE } from "./apiBase";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
  LinearProgress,
  Paper,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Tooltip,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useEffect, useState } from "react";
import axios from "axios";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { viVN } from "@mui/x-date-pickers/locales";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";
import { FILE_TYPES } from "./constants/fileTypes";
import { getAuditActionLabel, getCaseTypeLabel } from "./utils/displayLabels";

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

export default function CaseDetailModal({
  open,
  onClose,
  caseData,
  onStatusUpdate,
  onCaseDeleted,
  currentUser,
  workflowStatus,
  statusLabels,
  statusColors,
  getNextStatuses,
  onOpenReceiptManagement,
}) {
  const { t, language } = useI18n();
  const [file, setFile] = useState([]);
  const [fileType, setFileType] = useState("OTHER");
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [activeCase, setActiveCase] = useState(caseData || {});
  const [deadline, setDeadline] = useState("");
  const [aiHints, setAiHints] = useState([]);
  const [riskWarnings, setRiskWarnings] = useState([]);
  const [confirmAction, setConfirmAction] = useState({ open: false, type: "", payload: null });
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [feeAmount, setFeeAmount] = useState(0);
  const [feePaid, setFeePaid] = useState(0);
  const [feeReceiptNo, setFeeReceiptNo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [signedPdfFile, setSignedPdfFile] = useState(null);
  const [signerName, setSignerName] = useState("");
  const [certificateSerial, setCertificateSerial] = useState("");
  const [signatureProvider, setSignatureProvider] = useState("");
  const [publicTrackingPath, setPublicTrackingPath] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [inheritanceNotes, setInheritanceNotes] = useState("");
  const [inheritanceResult, setInheritanceResult] = useState("");
  const [copyRequests, setCopyRequests] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [copyForm, setCopyForm] = useState({
    requesterName: "",
    requesterIdNumber: "",
    requesterRelation: "",
    legalBasis: "",
    notes: "",
  });
  const [copyRejection, setCopyRejection] = useState({ id: null, reason: "" });
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [detailTab, setDetailTab] = useState(0);
  const [financialResetOpen, setFinancialResetOpen] = useState(false);
  const [financialResetReason, setFinancialResetReason] = useState("");
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const normalizedCurrentUserRole = normalizeRoleKey(currentUser?.role);
  const isAccountantRole = normalizedCurrentUserRole === "accountant";
  const canUpdateCaseStatusByRole = ["admin", "notary_officer", "staff"].includes(normalizedCurrentUserRole);
  const canAssignCase = ["admin", "notary_officer"].includes(normalizedCurrentUserRole);
  const canManageReceipts = ["admin", "accountant"].includes(normalizedCurrentUserRole);
  const currentAssigneeUsername = String(
    activeCase?.assignedTo || caseData?.assignedTo || ""
  )
    .trim()
    .toLowerCase();
  const currentUsername = String(currentUser?.username || "").trim().toLowerCase();
  const isAssignableOption = (candidateUser) => {
    const username = String(candidateUser?.username || "").trim().toLowerCase();
    if (!username) return false;
    const isSelf = username === currentUsername;
    const hasAssignee = Boolean(currentAssigneeUsername);
    const isCurrentAssignee = username === currentAssigneeUsername;

    // Never show the current assignee in reassignment dropdown.
    if (isCurrentAssignee) return false;

    if (normalizedCurrentUserRole === "admin") {
      // Admin only hides self when case is already assigned to self.
      return true;
    }
    if (normalizedCurrentUserRole === "notary_officer") {
      // Notary officer can self-assign only when case is unassigned.
      if (isSelf) return !hasAssignee;
      return true;
    }
    return false;
  };
  const formatAssigneeLabel = (user) => {
    const username = String(user?.username || "").trim();
    const fullName = String(user?.fullName || "").trim();
    if (fullName && fullName.toLowerCase() !== username.toLowerCase()) {
      return `${fullName} (${username})`;
    }
    return fullName || username;
  };

  const REQUIRED_FILES_BY_CASE_TYPE = {
    "Mua bán": ["CCCD", "CONTRACT", "LAND_CERT"],
    "Ủy quyền": ["CCCD", "CONTRACT"],
    "Thừa kế": ["CCCD", "CONTRACT", "LAND_CERT"],
    "Di chúc": ["CCCD"],
    "Chứng thực": ["CCCD"],
    "Khác": ["CCCD"],
  };

  const fetchUsers = async () => {
    if (!canAssignCase) {
      setUsers([]);
      return;
    }
    try {
      const res = await axios.get(API_BASE + "/users");
      const allUsers = Array.isArray(res.data) ? res.data : [];
      const assignableUsers = allUsers.filter((item) => {
        const roleKey = normalizeRoleKey(item?.role);
        const isAssignableRole = ["admin", "notary_officer"].includes(roleKey);
        const isActive = item?.isActive !== false;
        return isAssignableRole && isActive && isAssignableOption(item);
      });
      setUsers(assignableUsers);
    } catch (err) {
      console.error("Error fetching users:", err);
      setUsers([]);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(API_BASE + "/templates");
      setTemplates(
        Array.isArray(res.data)
          ? res.data.filter((item) => item.isActive && String(item.status || "").toUpperCase() === "APPROVED")
          : []
      );
    } catch (err) {
      console.error("Error fetching templates:", err);
      setTemplates([]);
    }
  };

  const fetchCase = async (caseIdArg = null) => {
    try {
      const caseId = caseIdArg || activeCase.id || caseData?.id;
      if (!caseId) return;
      const res = await axios.get(`${API_BASE}/cases/${caseId}`);
      setActiveCase(res.data);
      setDeadline(
        res.data.deadline ? new Date(res.data.deadline).toISOString().slice(0, 10) : ""
      );
      setFeeAmount(res.data.feeAmount || 0);
      setFeePaid(res.data.feePaid || 0);
      setFeeReceiptNo(res.data.feeReceiptNo || "");
      setPaymentMethod(String(res.data.paymentMethod || "CASH").toUpperCase());
      setPublicTrackingPath(
        res.data.publicTrackingEnabled && res.data.publicTrackingCode
          ? `/track/${res.data.publicTrackingCode}`
          : ""
      );
      await fetchRiskWarnings(caseId);
    } catch (err) {
      console.error("Error fetching case:", err);
    }
  };

  const fetchRiskWarnings = async (caseId) => {
    try {
      const res = await axios.get(`${API_BASE}/cases/${caseId}/risk-warnings`);
      setRiskWarnings(res.data?.warnings || []);
    } catch (err) {
      console.error("Error fetching risk warnings:", err);
      setRiskWarnings([]);
    }
  };

  const fetchCopyRequests = async (caseId) => {
    try {
      const res = await axios.get(`${API_BASE}/cases/${caseId}/copy-requests`);
      setCopyRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching copy requests:", err);
      setCopyRequests([]);
    }
  };
  const fetchReceipts = async (caseId) => {
    try {
      const res = await axios.get(`${API_BASE}/cases/${caseId}/receipts`);
      setReceipts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching receipts:", err);
      setReceipts([]);
    }
  };

  const startInheritancePosting = async () => {
    try {
      const res = await axios.post(
        `${API_BASE}/cases/${activeCase.id || caseData.id}/inheritance/start-posting`,
        { notes: inheritanceNotes || "" }
      );
      setActiveCase(res.data);
      toastApi.success(t("inheritance.startSuccess"));
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || t("app.updateStatusError"));
    }
  };

  const finalizeInheritancePosting = async () => {
    if (!inheritanceResult) {
      toastApi.warning(t("inheritance.requireResult"));
      return;
    }
    try {
      const res = await axios.post(
        `${API_BASE}/cases/${activeCase.id || caseData.id}/inheritance/finalize-posting`,
        { result: inheritanceResult, notes: inheritanceNotes || "" }
      );
      setActiveCase(res.data);
      toastApi.success(t("inheritance.finalizeSuccess"));
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || t("app.updateStatusError"));
    }
  };

  const submitCopyRequest = async () => {
    if (!copyForm.requesterName.trim() || !copyForm.requesterRelation.trim()) {
      toastApi.warning(t("copyRequest.requireFields"));
      return;
    }
    try {
      await axios.post(
        `${API_BASE}/cases/${activeCase.id || caseData.id}/copy-requests`,
        copyForm
      );
      setCopyForm({
        requesterName: "",
        requesterIdNumber: "",
        requesterRelation: "",
        legalBasis: "",
        notes: "",
      });
      await fetchCopyRequests(activeCase.id || caseData.id);
      toastApi.success(t("copyRequest.createSuccess"));
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || t("app.updateStatusError"));
    }
  };

  const approveCopyRequest = async (id) => {
    try {
      await axios.post(`${API_BASE}/copy-requests/${id}/approve`, {});
      await fetchCopyRequests(activeCase.id || caseData.id);
      toastApi.success(t("copyRequest.approveSuccess"));
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || t("app.updateStatusError"));
    }
  };

  const rejectCopyRequest = async (id) => {
    if (!copyRejection.reason.trim()) {
      toastApi.warning(t("copyRequest.rejectionReason"));
      return;
    }
    try {
      await axios.post(`${API_BASE}/copy-requests/${id}/reject`, {
        rejectionReason: copyRejection.reason,
      });
      setCopyRejection({ id: null, reason: "" });
      await fetchCopyRequests(activeCase.id || caseData.id);
      toastApi.success(t("copyRequest.rejectSuccess"));
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || t("app.updateStatusError"));
    }
  };

  const issueCopyRequest = async (id) => {
    try {
      await axios.post(`${API_BASE}/copy-requests/${id}/issue`, {});
      await fetchCopyRequests(activeCase.id || caseData.id);
      toastApi.success(t("copyRequest.issueSuccess"));
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || t("app.updateStatusError"));
    }
  };

  useEffect(() => {
    if (open && caseData) {
      setActiveCase(caseData);
      setDeadline(
        caseData.deadline ? new Date(caseData.deadline).toISOString().slice(0, 10) : ""
      );
      setFeeAmount(caseData.feeAmount || 0);
      setFeePaid(caseData.feePaid || 0);
      setFeeReceiptNo(caseData.feeReceiptNo || "");
      setPaymentMethod(String(caseData.paymentMethod || "CASH").toUpperCase());
      setPublicTrackingPath(
        caseData.publicTrackingEnabled && caseData.publicTrackingCode
          ? `/track/${caseData.publicTrackingCode}`
          : ""
      );
      setInheritanceNotes(caseData.inheritancePostingNotes || "");
      setInheritanceResult(caseData.inheritancePostingResult || "");
      fetchCase(caseData.id);
      fetchRiskWarnings(caseData.id);
      fetchUsers();
      fetchTemplates();
      fetchCopyRequests(caseData.id);
      fetchReceipts(caseData.id);
    }
  }, [open, caseData, canAssignCase, currentUser?.username, currentAssigneeUsername, normalizedCurrentUserRole]);

  const assignCase = async () => {
    if (!selectedUser) {
      toastApi.warning(t("caseDetail.chooseHandler"));
      return;
    }
    setConfirmAction({ open: true, type: "assign", payload: selectedUser });
  };

  const saveFeeInfo = async () => {
    if (feeAmountViolatesCheckpoint) {
      toastApi.warning(feeAmountCheckpointHint);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.put(`${API_BASE}/cases/${activeCase.id || caseData.id}/fee`, {
        feeAmount: Number(feeAmount || 0),
        paymentMethod,
      });
      setActiveCase(res.data);
      toastApi.success("Đã cập nhật Tổng chi phí");
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data?.message || "Không thể cập nhật phí");
    } finally {
      setLoading(false);
    }
  };

  const issueNotaryRecord = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/cases/${activeCase.id || caseData.id}/issue`);
      setActiveCase(res.data);
      toastApi.success("Đã phát hành số công chứng và khóa hồ sơ");
    } catch (err) {
      console.error(err);
      const message = err?.response?.data?.message || err?.response?.data || "Không thể phát hành số";
      toastApi.error(message);
    } finally {
      setLoading(false);
    }
  };
  const resetFinancialFlow = async () => {
    if (!activeCase?.id) return;
    if (financialResetReason.trim().length < 5) {
      toastApi.warning("Vui lòng nhập lý do khởi tạo lại tối thiểu 5 ký tự.");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/cases/${activeCase.id}/financial-reset`, {
        reason: financialResetReason.trim(),
      });
      setActiveCase(res.data);
      await fetchReceipts(activeCase.id);
      setFinancialResetOpen(false);
      setFinancialResetReason("");
      toastApi.success("Đã khởi tạo lại tài chính hồ sơ. Accountant có thể thu phí lại từ đầu.");
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || "Không thể khởi tạo lại tài chính hồ sơ.");
    } finally {
      setLoading(false);
    }
  };

  const unlockCase = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/cases/${activeCase.id || caseData.id}/unlock`);
      setActiveCase(res.data);
      toastApi.success("Đã mở khóa hồ sơ");
    } catch (err) {
      console.error(err);
      toastApi.error("Không thể mở khóa hồ sơ");
    } finally {
      setLoading(false);
    }
  };

  const generateDocument = async () => {
    if (!selectedTemplateId) {
      toastApi.warning("Vui lòng chọn biểu mẫu");
      return;
    }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/cases/${activeCase.id || caseData.id}/generate-document`, {
        templateId: Number(selectedTemplateId),
      });
      await fetchCase();
      setDetailTab(2);
      const generatedFilename = data?.file?.filename;
      toastApi.success(
        generatedFilename
          ? `Đã sinh văn bản: ${generatedFilename}. Đã chuyển sang tab Tài liệu.`
          : "Đã sinh văn bản từ biểu mẫu. Đã chuyển sang tab Tài liệu."
      );
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || "Không thể sinh văn bản");
    } finally {
      setLoading(false);
    }
  };

  const signCase = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/cases/${activeCase.id || caseData.id}/sign`);
      setActiveCase(res.data);
      toastApi.success("Đã ký duyệt hồ sơ");
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || "Không thể ký duyệt");
    } finally {
      setLoading(false);
    }
  };

  const sealCase = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/cases/${activeCase.id || caseData.id}/seal`);
      setActiveCase(res.data);
      toastApi.success("Đã đóng dấu hồ sơ");
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || "Không thể đóng dấu");
    } finally {
      setLoading(false);
    }
  };

  const releaseCase = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/cases/${activeCase.id || caseData.id}/release`, {
        templateId: selectedTemplateId ? Number(selectedTemplateId) : undefined,
      });
      await fetchCase();
      toastApi.success("Đã phát hành bản PDF chính thức");
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || "Không thể phát hành");
    } finally {
      setLoading(false);
    }
  };

  const uploadSignedPdf = async () => {
    if (!signedPdfFile) {
      toastApi.warning("Vui lòng chọn tài liệu PDF đã ký");
      return;
    }
    const formData = new FormData();
    formData.append("file", signedPdfFile);
    formData.append("signerName", signerName || "");
    formData.append("certificateSerial", certificateSerial || "");
    formData.append("signatureProvider", signatureProvider || "");
    setLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/cases/${activeCase.id || caseData.id}/upload-signed-pdf`,
        formData
      );
      setActiveCase(res.data.case);
      await fetchCase();
      toastApi.success(res.data?.message || "Đã tải lên bản ký số");
      setSignedPdfFile(null);
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || "Không thể tải lên tài liệu ký số");
    } finally {
      setLoading(false);
    }
  };

  const deleteCase = async () => {
    if (!activeCase?.id) return;
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/cases/${activeCase.id}`, {
        data: { reason: deleteReason || "Administrative deletion" },
      });
      toastApi.success("Đã hủy/xóa mềm hồ sơ");
      onCaseDeleted?.();
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || "Không thể xóa hồ sơ");
    } finally {
      setLoading(false);
      setDeleteReason("");
    }
  };

  const restoreCase = async () => {
    if (!activeCase?.id) return;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/cases/${activeCase.id}/restore`);
      toastApi.success("Đã khôi phục hồ sơ");
      onCaseDeleted?.();
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || "Không thể khôi phục hồ sơ");
    } finally {
      setLoading(false);
    }
  };

  const doAssignCase = async () => {
    setConfirmAction({ open: false, type: "", payload: null });
    setLoading(true);
    try {
      const res = await axios.put(`${API_BASE}/cases/${activeCase.id || caseData.id}/assign`, {
        assignedTo: selectedUser,
      });
      setActiveCase(res.data);
      toastApi.success(t("caseDetail.assignBtn"));
      setSelectedUser("");
    } catch (err) {
      console.error(err);
      toastApi.error(t("users.deleteError"));
    } finally {
      setLoading(false);
    }
  };

  const saveDeadline = async () => {
    if (!deadline) {
      toastApi.warning(t("caseDetail.setDeadline"));
      return;
    }

    setLoading(true);
    try {
      const res = await axios.put(`${API_BASE}/cases/${activeCase.id || caseData.id}/deadline`, {
        deadline,
      });
      setActiveCase(res.data);
      toastApi.success(t("caseDetail.updateDeadline"));
    } catch (err) {
      console.error(err);
      toastApi.error(t("app.updateStatusError"));
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async () => {
    if (!file || file.length === 0) {
      toastApi.warning(t("caseDetail.uploadDocs"));
      return;
    }

    const formData = new FormData();
    Array.from(file).forEach((singleFile) => {
      formData.append("files", singleFile);
      formData.append("fileTypes", fileType);
    });

    try {
      setLoading(true);
      setProgress(0);

      const response = await axios.post(
        `${API_BASE}/upload/${activeCase.id || caseData?.id}`,
        formData,
        {
          onUploadProgress: (event) => {
            const percent = Math.round((event.loaded * 100) / event.total);
            setProgress(percent);
          },
        }
      );
      if (response.data?.aiExtracted?.length) {
        setAiHints(response.data.aiExtracted);
      } else {
        setAiHints([]);
      }
      setRiskWarnings(response.data?.riskWarnings || []);

      await fetchCase();
      toastApi.success(t("common.upload"));
      setFile([]);
      setFileType("OTHER");
      setProgress(0);
    } catch (err) {
      console.error(err);
      toastApi.error(t("customers.saveError"));
    } finally {
      setLoading(false);
    }
  };

  const deleteFile = async (fileIndex) => {
    setConfirmAction({ open: true, type: "deleteFile", payload: fileIndex });
  };
  const downloadFile = async (fileItem) => {
    const isObject = fileItem && typeof fileItem === "object";
    if (!isObject) {
      window.open(String(fileItem || ""), "_blank");
      return;
    }
    try {
      const response = await axios.get(`${API_BASE}/files/${fileItem.id}/download`, {
        responseType: "blob",
      });
      const contentDisposition = String(response.headers?.["content-disposition"] || "");
      const matchedFilename = contentDisposition.match(/filename="?([^"]+)"?/i)?.[1];
      const downloadName = matchedFilename || fileItem.filename || `file-${fileItem.id}`;
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      toastApi.error(error?.response?.data || "Không thể tải tài liệu");
    }
  };
  const appendFiles = (files) => {
    const pickedFiles = Array.from(files || []);
    if (!pickedFiles.length) return;
    setFile((prev) => [...(Array.isArray(prev) ? prev : []), ...pickedFiles]);
  };
  const removePickedFile = (indexToRemove) => {
    setFile((prev) => prev.filter((_item, index) => index !== indexToRemove));
  };

  const doDeleteFile = async (fileIndex) => {
    setConfirmAction({ open: false, type: "", payload: null });
    try {
      setLoading(true);
      await axios.delete(`${API_BASE}/cases/${activeCase.id || caseData?.id}/files/${fileIndex}`);
      await fetchCase();
      toastApi.success(t("common.delete"));
    } catch (err) {
      console.error(err);
      toastApi.error(t("customers.deleteError"));
    } finally {
      setLoading(false);
    }
  };

  const deadlineDate = activeCase.deadline ? new Date(activeCase.deadline) : null;
  const isOverdue = deadlineDate ? deadlineDate < new Date() : false;
  const overdueDays = isOverdue
    ? Math.ceil((new Date() - deadlineDate) / (1000 * 60 * 60 * 24))
    : 0;
  const existingFileTypes = new Set(
    (activeCase.files || [])
      .filter((item) => item && typeof item === "object")
      .map((item) => item.fileType)
  );
  const effectiveFileTypes = new Set(existingFileTypes);
  if (file?.length > 0 && fileType) {
    effectiveFileTypes.add(fileType);
  }
  const requiredFileTypes = REQUIRED_FILES_BY_CASE_TYPE[activeCase.type] || ["CCCD"];
  const missingRequiredFileTypes = requiredFileTypes.filter((requiredType) => !effectiveFileTypes.has(requiredType));
  const toFileTypeLabel = (fileTypeKey) => FILE_TYPES[fileTypeKey] || fileTypeKey;
  const missingRequiredFileTypeLabels = missingRequiredFileTypes.map(toFileTypeLabel);
  const canEditByAssignment =
    currentUser?.role === "admin" ||
    !activeCase.assignedTo ||
    activeCase.assignedTo === currentUser?.username;
  const getStatusTransitionBlockers = (nextStatus) => {
    const blockers = [];
    const feeAmountValue = Number(activeCase.feeAmount || 0);
    const feePaidValue = Number(activeCase.feePaid || 0);
    if (activeCase.isLocked) {
      blockers.push("Hồ sơ đang bị khóa nghiệp vụ.");
    }
    if (!canEditByAssignment) {
      blockers.push(`Bạn không phải người được phân công (${activeCase.assignedTo}).`);
    }
    if (
      (nextStatus === workflowStatus.APPROVED || nextStatus === workflowStatus.NOTARIZED) &&
      missingRequiredFileTypes.length > 0
    ) {
      blockers.push(`Thiếu tài liệu bắt buộc: ${missingRequiredFileTypeLabels.join(", ")}.`);
    }
    if (activeCase.status === workflowStatus.RECEIPT && nextStatus === workflowStatus.LEGAL_CHECKING) {
      if (feeAmountValue <= 0) {
        blockers.push("Cần cập nhật Tổng chi phí trước.");
      } else if (feePaidValue < feeAmountValue * 0.3) {
        blockers.push("Cần thu trước tối thiểu 30% Tổng chi phí.");
      }
    }
    if (activeCase.status === workflowStatus.DEBT && nextStatus === workflowStatus.ARCHIVED) {
      if (feePaidValue < feeAmountValue) {
        blockers.push("Cần thu đủ 100% Tổng chi phí.");
      }
    }
    return blockers;
  };
  const statusFlow = [
    workflowStatus.RECEIVED,
    workflowStatus.RECEIPT,
    workflowStatus.LEGAL_CHECKING,
    workflowStatus.DRAFTING,
    workflowStatus.REVIEWING,
    workflowStatus.APPROVED,
    workflowStatus.NOTARIZED,
    workflowStatus.DEBT,
    workflowStatus.ARCHIVED,
  ].filter(Boolean);
  const currentStatusIndex = statusFlow.indexOf(activeCase.status);
  const nextStatusesForCurrentRole = getNextStatuses(activeCase.status).filter((nextStatus) => {
    if (normalizedCurrentUserRole === "admin") return true;
    const nextStatusIndex = statusFlow.indexOf(nextStatus);
    if (currentStatusIndex < 0 || nextStatusIndex < 0) return true;
    return nextStatusIndex >= currentStatusIndex;
  });
  const nextStatusChecks = nextStatusesForCurrentRole.map((nextStatus) => ({
    nextStatus,
    blockers: getStatusTransitionBlockers(nextStatus),
  }));
  const nextStatusMap = new Map(nextStatusChecks.map((item) => [item.nextStatus, item]));
  const getStatusActionHint = (status) => {
    const isVi = language === "vi";
    const map = {
      [workflowStatus.RECEIVED]: isVi
        ? "Tiếp nhận hồ sơ, kiểm tra thông tin đầu vào, phân công xử lý."
        : "Case intake, initial checks, and assignment.",
      [workflowStatus.RECEIPT]: isVi
        ? "Kế toán cập nhật tổng chi phí và theo dõi thu tối thiểu 30%."
        : "Accountant sets total cost and tracks minimum 30% collection.",
      [workflowStatus.LEGAL_CHECKING]: isVi
        ? "Rà soát pháp lý, xác nhận điều kiện hồ sơ."
        : "Legal review and compliance checks.",
      [workflowStatus.DRAFTING]: isVi
        ? "Soạn thảo văn bản và hoàn thiện nội dung hồ sơ."
        : "Drafting legal documents and case content.",
      [workflowStatus.REVIEWING]: isVi
        ? "Rà soát nghiệp vụ trước khi duyệt."
        : "Business review before approval.",
      [workflowStatus.APPROVED]: isVi
        ? "Duyệt hồ sơ, xác nhận đủ điều kiện công chứng."
        : "Approve case for notarization readiness.",
      [workflowStatus.NOTARIZED]: isVi
        ? "Thực hiện công chứng, chuẩn bị phát hành."
        : "Notarize case and prepare issuance.",
      [workflowStatus.DEBT]: isVi
        ? "Theo dõi công nợ đến khi thu đủ 100% tổng chi phí."
        : "Track debt collection until total cost is fully paid.",
      [workflowStatus.ARCHIVED]: isVi
        ? "Lưu trữ hồ sơ hoàn tất."
        : "Archive finalized case.",
    };
    return map[status] || "";
  };
  const getStatusHoverHint = (status) => {
    const isVi = language === "vi";
    const statusLabel = statusLabels[status] || status;
    const actionHint = getStatusActionHint(status);
    if (status === activeCase.status) {
      return isVi
        ? `Trạng thái hiện tại: ${statusLabel} - ${actionHint}`
        : `Current status: ${statusLabel} - ${actionHint}`;
    }
    if (nextStatusMap.has(status)) {
      const blockers = nextStatusMap.get(status)?.blockers || [];
      if (blockers.length > 0) {
        return isVi
          ? `Trạng thái kế tiếp: ${statusLabel} - Điều kiện còn thiếu: ${blockers.join(" ")}`
          : `Next status: ${statusLabel} - Unmet conditions: ${blockers.join(" ")}`;
      }
      return isVi
        ? `Có thể chuyển ngay sang ${statusLabel} - ${actionHint}`
        : `Ready to move to ${statusLabel} - ${actionHint}`;
    }
    if (currentStatusIndex >= 0 && statusFlow.indexOf(status) < currentStatusIndex) {
      return isVi
        ? `Đã hoàn tất bước ${statusLabel} - ${actionHint}`
        : `Completed step ${statusLabel} - ${actionHint}`;
    }
    return isVi
      ? `Bước tiếp theo trong lộ trình: ${statusLabel} - ${actionHint}`
      : `Upcoming workflow step: ${statusLabel} - ${actionHint}`;
  };
  const renderHistoryNotes = (rawNotes) => {
    const text = String(rawNotes || "").trim();
    if (!text) return "";
    const categoryMatch = text.match(/^Phân loại:\s*(.+)$/i);
    if (categoryMatch) return `Phân loại: ${getCaseTypeLabel(categoryMatch[1].trim(), t)}`;
    const assignedMatch = text.match(/^Assigned to\s+(.+)$/i);
    if (assignedMatch) return `Phân công cho: ${assignedMatch[1].trim()}`;
    const assignedBatchMatch = text.match(/^Assigned in batch to\s+(.+)$/i);
    if (assignedBatchMatch) return `Phân công theo batch cho: ${assignedBatchMatch[1].trim()}`;
    const deadlineMatch = text.match(/^Deadline set to\s+(.+)$/i);
    if (deadlineMatch) {
      const parsedDate = new Date(deadlineMatch[1].trim());
      const dateText = Number.isNaN(parsedDate.getTime())
        ? deadlineMatch[1].trim()
        : parsedDate.toLocaleString("vi-VN");
      return `Đặt hạn xử lý: ${dateText}`;
    }
    const publicCodeMatch = text.match(/^code=(.+)$/i);
    if (publicCodeMatch) return `Mã tra cứu công khai: ${publicCodeMatch[1].trim()}`;
    const signedByMatch = text.match(/^Signed by\s+(.+)$/i);
    if (signedByMatch) return `Ký duyệt bởi: ${signedByMatch[1].trim()}`;
    const sealedByMatch = text.match(/^Sealed by\s+(.+)$/i);
    if (sealedByMatch) return `Đóng dấu bởi: ${sealedByMatch[1].trim()}`;
    const releasedMatch = text.match(/^Released\s+(.+)$/i);
    if (releasedMatch) return `Mã phát hành: ${releasedMatch[1].trim()}`;
    const signedPdfStatusMatch = text.match(/^status=(.+)$/i);
    if (signedPdfStatusMatch) return `Trạng thái kiểm tra chữ ký số: ${signedPdfStatusMatch[1].trim()}`;
    const feeMatch = text.match(/^Fee\s+([0-9.]+)\/([0-9.]+);\s*method=([A-Z_/-]+)$/i);
    if (feeMatch) {
      const paidValue = Number(feeMatch[1] || 0).toLocaleString("vi-VN");
      const amountValue = Number(feeMatch[2] || 0).toLocaleString("vi-VN");
      const methodRaw = String(feeMatch[3] || "").toUpperCase();
      const methodLabel = methodRaw === "BANK_TRANSFER" ? "Chuyển khoản" : "Tiền mặt";
      return `Thu phí: ${paidValue}/${amountValue} đ - Phương thức: ${methodLabel}`;
    }
    return text;
  };
  const parseMoneyInput = (rawValue) => {
    const digitsOnly = String(rawValue || "").replace(/[^\d]/g, "");
    return Number(digitsOnly || 0);
  };
  const formatMoneyDisplay = (value) => {
    const numericValue = Number(value || 0);
    return numericValue.toLocaleString("vi-VN");
  };
  const totalReceiptCollected = receipts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const feeOutstanding = Math.max(0, Number(activeCase.feeAmount || 0) - totalReceiptCollected);
  const paidAmount = Number(activeCase.feePaid || 0);
  const statusKey = String(activeCase.status || "").toUpperCase();
  const requiresThirtyPercentCheckpoint = [
    "LEGAL_CHECKING",
    "DRAFTING",
    "REVIEWING",
    "APPROVED",
    "NOTARIZED",
    "DEBT",
  ].includes(statusKey);
  const requiresFullCheckpoint = statusKey === "ARCHIVED";
  const maxTotalCostAllowedByStatus =
    requiresFullCheckpoint && paidAmount > 0
      ? paidAmount
      : requiresThirtyPercentCheckpoint && paidAmount > 0
        ? paidAmount / 0.3
        : null;
  const feeAmountViolatesCheckpoint =
    Number(feeAmount || 0) > 0 &&
    maxTotalCostAllowedByStatus !== null &&
    Number(feeAmount || 0) > maxTotalCostAllowedByStatus + 0.000001;
  const feeAmountCheckpointHint = requiresFullCheckpoint
    ? `Hồ sơ đã ở bước Lưu trữ. Để giữ đủ điều kiện đã thu 100%, Tổng chi phí nên tối đa ${Math.floor(
        maxTotalCostAllowedByStatus || 0
      ).toLocaleString("vi-VN")} VNĐ.`
    : requiresThirtyPercentCheckpoint
      ? `Hồ sơ đã qua mốc pháp lý. Để giữ điều kiện đã thu tối thiểu 30%, Tổng chi phí nên tối đa ${Math.floor(
          maxTotalCostAllowedByStatus || 0
        ).toLocaleString("vi-VN")} VNĐ.`
      : "Bạn có thể cập nhật Tổng chi phí theo nghiệp vụ hiện tại.";
  const orderedHistory = [...(activeCase.history || [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const caseCreatedBy = activeCase.createdBy || orderedHistory[0]?.user || "-";
  const caseLastUpdatedBy = activeCase.updatedBy || orderedHistory[orderedHistory.length - 1]?.user || "-";
  const signatureStatusText = (() => {
    const status = String(activeCase.signatureStatus || "PENDING").toUpperCase();
    if (status === "VERIFIED_BASIC") return "Đã xác minh cơ bản";
    if (status === "INVALID") return "Không hợp lệ";
    if (status === "ERROR") return "Lỗi kiểm tra";
    return "Chờ kiểm tra";
  })();
  const trackingLinkDisplayText = activeCase.publicTrackingEnabled
    ? publicTrackingPath || (activeCase.publicTrackingCode ? `/track/${activeCase.publicTrackingCode}` : "Chưa tạo")
    : activeCase.publicTrackingCode
      ? "Chưa bật"
      : "Chưa tạo";
  const trackingLinkEnableStatusLabel =
    statusLabels[workflowStatus.LEGAL_CHECKING] || workflowStatus.LEGAL_CHECKING;
  const trackingLinkAutoHint = t("caseDetail.trackingLinkAutoEnableHint", {
    type: activeCase.type || "-",
    status: trackingLinkEnableStatusLabel,
  });
  const uploadedMissingRequiredFileTypes = requiredFileTypes.filter(
    (requiredType) => !existingFileTypes.has(requiredType)
  );
  const uploadedMissingRequiredFileTypeLabels = uploadedMissingRequiredFileTypes.map(toFileTypeLabel);
  const issueNotaryBlockers = [];
  if (activeCase.isLocked) issueNotaryBlockers.push("Hồ sơ đang bị khóa.");
  if (activeCase.status !== workflowStatus.APPROVED) issueNotaryBlockers.push("Cần trạng thái Đã duyệt.");
  if (!activeCase.feeAmount || Number(activeCase.feePaid || 0) < Number(activeCase.feeAmount || 0)) {
    issueNotaryBlockers.push("Cần thu đủ phí trước khi phát hành số.");
  }
  if (uploadedMissingRequiredFileTypes.length > 0) {
    issueNotaryBlockers.push(`Thiếu tài liệu bắt buộc: ${uploadedMissingRequiredFileTypeLabels.join(", ")}.`);
  }
  if (
    activeCase.caseCategory === "INHERITANCE" &&
    activeCase.inheritancePostingResult !== "NO_CLAIM"
  ) {
    issueNotaryBlockers.push("Hồ sơ thừa kế cần niêm yết đủ điều kiện (NO_CLAIM).");
  }
  const isFinancialResetPending = (() => {
    const history = Array.isArray(activeCase.history) ? activeCase.history : [];
    let latestResetTs = 0;
    let latestResumedTs = 0;
    history.forEach((item) => {
      const ts = new Date(item?.timestamp || 0).getTime();
      if (!ts) return;
      if (item?.action === "CASE_FINANCIAL_RESET" && ts > latestResetTs) latestResetTs = ts;
      if (item?.action === "CASE_FINANCIAL_RESUMED" && ts > latestResumedTs) latestResumedTs = ts;
    });
    return latestResetTs > 0 && latestResetTs > latestResumedTs;
  })();
  const sealBlockers = [];
  if (activeCase.isLocked) sealBlockers.push("Hồ sơ đang bị khóa.");
  if (!activeCase.signedAt) sealBlockers.push("Cần ký duyệt trước.");
  const releasePdfBlockers = [];
  if (activeCase.isLocked) releasePdfBlockers.push("Hồ sơ đang bị khóa.");
  if (!activeCase.signedAt) releasePdfBlockers.push("Cần ký duyệt trước.");
  if (!activeCase.sealedAt) releasePdfBlockers.push("Cần đóng dấu trước.");
  if (activeCase.signatureStatus !== "VERIFIED_BASIC") {
    releasePdfBlockers.push("Cần có bản PDF ký số hợp lệ.");
  }
  if (!activeCase.notaryRecordNumber) {
    releasePdfBlockers.push("Cần phát hành số công chứng trước.");
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, overflow: "hidden" } }}
    >
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Typography variant="h6">
            {t("caseDetail.title")}: {activeCase.caseId || caseData?.caseId}
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label={t("common.close")}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Tabs
          value={detailTab}
          onChange={(_e, nextValue) => setDetailTab(nextValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2 }}
        >
          <Tab label="Tổng quan" />
          <Tab label="Nghiệp vụ" />
          <Tab label="Tài liệu" />
          <Tab label={t("caseDetail.history")} />
        </Tabs>
        {detailTab === 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(320px, 380px) minmax(0, 1fr)" },
            gap: 2,
            mb: 3,
            alignItems: "start",
          }}
        >
          {isFinancialResetPending && (
            <Paper
              variant="outlined"
              sx={{
                gridColumn: { xs: "1 / -1", lg: "1 / -1" },
                p: 1.25,
                borderRadius: 2,
                borderColor: "warning.light",
                bgcolor: "warning.50",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Chip size="small" color="warning" label="Đang làm lại tài chính" />
              <Typography variant="body2" color="warning.dark">
                Hồ sơ đang ở giai đoạn thu phí/làm lại sau khởi tạo lại tài chính. Hệ thống sẽ tự khôi phục về mốc trạng thái trước đó khi đạt điều kiện phí.
              </Typography>
            </Paper>
          )}
          {/* THÔNG TIN CƠ BẢN */}
          <Box>
            <Typography variant="h6" mb={2}>{t("caseDetail.caseInfo")}</Typography>
            <Paper sx={{ p: 2, borderRadius: 2 }}>
              {[
                ["Mã hồ sơ", activeCase.caseId],
                ["Khách hàng", activeCase.customerName],
                ["Số điện thoại", activeCase.phone],
                ["Loại giao dịch", activeCase.type],
                ["Mô tả", activeCase.description || "Không có"],
                ["Ghi chú", activeCase.notes || "Không có"],
                [t("caseDetail.assignedTo"), activeCase.assignedTo || "-"],
                [
                  t("caseDetail.deadline"),
                  deadline ? new Date(deadline).toLocaleDateString("vi-VN") : "-",
                ],
                ["Sổ công chứng", activeCase.notaryBookNumber || "-"],
                ["Số công chứng", activeCase.notaryRecordNumber || "-"],
                [
                  "Ngày phát hành",
                  activeCase.issuedAt ? new Date(activeCase.issuedAt).toLocaleString("vi-VN") : "-",
                ],
                [
                  "Phương thức thu phí",
                  String(activeCase.paymentMethod || "CASH").toUpperCase() === "BANK_TRANSFER"
                    ? "Chuyển khoản"
                    : "Tiền mặt",
                ],
                ["Ký duyệt", activeCase.signedAt ? new Date(activeCase.signedAt).toLocaleString("vi-VN") : "-"],
                ["Đóng dấu", activeCase.sealedAt ? new Date(activeCase.sealedAt).toLocaleString("vi-VN") : "-"],
                ["Mã phát hành", activeCase.releaseCode || "-"],
                ["Phát hành PDF", activeCase.releasedAt ? new Date(activeCase.releasedAt).toLocaleString("vi-VN") : "-"],
                ["Trạng thái ký số", signatureStatusText],
                ["Người ký", activeCase.signerName || "-"],
                ["CA/Provider", activeCase.signatureProvider || "-"],
                ["Serial chứng thư", activeCase.certificateSerial || "-"],
                ["Liên kết tra cứu", trackingLinkDisplayText],
                ["Trạng thái khóa", activeCase.isLocked ? "Đã khóa" : "Đang mở"],
              ].map(([label, value]) => (
                <Box
                  key={label}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "120px minmax(0, 1fr)",
                    columnGap: 1,
                    py: 0.25,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                    {label}:
                  </Typography>
                  {label === "Liên kết tra cứu" ? (
                    <Tooltip title={trackingLinkAutoHint} arrow>
                      <Typography variant="body2" sx={{ wordBreak: "break-word", cursor: "help" }}>
                        {value}
                      </Typography>
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                      {value}
                    </Typography>
                  )}
                </Box>
              ))}
              {isOverdue && (
                <Typography color="error" sx={{ mt: 1 }}>
                  {t("caseDetail.overdue", { days: overdueDays })}
                </Typography>
              )}
            </Paper>
          </Box>

          {/* TRẠNG THÁI */}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" mb={1}>{t("caseDetail.nextStatus")}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
              {t("caseDetail.statusFlowHint")}
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2,
                mb: 1.5,
                bgcolor: "#f8fafc",
                overflowX: "auto",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", minWidth: "max-content", gap: 0.25 }}>
                {statusFlow.map((status, index) => {
                  const statusIndex = statusFlow.indexOf(status);
                  const isCurrent = status === activeCase.status;
                  const isNext = nextStatusMap.has(status);
                  const isCompleted = currentStatusIndex >= 0 && statusIndex < currentStatusIndex;
                  const chipStyles = isCurrent
                    ? {
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                        borderColor: "primary.main",
                        fontWeight: 700,
                      }
                    : isCompleted
                      ? {
                          bgcolor: "grey.200",
                          color: "text.secondary",
                          borderColor: "grey.300",
                          fontWeight: 600,
                        }
                      : isNext
                        ? {
                            bgcolor: "success.50",
                            color: "success.dark",
                            borderColor: "success.main",
                            fontWeight: 600,
                          }
                        : {
                            bgcolor: "background.paper",
                            color: "text.secondary",
                            borderColor: "divider",
                            fontWeight: 500,
                          };
                  return (
                    <Box key={status} sx={{ display: "flex", alignItems: "center" }}>
                      <Tooltip title={getStatusHoverHint(status)} arrow>
                        <Chip
                          label={statusLabels[status] || status}
                          variant={isCurrent || isCompleted || isNext ? "filled" : "outlined"}
                          color="default"
                          sx={{
                            ...chipStyles,
                          }}
                        />
                      </Tooltip>
                      {index < statusFlow.length - 1 && (
                        <ChevronRightIcon
                          sx={{
                            mx: 0.5,
                            color:
                              isCurrent
                                ? "primary.main"
                                : isCompleted
                                  ? "grey.500"
                                  : isNext
                                    ? "success.main"
                                    : "text.disabled",
                            fontSize: 18,
                          }}
                        />
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Paper>
            {!isAccountantRole && canUpdateCaseStatusByRole && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {nextStatusChecks.map(({ nextStatus, blockers }) => {
                const isDisabled = blockers.length > 0;
                const tooltipTitle = blockers.join("\n");
                return (
                  <Paper
                    key={nextStatus}
                    variant="outlined"
                    sx={{
                      p: 1.25,
                      borderRadius: 2,
                      borderColor: isDisabled ? "warning.light" : "success.light",
                      bgcolor: isDisabled ? "#fff7ed" : "#f8fff9",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {t("caseDetail.fromToStatus", {
                          from: statusLabels[activeCase.status] || activeCase.status,
                          to: statusLabels[nextStatus] || nextStatus,
                        })}
                      </Typography>
                      <Tooltip key={nextStatus} title={tooltipTitle} arrow disableHoverListener={!isDisabled}>
                        <span>
                          <Button
                            variant={isDisabled ? "outlined" : "contained"}
                            size="small"
                            onClick={() => onStatusUpdate(activeCase.id, nextStatus)}
                            disabled={isDisabled}
                            sx={{
                              minWidth: 160,
                              ...(isDisabled
                                ? {
                                    borderColor: statusColors[nextStatus],
                                    color: statusColors[nextStatus],
                                  }
                                : {
                                    bgcolor: statusColors[nextStatus],
                                    color: "white",
                                    "&:hover": { opacity: 0.9, bgcolor: statusColors[nextStatus] },
                                  }),
                            }}
                          >
                            {t("caseDetail.executeTransition")}
                          </Button>
                        </span>
                      </Tooltip>
                    </Box>
                    {isDisabled && (
                      <Typography variant="caption" color="warning.dark" sx={{ display: "block", mt: 0.75 }}>
                        {t("caseDetail.blockedActionHint")}
                      </Typography>
                    )}
                  </Paper>
                );
              })}
            </Box>
            )}
            {!isAccountantRole &&
              canUpdateCaseStatusByRole &&
              nextStatusChecks.some((item) => item.blockers.length > 0) && (
              <Paper sx={{ mt: 2, p: 2, bgcolor: "#fff7ed", border: "1px solid #fed7aa", textAlign: "left" }}>
                <Typography variant="subtitle2" color="warning.dark" sx={{ mb: 1 }}>
                  {t("caseDetail.transitionRequirementsTitle")}
                </Typography>
                {nextStatusChecks
                  .filter((item) => item.blockers.length > 0)
                  .map((item) => (
                    <Typography key={item.nextStatus} variant="body2" color="warning.dark" sx={{ mb: 0.5 }}>
                      - {statusLabels[item.nextStatus] || item.nextStatus}: {item.blockers.join(" ")}
                    </Typography>
                  ))}
              </Paper>
            )}
            <Paper variant="outlined" sx={{ mt: 2, p: 1.5, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t("caseDetail.updateDeadline")}
              </Typography>
              <LocalizationProvider
                dateAdapter={AdapterDayjs}
                adapterLocale={language === "vi" ? "vi" : "en"}
                localeText={language === "vi" ? viVN.components.MuiLocalizationProvider.defaultProps.localeText : undefined}
              >
                <DatePicker
                  format="DD/MM/YYYY"
                  value={deadline ? dayjs(deadline) : null}
                  onChange={(value) =>
                    setDeadline(value && value.isValid() ? value.format("YYYY-MM-DD") : "")
                  }
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: "small",
                      placeholder: "dd/mm/yyyy",
                    },
                  }}
                />
              </LocalizationProvider>
              <Button
                variant="contained"
                sx={{ mt: 1.25 }}
                onClick={saveDeadline}
                disabled={loading || activeCase.isLocked || isAccountantRole}
              >
                {t("caseDetail.updateDeadline")}
              </Button>
            </Paper>
            <Paper variant="outlined" sx={{ mt: 1.5, p: 1.5, borderRadius: 2 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: "86px 1fr", rowGap: 0.5, columnGap: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>Người tạo:</Typography>
                <Typography variant="caption">{caseCreatedBy}</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>Ngày tạo:</Typography>
                <Typography variant="caption">{new Date(activeCase.createdAt).toLocaleString("vi-VN")}</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>Cập nhật bởi:</Typography>
                <Typography variant="caption">{caseLastUpdatedBy}</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>Ngày cập nhật:</Typography>
                <Typography variant="caption">{new Date(activeCase.updatedAt).toLocaleString("vi-VN")}</Typography>
              </Box>
            </Paper>
          </Box>
        </Box>
        )}

        {detailTab === 1 && (
          <>
        {canAssignCase && (
          <Accordion sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography><b>{t("caseDetail.assignHandler")}</b></Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormControl fullWidth sx={{ mt: 1, mb: 2 }}>
                <InputLabel>{t("caseDetail.chooseHandler")}</InputLabel>
                <Select
                  value={selectedUser}
                  label={t("caseDetail.chooseHandler")}
                  onChange={(e) => setSelectedUser(e.target.value)}
                >
                  <MenuItem value="">-- Không gán --</MenuItem>
                  {users
                    .filter((user) => isAssignableOption(user))
                    .map((user) => (
                    <MenuItem key={user.username} value={user.username}>
                      {formatAssigneeLabel(user)}
                    </MenuItem>
                    ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={assignCase}
                disabled={loading || !selectedUser || activeCase.isLocked}
              >
                {t("caseDetail.assignBtn")}
              </Button>
            </AccordionDetails>
          </Accordion>
        )}
        {!isAccountantRole && (
        <Accordion sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography><b>Tác vụ nghiệp vụ</b></Typography>
          </AccordionSummary>
          <AccordionDetails>
        <Typography><b>Sinh văn bản tự động</b></Typography>
        <FormControl fullWidth sx={{ mt: 1 }}>
          <InputLabel>Chọn biểu mẫu</InputLabel>
          <Select
            value={selectedTemplateId}
            label="Chọn biểu mẫu"
            onChange={(e) => setSelectedTemplateId(e.target.value)}
          >
            {templates.length === 0 && (
              <MenuItem value="" disabled>
                Chưa có biểu mẫu đã duyệt để sinh văn bản
              </MenuItem>
            )}
            {templates.map((template) => (
              <MenuItem key={template.id} value={template.id}>
                {template.name} (v{template.version})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {templates.length === 0 && (
          <Typography variant="caption" color="warning.dark" sx={{ mt: 0.75, display: "block" }}>
            Cần có ít nhất 1 biểu mẫu ở trạng thái Đã duyệt để thực hiện sinh văn bản tự động.
          </Typography>
        )}
        <Button
          variant="outlined"
          fullWidth
          sx={{ mt: 1 }}
          onClick={generateDocument}
          disabled={loading || !selectedTemplateId}
        >
          Sinh văn bản
        </Button>
        <Button
          variant="outlined"
          fullWidth
          sx={{ mt: 1 }}
          onClick={signCase}
          disabled={loading || activeCase.isLocked}
        >
          Ký duyệt hồ sơ
        </Button>
        <Button
          variant="outlined"
          fullWidth
          sx={{ mt: 1 }}
          onClick={sealCase}
          disabled={loading || sealBlockers.length > 0}
        >
          Đóng dấu nội bộ
        </Button>
        {sealBlockers.length > 0 && (
          <Typography variant="caption" color="warning.dark" sx={{ mt: 0.5, display: "block" }}>
            {sealBlockers.join(" ")}
          </Typography>
        )}
        <Button
          variant="contained"
          color="secondary"
          fullWidth
          sx={{ mt: 1 }}
          onClick={releaseCase}
          disabled={loading || releasePdfBlockers.length > 0}
        >
          Phát hành PDF chính thức
        </Button>
        {releasePdfBlockers.length > 0 && (
          <Typography variant="caption" color="warning.dark" sx={{ mt: 0.5, display: "block" }}>
            {releasePdfBlockers.join(" ")}
          </Typography>
        )}
        <Divider sx={{ my: 2 }} />
        <Typography><b>Bước 1: Tải lên PDF đã ký số (USB token/CA)</b></Typography>
        <Button variant="outlined" component="label" sx={{ mt: 1 }}>
          {signedPdfFile ? "Đổi tài liệu PDF đã ký" : "Chọn PDF đã ký"}
          <input
            type="file"
            hidden
            accept="application/pdf"
            onChange={(e) => setSignedPdfFile(e.target.files?.[0] || null)}
          />
        </Button>
        <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
          {signedPdfFile ? signedPdfFile.name : "Chưa chọn tài liệu"}
        </Typography>
        <TextField
          size="small"
          fullWidth
          sx={{ mt: 1 }}
          label="Người ký"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
        />
        <TextField
          size="small"
          fullWidth
          sx={{ mt: 1 }}
          label="Provider CA (VNPT/Viettel/FPT...)"
          value={signatureProvider}
          onChange={(e) => setSignatureProvider(e.target.value)}
        />
        <TextField
          size="small"
          fullWidth
          sx={{ mt: 1 }}
          label="Serial chứng thư số"
          value={certificateSerial}
          onChange={(e) => setCertificateSerial(e.target.value)}
        />
        <Button
          variant="contained"
          fullWidth
          sx={{ mt: 1 }}
          onClick={uploadSignedPdf}
          disabled={loading || !signedPdfFile}
        >
          Tải lên & kiểm tra chữ ký cơ bản
        </Button>
        <Divider sx={{ my: 2 }} />
        {currentUser?.role === "admin" && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography><b>Quản trị xóa/hủy hồ sơ (Quản trị viên)</b></Typography>
            <TextField
              size="small"
              fullWidth
              sx={{ mt: 1 }}
              label="Lý do hủy/xóa mềm"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
            <Button
              variant="contained"
              color="error"
              fullWidth
              sx={{ mt: 1 }}
              onClick={deleteCase}
              disabled={loading}
            >
              Hủy/Xóa mềm hồ sơ
            </Button>
            {activeCase?.isDeleted && (
              <Button
                variant="outlined"
                color="success"
                fullWidth
                sx={{ mt: 1 }}
                onClick={restoreCase}
                disabled={loading}
              >
                Khôi phục hồ sơ
              </Button>
            )}
          </>
        )}
          </AccordionDetails>
        </Accordion>
        )}
        <Accordion sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography><b>Phí công chứng & phát hành số</b></Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
              <Typography variant="body2"><b>Tổng chi phí:</b> {formatMoneyDisplay(activeCase.feeAmount || 0)} đ</Typography>
              <Typography variant="body2"><b>Tổng đã thu (theo phiếu):</b> {formatMoneyDisplay(totalReceiptCollected)} đ</Typography>
              <Typography variant="body2"><b>Còn thiếu:</b> {formatMoneyDisplay(feeOutstanding)} đ</Typography>
              <Typography variant="body2"><b>Phiếu gần nhất:</b> {activeCase.feeReceiptNo || "Chưa có"}</Typography>
            </Paper>
            {canManageReceipts && (
              <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                <TextField
                  size="small"
                  label="Tổng chi phí"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(parseMoneyInput(e.target.value))}
                  sx={{ minWidth: 220, flex: 1 }}
                  inputProps={{ min: 0 }}
                  error={feeAmountViolatesCheckpoint}
                  helperText={feeAmountViolatesCheckpoint ? feeAmountCheckpointHint : ""}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title={feeAmountCheckpointHint} arrow>
                          <InfoOutlinedIcon fontSize="small" color="action" />
                        </Tooltip>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  variant="contained"
                  onClick={saveFeeInfo}
                  disabled={loading || activeCase.isLocked || feeAmountViolatesCheckpoint}
                >
                  Cập nhật tổng chi phí
                </Button>
              </Box>
            )}
            {canManageReceipts && (
              <Button
                variant="outlined"
                fullWidth
                sx={{ mt: 1 }}
                onClick={() => onOpenReceiptManagement?.(activeCase)}
              >
                Mở Quản lý phiếu thu
              </Button>
            )}
            {normalizedCurrentUserRole === "admin" && (
              <Tooltip
                title="Xóa toàn bộ phiếu thu, đưa Tổng chi phí về 0 và trả hồ sơ về Đã tiếp nhận để thu phí lại."
                arrow
              >
                <span>
                  <Button
                    variant="outlined"
                    color="warning"
                    fullWidth
                    sx={{ mt: 1 }}
                    onClick={() => setFinancialResetOpen(true)}
                    disabled={loading}
                  >
                    Khởi tạo lại tài chính
                  </Button>
                </span>
              </Tooltip>
            )}
            {!isAccountantRole && (
            <Tooltip title={issueNotaryBlockers.join(" ")} arrow disableHoverListener={issueNotaryBlockers.length === 0}>
              <span style={{ width: "100%" }}>
                <Button
                  variant="contained"
                  color="success"
                  fullWidth
                  sx={{ mt: 1 }}
                  onClick={issueNotaryRecord}
                  disabled={loading || issueNotaryBlockers.length > 0}
                >
                  {t("caseDetail.issueNotaryRecordBtn")}
                </Button>
              </span>
            </Tooltip>
            )}
            {!isAccountantRole && (
            <Tooltip title={t("caseDetail.issueNotaryRecordHint")} arrow>
              <Box sx={{ mt: 0.75, display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
                <InfoOutlinedIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption">{t("caseDetail.issueNotaryRecordHintShort")}</Typography>
              </Box>
            </Tooltip>
            )}
            {!isAccountantRole && issueNotaryBlockers.length > 0 && (
              <Typography variant="caption" color="warning.dark" sx={{ mt: 0.5, display: "block" }}>
                {issueNotaryBlockers.join(" ")}
              </Typography>
            )}
            {activeCase.isLocked && (
              <Button
                variant="text"
                color="warning"
                fullWidth
                sx={{ mt: 1 }}
                onClick={unlockCase}
                disabled={loading}
              >
                Mở khóa hồ sơ (Quản trị viên)
              </Button>
            )}
          </AccordionDetails>
        </Accordion>
        {!isAccountantRole && <Divider sx={{ my: 3 }} />}

        {/* INHERITANCE POSTING */}
        {!isAccountantRole && activeCase.caseCategory === "INHERITANCE" && (
          <Accordion sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">{t("inheritance.title")}</Typography>
            </AccordionSummary>
            <AccordionDetails>
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
                <Typography>
                  <b>{t("inheritance.startedAt")}:</b>{" "}
                  {activeCase.inheritancePostingStartedAt
                    ? new Date(activeCase.inheritancePostingStartedAt).toLocaleDateString("vi-VN")
                    : "-"}
                </Typography>
                <Typography>
                  <b>{t("inheritance.endsAt")}:</b>{" "}
                  {activeCase.inheritancePostingEndsAt
                    ? new Date(activeCase.inheritancePostingEndsAt).toLocaleDateString("vi-VN")
                    : "-"}
                </Typography>
                <Typography>
                  <b>{t("inheritance.result")}:</b>{" "}
                  {activeCase.inheritancePostingResult === "NO_CLAIM"
                    ? t("inheritance.noClaim")
                    : activeCase.inheritancePostingResult === "HAS_CLAIM"
                    ? t("inheritance.hasClaim")
                    : activeCase.inheritancePostingResult === "PENDING"
                    ? t("inheritance.pending")
                    : "-"}
                </Typography>
              </Box>
              <TextField
                label={t("inheritance.notes")}
                value={inheritanceNotes}
                onChange={(e) => setInheritanceNotes(e.target.value)}
                fullWidth
                multiline
                rows={2}
                sx={{ mb: 2 }}
              />
              <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  onClick={startInheritancePosting}
                  disabled={!!activeCase.inheritancePostingStartedAt && activeCase.inheritancePostingResult !== "HAS_CLAIM"}
                >
                  {t("inheritance.startBtn")}
                </Button>
                <FormControl sx={{ minWidth: 220 }}>
                  <InputLabel>{t("inheritance.result")}</InputLabel>
                  <Select
                    value={inheritanceResult || ""}
                    label={t("inheritance.result")}
                    onChange={(e) => setInheritanceResult(e.target.value)}
                  >
                    <MenuItem value="NO_CLAIM">{t("inheritance.noClaim")}</MenuItem>
                    <MenuItem value="HAS_CLAIM">{t("inheritance.hasClaim")}</MenuItem>
                  </Select>
                </FormControl>
                <Button variant="outlined" onClick={finalizeInheritancePosting}>
                  {t("inheritance.finalizeBtn")}
                </Button>
              </Box>
            </Paper>
            </AccordionDetails>
          </Accordion>
        )}

        {/* COPY ISSUANCE REQUESTS */}
        {!isAccountantRole && (
        <Accordion sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1"><b>{t("copyRequest.title")}</b></Typography>
          </AccordionSummary>
          <AccordionDetails>
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
            <TextField
              label={t("copyRequest.requesterName")}
              value={copyForm.requesterName}
              onChange={(e) => setCopyForm({ ...copyForm, requesterName: e.target.value })}
              sx={{ minWidth: 220, flex: 1 }}
            />
            <TextField
              label={t("copyRequest.requesterIdNumber")}
              value={copyForm.requesterIdNumber}
              onChange={(e) => setCopyForm({ ...copyForm, requesterIdNumber: e.target.value })}
              sx={{ minWidth: 180 }}
            />
            <FormControl sx={{ minWidth: 240 }}>
              <InputLabel>{t("copyRequest.requesterRelation")}</InputLabel>
              <Select
                value={copyForm.requesterRelation}
                label={t("copyRequest.requesterRelation")}
                onChange={(e) => setCopyForm({ ...copyForm, requesterRelation: e.target.value })}
              >
                <MenuItem value="PARTY">{t("copyRequest.relationParty")}</MenuItem>
                <MenuItem value="HEIR">{t("copyRequest.relationHeir")}</MenuItem>
                <MenuItem value="AUTHORITY">{t("copyRequest.relationAuthority")}</MenuItem>
                <MenuItem value="OTHER">{t("copyRequest.relationOther")}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label={t("copyRequest.legalBasis")}
              value={copyForm.legalBasis}
              onChange={(e) => setCopyForm({ ...copyForm, legalBasis: e.target.value })}
              sx={{ minWidth: 220, flex: 2 }}
            />
            <TextField
              label={t("copyRequest.notes")}
              value={copyForm.notes}
              onChange={(e) => setCopyForm({ ...copyForm, notes: e.target.value })}
              sx={{ minWidth: 220, flex: 2 }}
            />
            <Button variant="contained" onClick={submitCopyRequest}>
              {t("copyRequest.addBtn")}
            </Button>
          </Box>
          {copyRequests.length === 0 ? (
            <Typography color="text.secondary">{t("copyRequest.noRequests")}</Typography>
          ) : (
            <List dense>
              {copyRequests.map((reqItem) => (
                <ListItem key={reqItem.id} divider alignItems="flex-start">
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                        <Typography fontWeight="bold">
                          {reqItem.requesterName} ({reqItem.requesterRelation})
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(reqItem.createdAt).toLocaleString("vi-VN")} · {t("copyRequest.status")}: {t(`copyRequest.${reqItem.status.toLowerCase()}`)}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box>
                        {reqItem.requesterIdNumber && (
                          <Typography variant="body2">CCCD: {reqItem.requesterIdNumber}</Typography>
                        )}
                        {reqItem.legalBasis && (
                          <Typography variant="body2">{t("copyRequest.legalBasis")}: {reqItem.legalBasis}</Typography>
                        )}
                        {reqItem.notes && (
                          <Typography variant="body2" color="text.secondary">
                            {reqItem.notes}
                          </Typography>
                        )}
                        {reqItem.decidedBy && (
                          <Typography variant="caption">
                            {t("copyRequest.decidedBy")}: {reqItem.decidedBy} · {new Date(reqItem.decidedAt).toLocaleString("vi-VN")}
                          </Typography>
                        )}
                        {reqItem.issuedAt && (
                          <Typography variant="caption" color="success.main" sx={{ display: "block" }}>
                            {t("copyRequest.issuedAt")}: {new Date(reqItem.issuedAt).toLocaleString("vi-VN")}
                          </Typography>
                        )}
                        {reqItem.rejectionReason && (
                          <Typography variant="caption" color="error" sx={{ display: "block" }}>
                            {t("copyRequest.rejectionReason")}: {reqItem.rejectionReason}
                          </Typography>
                        )}
                        <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                          {reqItem.status === "PENDING" && (
                            <>
                              <Button size="small" variant="contained" onClick={() => approveCopyRequest(reqItem.id)}>
                                {t("copyRequest.approveBtn")}
                              </Button>
                              {copyRejection.id === reqItem.id ? (
                                <>
                                  <TextField
                                    size="small"
                                    label={t("copyRequest.rejectionReason")}
                                    value={copyRejection.reason}
                                    onChange={(e) =>
                                      setCopyRejection({ id: reqItem.id, reason: e.target.value })
                                    }
                                    sx={{ minWidth: 200 }}
                                  />
                                  <Button size="small" color="error" variant="contained" onClick={() => rejectCopyRequest(reqItem.id)}>
                                    {t("copyRequest.rejectBtn")}
                                  </Button>
                                </>
                              ) : (
                                <Button size="small" color="error" variant="outlined" onClick={() => setCopyRejection({ id: reqItem.id, reason: "" })}>
                                  {t("copyRequest.rejectBtn")}
                                </Button>
                              )}
                            </>
                          )}
                          {reqItem.status === "APPROVED" && (
                            <Button size="small" variant="contained" color="success" onClick={() => issueCopyRequest(reqItem.id)}>
                              {t("copyRequest.issueBtn")}
                            </Button>
                          )}
                        </Box>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
          </AccordionDetails>
        </Accordion>
        )}
          </>
        )}

        {detailTab === 2 && (
          <>
        {riskWarnings.length > 0 && (
          <Accordion sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">{t("caseDetail.riskWarnings")}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Paper sx={{ p: 2, bgcolor: "#fff7ed", border: "1px solid #fed7aa" }}>
                {riskWarnings.map((warning, index) => (
                  <Typography key={index} color="warning.dark">
                    ⚠️{" "}
                    {warning?.type === "missing_documents" && Array.isArray(warning?.missingFileTypes)
                      ? `Hồ sơ còn thiếu: ${warning.missingFileTypes.map(toFileTypeLabel).join(", ")}`
                      : warning.message}
                  </Typography>
                ))}
              </Paper>
            </AccordionDetails>
          </Accordion>
        )}
        {/* UPLOAD FILE */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">{t("caseDetail.uploadDocs")}</Typography>
          </AccordionSummary>
          <AccordionDetails>
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
            {t("caseDetail.requiredDocumentsByBusiness")}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
            {requiredFileTypes.map((requiredType) => {
              const hasDocument = effectiveFileTypes.has(requiredType);
              return (
                <Chip
                  key={requiredType}
                  label={`${toFileTypeLabel(requiredType)} ${
                    hasDocument ? `(${t("caseDetail.documentReady")})` : `(${t("caseDetail.documentMissing")})`
                  }`}
                  color={hasDocument ? "success" : "warning"}
                  variant={hasDocument ? "filled" : "outlined"}
                />
              );
            })}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="caption" color={missingRequiredFileTypes.length ? "warning.main" : "success.main"}>
              {missingRequiredFileTypes.length > 0
                ? t("caseDetail.requiredDocumentsMissing", { docs: missingRequiredFileTypeLabels.join(", ") })
                : t("caseDetail.requiredDocumentsComplete")}
            </Typography>
            <Tooltip title={t("caseDetail.requiredDocumentsTooltip")} arrow>
              <InfoOutlinedIcon sx={{ fontSize: 14, color: "text.secondary" }} />
            </Tooltip>
          </Box>
        </Paper>
        <Paper
          variant="outlined"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFiles(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDraggingFiles(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingFiles(false);
            appendFiles(e.dataTransfer.files);
          }}
          sx={{
            p: 2,
            mb: 2,
            borderStyle: "dashed",
            borderWidth: 2,
            borderColor: isDraggingFiles ? "primary.main" : "divider",
            bgcolor: isDraggingFiles ? "primary.50" : "background.paper",
            borderRadius: 2,
          }}
        >
          <Typography variant="subtitle2" sx={{ mb: 0.5, color: isDraggingFiles ? "primary.main" : "text.primary" }}>
            {t("app.dragAndDropDocuments")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t("app.dragAndDropDocumentsHint")}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <Button variant="outlined" component="label" disabled={activeCase.isLocked || isAccountantRole}>
              {t("app.selectDocuments")}
              <input hidden type="file" multiple onChange={(e) => appendFiles(e.target.files)} />
            </Button>
            <Button variant="text" component="label" disabled={activeCase.isLocked || isAccountantRole}>
              {t("app.addMoreDocuments")}
              <input hidden type="file" multiple onChange={(e) => appendFiles(e.target.files)} />
            </Button>
            {file.length > 0 && (
              <Button variant="text" color="error" onClick={() => setFile([])} disabled={activeCase.isLocked || isAccountantRole}>
                {t("app.clearAllDocuments")}
              </Button>
            )}
          </Box>
          {file.length > 0 && (
            <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
              {file.map((item, index) => (
                <Paper
                  key={`${item.name}-${index}`}
                  variant="outlined"
                  sx={{ p: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
                >
                  <Typography variant="body2" sx={{ flex: 1, wordBreak: "break-all" }}>
                    {item.name}
                  </Typography>
                  <Chip
                    label={t("common.delete")}
                    color="error"
                    variant="outlined"
                    onClick={() => removePickedFile(index)}
                    sx={{ cursor: "pointer" }}
                  />
                </Paper>
              ))}
            </Box>
          )}
        </Paper>
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", mb: 2, flexWrap: "wrap" }}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>{t("caseDetail.docType")}</InputLabel>
            <Select
              value={fileType}
              label={t("caseDetail.docType")}
              onChange={(e) => setFileType(e.target.value)}
            >
              {Object.entries(FILE_TYPES).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            onClick={uploadFile}
            disabled={loading || file.length === 0 || activeCase.isLocked || isAccountantRole}
          >
            {loading ? t("common.loading") : t("common.upload")}
          </Button>
        </Box>

        {aiHints.length > 0 && (
          <Paper sx={{ p: 2, mb: 2, bgcolor: "#ecfdf5", border: "1px solid #a7f3d0" }}>
            <Typography variant="subtitle2" mb={1}>{t("caseDetail.aiHints")}</Typography>
            {aiHints.map((hint, index) => (
              <Typography key={`${hint.filename}-${index}`} variant="body2">
                {hint.filename}: CCCD {hint.idNumber || "không nhận diện được"}
              </Typography>
            ))}
          </Paper>
        )}

        {/* PROGRESS */}
        {loading && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress variant="determinate" value={progress} />
            <Typography variant="body2">{progress}%</Typography>
          </Box>
        )}

        {/* FILE LIST */}
        {activeCase.files && activeCase.files.length > 0 && (
          <Box>
            <Typography variant="h6" mb={2}>{t("caseDetail.uploadedDocs")}</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {activeCase.files.map((file, index) => {
                // Support both old format (string) and new format (object)
                const isObject = typeof file === 'object';
                const filename = isObject ? file.filename : file.split('/').pop();
                const fileCategory = isObject ? (FILE_TYPES[file.fileType] || file.fileType) : "Tài liệu";

                return (
                  <Paper key={index} sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
                      <Chip label={fileCategory} variant="outlined" />
                      <Typography variant="body2" sx={{ flex: 1, wordBreak: "break-all" }}>
                        {filename}
                      </Typography>
                      {isObject && (
                        <Typography variant="caption" color="text.secondary">
                          {new Date(file.uploadedAt).toLocaleString('vi-VN')}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => downloadFile(file)}
                      >
                        {t("common.download")}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => deleteFile(index)}
                        disabled={loading || activeCase.isLocked || isAccountantRole}
                      >
                        {t("common.delete")}
                      </Button>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Box>
        )}
          </AccordionDetails>
        </Accordion>
          </>
        )}
        {detailTab === 3 && (
          <>
        {/* LỊCH SỬ */}
        <Accordion defaultExpanded sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">{t("caseDetail.history")}</Typography>
          </AccordionSummary>
          <AccordionDetails>
        <Paper sx={{ p: 2, maxHeight: 300, overflowY: 'auto' }}>
          <List>
            {activeCase.history?.slice().reverse().map((item, index) => (
              <ListItem key={index} divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Typography variant="body2" fontWeight="bold">
                        {getAuditActionLabel(item.action, language)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(item.timestamp).toLocaleString('vi-VN')}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Box>
                      {item.fromStatus || item.toStatus ? (
                        <Typography variant="body2">
                          Từ: {statusLabels[item.fromStatus] || item.fromStatus || "-"} →
                          Sang: {statusLabels[item.toStatus] || item.toStatus || "-"}
                        </Typography>
                      ) : item.notes ? (
                        <Typography variant="body2" color="text.secondary">
                          Nội dung: {renderHistoryNotes(item.notes)}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Không có thay đổi trạng thái.
                        </Typography>
                      )}
                      {item.notes && (item.fromStatus || item.toStatus) && (
                        <Typography variant="body2" color="text.secondary">
                          Ghi chú: {renderHistoryNotes(item.notes)}
                        </Typography>
                      )}
                      <Typography variant="caption">
                        Người thực hiện: {item.user}
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            )) || <Typography>{t("caseDetail.noHistory")}</Typography>}
          </List>
        </Paper>
          </AccordionDetails>
        </Accordion>
          </>
        )}
      </DialogContent>

      <Dialog open={confirmAction.open} onClose={() => setConfirmAction({ open: false, type: "", payload: null })}>
        <DialogTitle>{t("caseDetail.confirmAction")}</DialogTitle>
        <DialogContent>
          {confirmAction.type === "assign"
            ? t("caseDetail.confirmAssign", { user: confirmAction.payload })
            : t("caseDetail.confirmDeleteFile")}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmAction({ open: false, type: "", payload: null })}>{t("common.cancel")}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              if (confirmAction.type === "assign") doAssignCase();
              if (confirmAction.type === "deleteFile") doDeleteFile(confirmAction.payload);
            }}
          >
            {t("common.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={financialResetOpen} onClose={() => setFinancialResetOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Khởi tạo lại tài chính hồ sơ</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Thao tác này sẽ xóa toàn bộ phiếu thu, đặt lại Tổng chi phí và đưa hồ sơ về trạng thái Đã tiếp nhận.
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Lý do khởi tạo lại"
            value={financialResetReason}
            onChange={(e) => setFinancialResetReason(e.target.value)}
            placeholder="Nhập lý do để ghi nhận audit..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinancialResetOpen(false)}>{t("common.cancel")}</Button>
          <Button color="warning" variant="contained" onClick={resetFinancialFlow} disabled={loading}>
            {t("common.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
      <ToastHost toast={toast} onClose={closeToast} />
    </Dialog>
  );
}