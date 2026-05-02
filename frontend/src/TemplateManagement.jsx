import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "./apiBase";
import axios from "axios";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  IconButton,
  Menu,
  TablePagination,
  MenuItem as MuiMenuItem,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";
import { downloadCsvFile, getExportTimestamp } from "./utils/csvExport";

const EMPTY_FORM = {
  id: null,
  name: "",
  code: "",
  category: "Mua bán",
  content: "",
  sourceDocxPath: "",
  sourceDocxName: "",
  useSourceDocx: false,
};
const TEMPLATE_CATEGORY_OPTIONS = [
  { value: "Mua bán", labelKey: "templateManagement.categorySalePurchase" },
  { value: "Ủy quyền", labelKey: "templateManagement.categoryAuthorization" },
  { value: "Thừa kế", labelKey: "templateManagement.categoryInheritance" },
  { value: "Di chúc", labelKey: "templateManagement.categoryWill" },
  { value: "Chứng thực", labelKey: "templateManagement.categoryCertification" },
  { value: "Khác", labelKey: "templateManagement.categoryOther" },
];
const REQUIRED_SOURCE_TOKENS = [
  "{{CASE_CUSTOMER_NAME}}",
  "{{CASE_CUSTOMER_DATE_OF_BIRTH}}",
  "{{CASE_PHONE}}",
  "{{CUSTOMER_EMAIL}}",
  "{{CUSTOMER_ADDRESS}}",
];
const TOKEN_GUIDE_ITEMS = [
  { token: "{{CASE_ID}}", description: "ID hồ sơ nội bộ" },
  { token: "{{CASE_CASE_ID}}", description: "Mã hồ sơ (ví dụ HS-20260429-0001)" },
  { token: "{{CASE_CUSTOMER_ID}}", description: "Mã khách hàng liên kết trong hồ sơ" },
  { token: "{{CASE_CUSTOMER_NAME}}", description: "Tên khách hàng theo hồ sơ" },
  { token: "{{CASE_CUSTOMER_DATE_OF_BIRTH}}", description: "Ngày sinh khách hàng theo hồ sơ" },
  { token: "{{CASE_CUSTOMER_GENDER}}", description: "Giới tính dạng mã từ hồ sơ" },
  { token: "{{CASE_CUSTOMER_GENDER_LABEL}}", description: "Giới tính hiển thị (Nam/Nữ/Khác)" },
  { token: "{{CASE_PHONE}}", description: "Số điện thoại trong hồ sơ" },
  { token: "{{CASE_TYPE}}", description: "Loại giao dịch hồ sơ" },
  { token: "{{CASE_STATUS}}", description: "Trạng thái hồ sơ" },
  { token: "{{CASE_ASSIGNED_TO}}", description: "Người được phân công xử lý" },
  { token: "{{CASE_NOTES}}", description: "Ghi chú hồ sơ" },
  { token: "{{CASE_DESCRIPTION}}", description: "Mô tả hồ sơ" },
  { token: "{{CUSTOMER_FULL_NAME}}", description: "Họ tên đầy đủ từ hồ sơ khách hàng" },
  { token: "{{CUSTOMER_PHONE}}", description: "Số điện thoại khách hàng" },
  { token: "{{CUSTOMER_EMAIL}}", description: "Email khách hàng" },
  { token: "{{CUSTOMER_ID_NUMBER}}", description: "CCCD/CMND khách hàng" },
  { token: "{{CUSTOMER_ADDRESS}}", description: "Địa chỉ khách hàng" },
  { token: "{{CUSTOMER_DATE_OF_BIRTH}}", description: "Ngày sinh khách hàng từ danh mục khách hàng" },
  { token: "{{CUSTOMER_GENDER_LABEL}}", description: "Giới tính khách hàng dạng hiển thị" },
  { token: "{{CASE_FEE_AMOUNT}}", description: "Tổng chi phí hồ sơ" },
  { token: "{{CASE_FEE_PAID}}", description: "Tổng tiền đã thu" },
  { token: "{{CASE_FEE_RECEIPT_NO}}", description: "Số phiếu thu" },
  { token: "{{CASE_PAYMENT_METHOD}}", description: "Phương thức thanh toán" },
  { token: "{{CASE_PUBLIC_TRACKING_CODE}}", description: "Mã tra cứu công khai" },
  { token: "{{CASE_CREATED_AT}}", description: "Thời điểm tạo hồ sơ" },
  { token: "{{CASE_UPDATED_AT}}", description: "Thời điểm cập nhật hồ sơ" },
  { token: "{{OFFICE_GENERATED_AT}}", description: "Thời điểm sinh văn bản" },
  { token: "{{OFFICE_GENERATED_BY}}", description: "Tài khoản sinh văn bản" },
  { token: "{{template.content}}", description: "Chèn toàn bộ nội dung template editor vào vị trí token" },
];
export default function TemplateManagement({ userRole = "", username = "" }) {
  const { t, language } = useI18n();
  const editorRef = useRef(null);
  const importFileInputRef = useRef(null);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [workflowTargetTemplateId, setWorkflowTargetTemplateId] = useState(null);
  const [pendingWorkflowAction, setPendingWorkflowAction] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionMenu, setActionMenu] = useState({ anchorEl: null, template: null });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sourceTokenReport, setSourceTokenReport] = useState({
    detectedTokens: [],
    missingRequiredTokens: [],
    hasTemplateAnchor: false,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWordUrl, setPreviewWordUrl] = useState("");
  const [previewWordLoading, setPreviewWordLoading] = useState(false);
  const [previewMergedHtml, setPreviewMergedHtml] = useState("");
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versionRows, setVersionRows] = useState([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionTemplate, setVersionTemplate] = useState(null);
  const normalizeRoleKey = (roleValue) => {
    const normalized = String(roleValue || "").trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "notary") return "notary_officer";
    if (normalized === "ketoan") return "accountant";
    return normalized;
  };
  const normalizedRole = normalizeRoleKey(userRole);
  const isAdminRole = normalizedRole === "admin";
  const canReview = normalizedRole === "notary_officer" || normalizedRole === "admin";
  const canApprove = normalizedRole === "admin";
  const [templateSort, setTemplateSort] = useState({ field: "name", direction: "asc" });
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const TEMPLATE_SORT_LABELS = {
    name: t("templateManagement.name"),
    code: t("templateManagement.code"),
    category: t("templateManagement.category"),
    version: t("templateManagement.version"),
    isActive: t("templateManagement.status"),
  };
  const TEMPLATE_STATUS_LABELS = {
    DRAFT: t("templateManagement.statusDraft"),
    UNDER_REVIEW: t("templateManagement.statusUnderReview"),
    PENDING_APPROVAL: t("templateManagement.statusPendingApproval"),
    APPROVED: t("templateManagement.statusApproved"),
    REJECTED: t("templateManagement.statusRejected"),
  };
  const codePreview = useMemo(() => {
    const prefix = "TMPL";
    const numbers = templates
      .filter((item) => String(item.code || "").startsWith(`${prefix}_`))
      .map((item) => Number(String(item.code || "").slice(prefix.length + 1)))
      .filter((value) => Number.isInteger(value) && value > 0);
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `${prefix}_${String(next).padStart(3, "0")}`;
  }, [templates]);
  const displayedCode = form.id ? form.code : codePreview;
  const sanitizeEditorHtml = (html) => {
    const raw = String(html || "");
    if (!raw.trim()) return "";
    const wrapper = document.createElement("div");
    wrapper.innerHTML = raw;
    wrapper.querySelectorAll("style,script,link,meta").forEach((node) => node.remove());
    wrapper.querySelectorAll("*").forEach((node) => {
      node.removeAttribute("style");
      node.removeAttribute("class");
      node.removeAttribute("id");
      node.removeAttribute("color");
      node.removeAttribute("bgcolor");
      node.removeAttribute("face");
    });
    // DOCX imports often contain deeply nested span/font tags that make
    // contentEditable caret behavior unstable; unwrap while keeping text/children.
    wrapper.querySelectorAll("span,font").forEach((node) => {
      const parent = node.parentNode;
      if (!parent) return;
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
    });
    return wrapper.innerHTML;
  };

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(API_BASE + "/templates");
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(error);
      setTemplates([]);
    }
  };
  const buildPreviewWord = async ({ openAfterGenerate = false } = {}) => {
    setPreviewWordLoading(true);
    setPreviewWordUrl("");
    try {
      const { data } = await axios.post(API_BASE + "/templates/preview-word", {
        content: form.content || "",
        name: form.name || "template",
        sourceDocxPath: form.sourceDocxPath || null,
      });
      if (data?.url) {
        setPreviewWordUrl(data.url);
        if (openAfterGenerate) {
          window.open(data.url, "_blank", "noopener,noreferrer");
        }
      }
      setPreviewMergedHtml(String(data?.mergedHtml || ""));
    } catch (error) {
      console.error(error);
      toastApi.error(error?.response?.data || t("templateManagement.previewError"));
      setPreviewMergedHtml("");
    } finally {
      setPreviewWordLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);
  useEffect(() => {
    if (!open) return;
    const initialContent = sanitizeEditorHtml(form.content || "");
    const syncEditorContent = () => {
      if (!editorRef.current) return;
      // Only hydrate editor content on open/template switch.
      // Do not re-sync on every keystroke to avoid caret jumping.
      editorRef.current.innerHTML = initialContent;
    };
    // Dialog can mount contentEditable slightly later than state update.
    // Retry once after transition tick to guarantee editor gets loaded content.
    const rafId = requestAnimationFrame(syncEditorContent);
    const timeoutId = setTimeout(syncEditorContent, 120);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [open, form.id]);

  const saveTemplate = async () => {
    if (!form.name.trim() || !form.category.trim() || !form.sourceDocxPath) {
      toastApi.warning(t("templateManagement.requireFields"));
      return;
    }
    setLoading(true);
    try {
      if (form.id) {
        await axios.put(`${API_BASE}/templates/${form.id}`, {
          name: form.name.trim(),
          category: form.category.trim(),
          content: form.content.trim(),
          sourceDocxPath: form.sourceDocxPath || null,
          sourceDocxName: form.sourceDocxName || null,
          useSourceDocx: Boolean(form.useSourceDocx),
        });
      } else {
        await axios.post(API_BASE + "/templates", {
          name: form.name.trim(),
          category: form.category.trim(),
          content: form.content.trim(),
          sourceDocxPath: form.sourceDocxPath || null,
          sourceDocxName: form.sourceDocxName || null,
          useSourceDocx: Boolean(form.useSourceDocx),
        });
      }
      toastApi.success(t("templateManagement.saveSuccess"));
      setOpen(false);
      setForm(EMPTY_FORM);
      setSourceTokenReport({ detectedTokens: [], missingRequiredTokens: [], hasTemplateAnchor: false });
      fetchTemplates();
    } catch (error) {
      console.error(error);
      toastApi.error(error?.response?.data || error?.response?.data?.message || t("templateManagement.saveError"));
    } finally {
      setLoading(false);
    }
  };
  const closeTemplateDialog = () => {
    setOpen(false);
    setWorkflowTargetTemplateId(null);
    setPendingWorkflowAction("");
  };

  const removeTemplate = async (id) => {
    try {
      await axios.delete(`${API_BASE}/templates/${id}`);
      toastApi.success(t("templateManagement.deleteSuccess"));
      fetchTemplates();
    } catch (error) {
      console.error(error);
      toastApi.error(t("templateManagement.deleteError"));
    }
  };
  const openVersionHistory = async (template) => {
    setVersionTemplate(template);
    setVersionHistoryOpen(true);
    setVersionLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/templates/${template.id}/versions`);
      setVersionRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(error);
      setVersionRows([]);
      toastApi.error(t("templateManagement.fetchVersionHistoryError"));
    } finally {
      setVersionLoading(false);
    }
  };
  const restoreTemplateVersion = async (versionId) => {
    if (!versionTemplate?.id) return;
    try {
      await axios.post(`${API_BASE}/templates/${versionTemplate.id}/restore/${versionId}`);
      toastApi.success(t("templateManagement.restoreVersionSuccess"));
      await openVersionHistory(versionTemplate);
      fetchTemplates();
    } catch (error) {
      console.error(error);
      toastApi.error(error?.response?.data || t("templateManagement.restoreVersionError"));
    }
  };
  const updateWorkflow = async (id, action) => {
    try {
      await axios.post(`${API_BASE}/templates/${id}/${action}`);
      toastApi.success(t("templateManagement.workflowUpdated"));
      fetchTemplates();
    } catch (error) {
      console.error(error);
      toastApi.error(t("templateManagement.workflowUpdateError"));
    }
  };
  const handleImportFile = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(API_BASE + "/templates/import-content", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const importedContent = String(response.data?.content || "");
      const nextContent = sanitizeEditorHtml(importedContent);
      if (!nextContent.trim()) throw new Error("EMPTY_CONTENT");
      setForm((prev) => ({
        ...prev,
        content: nextContent,
        sourceDocxPath: String(response.data?.sourceDocxPath || ""),
        sourceDocxName: String(response.data?.sourceDocxName || ""),
        useSourceDocx: Boolean(response.data?.useSourceDocx),
      }));
      const detectedTokens = Array.isArray(response.data?.detectedTokens) ? response.data.detectedTokens : [];
      const normalizedDetected = new Set(detectedTokens.map((item) => String(item || "").trim().toUpperCase()));
      const missingRequiredTokens = REQUIRED_SOURCE_TOKENS.filter((token) => !normalizedDetected.has(token.toUpperCase()));
      setSourceTokenReport({
        detectedTokens,
        missingRequiredTokens,
        hasTemplateAnchor: Boolean(response.data?.hasTemplateAnchor),
      });
      if (editorRef.current) editorRef.current.innerHTML = nextContent;
      toastApi.success(t("templateManagement.importFileSuccess"));
    } catch (error) {
      console.error(error);
      toastApi.error(error?.response?.data || t("templateManagement.importFileError"));
    } finally {
      event.target.value = "";
    }
  };

  const sortedTemplates = templates.slice().sort((a, b) => {
    const aValue = templateSort.field === "version" ? Number(a.version || 0) : String(a[templateSort.field] || "");
    const bValue = templateSort.field === "version" ? Number(b.version || 0) : String(b[templateSort.field] || "");
    if (typeof aValue === "number" && typeof bValue === "number") {
      return templateSort.direction === "asc" ? aValue - bValue : bValue - aValue;
    }
    const compared = aValue.localeCompare(bValue, "vi", { sensitivity: "base" });
    return templateSort.direction === "asc" ? compared : -compared;
  });
  const toggleTemplateSort = (field) => {
    setTemplateSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };
  const pagedTemplates = sortedTemplates.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const quickExportTemplates = () => {
    const dateLocale = language === "vi" ? "vi-VN" : "en-US";
    const headers = [
      t("templateManagement.name"),
      t("templateManagement.code"),
      t("templateManagement.category"),
      t("templateManagement.version"),
      t("templateManagement.status"),
      t("customers.createdBy"),
      t("customers.createdAt"),
      t("customers.updatedAt"),
    ];
    const rows = sortedTemplates.map((item) => [
      item.name || "",
      item.code || "",
      item.category || "",
      Number(item.version || 1),
      TEMPLATE_STATUS_LABELS[item.status] || item.status || "",
      item.createdBy || "",
      item.createdAt ? new Date(item.createdAt).toLocaleString(dateLocale) : "",
      item.updatedAt ? new Date(item.updatedAt).toLocaleString(dateLocale) : "",
    ]);
    const filename =
      language === "vi"
        ? `DanhSachBieuMau_Nhanh_${getExportTimestamp()}.csv`
        : `templates_quick_view_${getExportTimestamp()}.csv`;
    downloadCsvFile(filename, headers, rows);
    toastApi.success(language === "vi" ? "Đã kết xuất nhanh danh sách biểu mẫu." : "Template quick export completed.");
  };
  const openActionMenu = (event, template) => setActionMenu({ anchorEl: event.currentTarget, template });
  const closeActionMenu = () => setActionMenu({ anchorEl: null, template: null });
  const handleEditTemplate = async (item) => {
    try {
      const { data } = await axios.get(`${API_BASE}/templates/${item.id}`);
      setForm({
        id: data.id,
        name: data.name,
        code: data.code,
        category: data.category,
        content: data.content || "",
        sourceDocxPath: data.sourceDocxPath || "",
        sourceDocxName: data.sourceDocxName || "",
        useSourceDocx: Boolean(data.useSourceDocx),
      });
      setSourceTokenReport({ detectedTokens: [], missingRequiredTokens: [], hasTemplateAnchor: false });
      setOpen(true);
    } catch (error) {
      console.error(error);
      toastApi.error("Không thể tải nội dung biểu mẫu để chỉnh sửa");
    }
  };
  const canEditTemplate = (item) =>
    item.createdBy === username ||
    canApprove ||
    (canReview && item.status === "UNDER_REVIEW");
  const canDeleteTemplate = (item) => item.createdBy === username || canApprove;
  const canSubmitTemplate = (item) =>
    !isAdminRole && item.createdBy === username && item.status !== "UNDER_REVIEW";
  const canMarkReviewed = (item) =>
    !isAdminRole && canReview && item.status === "UNDER_REVIEW";
  const canApproveTemplateAction = (item) => canApprove && item.status !== "APPROVED";
  const canRejectTemplateAction = (item) => canApprove && item.status !== "REJECTED";
  const formatDateTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("vi-VN");
  };
  const renderStatusMetaLines = (item) => {
    const lines = [];
    if (item.createdBy) {
      lines.push(`${t("templateManagement.statusMetaCreatedBy")}: ${item.createdBy}`);
    }
    if (item.submittedAt) {
      lines.push(`${t("templateManagement.statusMetaSubmittedAt")}: ${formatDateTime(item.submittedAt)}`);
    }
    if (item.reviewedBy) {
      const reviewedAt = formatDateTime(item.reviewedAt);
      lines.push(
        `${t("templateManagement.statusMetaReviewedBy")}: ${item.reviewedBy}${reviewedAt ? ` (${reviewedAt})` : ""}`
      );
    }
    if (item.approvedBy) {
      const approvedAt = formatDateTime(item.approvedAt);
      const decisionLabel =
        item.status === "REJECTED"
          ? t("templateManagement.statusMetaRejectedBy")
          : t("templateManagement.statusMetaApprovedBy");
      lines.push(`${decisionLabel}: ${item.approvedBy}${approvedAt ? ` (${approvedAt})` : ""}`);
    }
    return lines;
  };

  return (
    <Box>
      <Stack sx={{ mb: 2, gap: 1 }}>
        <Typography variant="h5">{t("templateManagement.title")}</Typography>
        <Button
          variant="contained"
          onClick={() => {
            setForm({ ...EMPTY_FORM });
            setSourceTokenReport({ detectedTokens: [], missingRequiredTokens: [], hasTemplateAnchor: false });
            setWorkflowTargetTemplateId(null);
            setPendingWorkflowAction("");
            setOpen(true);
          }}
          sx={{ alignSelf: "flex-start" }}
        >
          {t("templateManagement.createBtn")}
        </Button>
        <Button variant="outlined" onClick={quickExportTemplates} sx={{ alignSelf: "flex-start" }}>
          {t("common.quickExportCsv")}
        </Button>
      </Stack>

      <TableContainer
        component={Paper}
        sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}
      >
        <Box sx={{ px: 2, pt: 1 }}>
          <Tooltip
            arrow
            title={`${t("templateManagement.sortBy")} "${TEMPLATE_SORT_LABELS[templateSort.field]}": ${
              templateSort.direction === "asc" ? t("templateManagement.asc") : t("templateManagement.desc")
            }`}
          >
            <Typography variant="caption" color="text.secondary">
              ↕ {t("templateManagement.sortBy")}: {TEMPLATE_SORT_LABELS[templateSort.field]} (
              {templateSort.direction === "asc" ? "A→Z" : "Z→A"})
            </Typography>
          </Tooltip>
        </Box>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={templateSort.field === "name"}
                  direction={templateSort.field === "name" ? templateSort.direction : "asc"}
                  onClick={() => toggleTemplateSort("name")}
                >
                  {t("templateManagement.name")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={templateSort.field === "code"}
                  direction={templateSort.field === "code" ? templateSort.direction : "asc"}
                  onClick={() => toggleTemplateSort("code")}
                >
                  {t("templateManagement.code")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={templateSort.field === "category"}
                  direction={templateSort.field === "category" ? templateSort.direction : "asc"}
                  onClick={() => toggleTemplateSort("category")}
                >
                  {t("templateManagement.category")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={templateSort.field === "version"}
                  direction={templateSort.field === "version" ? templateSort.direction : "asc"}
                  onClick={() => toggleTemplateSort("version")}
                >
                  {t("templateManagement.version")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={templateSort.field === "isActive"}
                  direction={templateSort.field === "isActive" ? templateSort.direction : "asc"}
                  onClick={() => toggleTemplateSort("isActive")}
                >
                  {t("templateManagement.status")}
                </TableSortLabel>
              </TableCell>
              <TableCell>{t("templateManagement.actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedTemplates.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell sx={{ maxWidth: 220 }}>
                  <Box sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</Box>
                </TableCell>
                <TableCell sx={{ fontFamily: "monospace" }}>{item.code}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell>v{item.version}</TableCell>
                <TableCell>
                  <Chip size="small" label={TEMPLATE_STATUS_LABELS[item.status] || item.status || "DRAFT"} />
                  {renderStatusMetaLines(item).map((line, idx) => (
                    <Typography
                      key={`${item.id}-status-meta-${idx}`}
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", lineHeight: 1.35, mt: idx === 0 ? 0.5 : 0.25 }}
                    >
                      {line}
                    </Typography>
                  ))}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={(event) => openActionMenu(event, item)}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={sortedTemplates.length}
          page={page}
          onPageChange={(_event, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(Number(event.target.value) || 10);
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage={t("common.rowsPerPage")}
          labelDisplayedRows={({ from, to, count }) =>
            t("common.paginationDisplayedRows", { from, to, count })
          }
        />
      </TableContainer>
      <Menu anchorEl={actionMenu.anchorEl} open={Boolean(actionMenu.anchorEl)} onClose={closeActionMenu}>
        {actionMenu.template && canEditTemplate(actionMenu.template) && (
          <MuiMenuItem
            onClick={async () => {
              await handleEditTemplate(actionMenu.template);
              closeActionMenu();
            }}
          >
            {t("templateManagement.edit")}
          </MuiMenuItem>
        )}
        {actionMenu.template && canDeleteTemplate(actionMenu.template) && (
          <MuiMenuItem
            onClick={() => {
              removeTemplate(actionMenu.template.id);
              closeActionMenu();
            }}
          >
            {t("templateManagement.delete")}
          </MuiMenuItem>
        )}
        {actionMenu.template && canEditTemplate(actionMenu.template) && (
          <MuiMenuItem
            onClick={() => {
              openVersionHistory(actionMenu.template);
              closeActionMenu();
            }}
          >
            {t("templateManagement.versionHistory")}
          </MuiMenuItem>
        )}
        {actionMenu.template && canSubmitTemplate(actionMenu.template) && (
          <MuiMenuItem
            onClick={() => {
              updateWorkflow(actionMenu.template.id, "submit-review");
              closeActionMenu();
            }}
          >
            {t("templateManagement.submitReview")}
          </MuiMenuItem>
        )}
        {actionMenu.template && canMarkReviewed(actionMenu.template) && (
          <MuiMenuItem
            onClick={async () => {
              const template = actionMenu.template;
              closeActionMenu();
              if (!template) return;
              setWorkflowTargetTemplateId(template.id);
              setPendingWorkflowAction("review");
              await handleEditTemplate(template);
            }}
          >
            {t("templateManagement.markReviewed")}
          </MuiMenuItem>
        )}
        {actionMenu.template && canApproveTemplateAction(actionMenu.template) && (
          <MuiMenuItem
            onClick={async () => {
              const template = actionMenu.template;
              closeActionMenu();
              if (!template) return;
              setWorkflowTargetTemplateId(template.id);
              setPendingWorkflowAction("approve");
              await handleEditTemplate(template);
            }}
          >
            {t("templateManagement.approve")}
          </MuiMenuItem>
        )}
        {actionMenu.template && canRejectTemplateAction(actionMenu.template) && (
          <MuiMenuItem
            onClick={async () => {
              const template = actionMenu.template;
              closeActionMenu();
              if (!template) return;
              setWorkflowTargetTemplateId(template.id);
              setPendingWorkflowAction("reject");
              await handleEditTemplate(template);
            }}
          >
            {t("templateManagement.reject")}
          </MuiMenuItem>
        )}
      </Menu>

      <Dialog open={open} onClose={closeTemplateDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {form.id ? t("templateManagement.updateTitle") : t("templateManagement.createTitle")}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 1 }}>
            <TextField
              label={t("templateManagement.templateName")}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              label={form.id ? t("templateManagement.templateCode") : t("templateManagement.codePreview")}
              value={displayedCode}
              fullWidth
              disabled
              helperText={
                form.id
                  ? t("templateManagement.codeLockedHint")
                  : `${t("templateManagement.autoCodeHint")} ${t("templateManagement.codeFinalHint")}`
              }
            />
            <FormControl fullWidth required>
              <InputLabel required>{t("templateManagement.templateCategory")}</InputLabel>
              <Select
                label={t("templateManagement.templateCategory")}
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              >
                {TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ width: "100%" }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Quy trình: tải file Word {"->"} kiểm tra token {"->"} chỉnh sửa ngoài Word {"->"} tải lại.
              </Typography>
              <Stack
                direction="row"
                useFlexGap
                sx={{
                  mb: 1.25,
                  flexWrap: "wrap",
                  alignItems: "center",
                  columnGap: 1.25,
                  rowGap: 1,
                }}
              >
                <Button
                  variant="outlined"
                  startIcon={<UploadFileIcon fontSize="small" />}
                  onClick={() => importFileInputRef.current?.click()}
                >
                  Tải file Word mẫu (.docx)
                </Button>
                <Button variant="outlined" onClick={() => setPreviewOpen(true)} disabled={!form.sourceDocxPath}>
                  Xem trước biểu mẫu
                </Button>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  style={{ display: "none" }}
                  onChange={handleImportFile}
                />
                {form.sourceDocxName && (
                  <Chip
                    size="small"
                    color="primary"
                    variant="outlined"
                    label={`${t("templateManagement.sourceWordAttached")}: ${form.sourceDocxName}`}
                  />
                )}
              </Stack>
              <Paper variant="outlined" sx={{ p: 1.5, mb: 1.25, borderColor: "divider" }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Danh sách token chuẩn và diễn giải
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Chèn các token này trực tiếp trong Microsoft Word, sau đó upload lại để hệ thống kiểm tra.
                </Typography>
                <Box sx={{ maxHeight: 220, overflowY: "auto", border: "1px dashed", borderColor: "divider", p: 1 }}>
                  {TOKEN_GUIDE_ITEMS.map((item) => (
                    <Box
                      key={item.token}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        py: 0.5,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Typography variant="body2" sx={{ fontFamily: "monospace", minWidth: 240 }}>
                        {item.token}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
                        {item.description}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                Nội dung trích từ Word (chỉ đọc)
              </Typography>
              <Box
                ref={editorRef}
                sx={{
                  minHeight: 280,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.25,
                  p: 1.5,
                  color: "#111111",
                  backgroundColor: "#f4f7fb",
                  whiteSpace: "pre-wrap",
                  overflow: "auto",
                  "&, & *": {
                    color: "inherit !important",
                    WebkitTextFillColor: "currentColor !important",
                    textShadow: "none !important",
                  },
                }}
                dangerouslySetInnerHTML={{ __html: sanitizeEditorHtml(form.content || "") }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTemplateDialog}>Hủy</Button>
          <Button variant="contained" onClick={saveTemplate} disabled={loading}>
            {loading ? t("templateManagement.saving") : t("common.save")}
          </Button>
          {workflowTargetTemplateId &&
            pendingWorkflowAction &&
            Number(form.id) === Number(workflowTargetTemplateId) && (
            <Button
              variant={pendingWorkflowAction === "reject" ? "contained" : "outlined"}
              color={pendingWorkflowAction === "reject" ? "error" : "primary"}
              onClick={async () => {
                await updateWorkflow(workflowTargetTemplateId, pendingWorkflowAction);
                closeTemplateDialog();
              }}
              disabled={loading}
            >
              {pendingWorkflowAction === "review"
                ? t("templateManagement.confirmReviewed")
                : pendingWorkflowAction === "approve"
                  ? t("templateManagement.approve")
                  : t("templateManagement.reject")}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Dialog
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewWordUrl("");
          setPreviewMergedHtml("");
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t("templateManagement.previewTitle")}</DialogTitle>
        <DialogContent>
          <Button
            variant="contained"
            size="small"
            onClick={() => buildPreviewWord({ openAfterGenerate: true })}
            disabled={previewWordLoading}
            sx={{ mb: 1.5 }}
          >
            {previewWordLoading ? t("common.loading") : "Tạo và mở bản Word xem trước"}
          </Button>
          {previewWordUrl ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.25 }}>
              Đã tạo bản xem trước. Nếu trình duyệt chặn popup, hãy cho phép popup để mở file Word tự động.
            </Typography>
          ) : null}
          {form.sourceDocxPath ? (
            <Box
              sx={{
                mb: 1.5,
                p: 1.25,
                border: "1px dashed",
                borderColor: "primary.main",
                borderRadius: 1,
                backgroundColor: "#f5f9ff",
              }}
            >
              <Typography variant="body2" sx={{ mb: 1 }}>
                {t("templateManagement.sourceWordPreviewNote")} (File gốc không chứa dữ liệu đã merge)
              </Typography>
            </Box>
          ) : null}
          <Box
            sx={{
              minHeight: 320,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              p: 2,
              backgroundColor: "#fff",
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeEditorHtml(previewMergedHtml || form.content || "") }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={versionHistoryOpen} onClose={() => setVersionHistoryOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t("templateManagement.versionHistoryTitle")}</DialogTitle>
        <DialogContent>
          {versionLoading ? (
            <Typography variant="body2" color="text.secondary">
              {t("common.loading")}
            </Typography>
          ) : versionRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("templateManagement.versionNoData")}
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ border: "1px solid", borderColor: "divider" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("templateManagement.version")}</TableCell>
                    <TableCell>{t("templateManagement.versionChangedBy")}</TableCell>
                    <TableCell>{t("templateManagement.versionChangedAt")}</TableCell>
                    <TableCell>{t("templateManagement.actions")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {versionRows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>v{row.version}</TableCell>
                      <TableCell>{row.changedBy || "-"}</TableCell>
                      <TableCell>{formatDateTime(row.changedAt) || "-"}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => restoreTemplateVersion(row.id)}>
                          {t("templateManagement.restoreVersion")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionHistoryOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>
      <ToastHost toast={toast} onClose={closeToast} />
    </Box>
  );
}
