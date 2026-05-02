import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Box,
  Paper,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TablePagination,
  TableSortLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Menu,
  ListItemIcon,
  ListItemText,
  Chip,
  Tooltip,
  InputAdornment,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useI18n } from "./i18n";
import { downloadCsvFile, getExportTimestamp } from "./utils/csvExport";

export default function ReceiptManagement({ cases = [], focusCaseId = null, onFocusConsumed, toastApi }) {
  const { t, language } = useI18n();
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
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [caseIdFilter, setCaseIdFilter] = useState(focusCaseId ? String(focusCaseId) : "");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [minAmountFilter, setMinAmountFilter] = useState("");
  const [maxAmountFilter, setMaxAmountFilter] = useState("");
  const [receiptSort, setReceiptSort] = useState({ field: "collectedAt", direction: "desc" });
  const [form, setForm] = useState({
    caseId: focusCaseId ? String(focusCaseId) : "",
    amount: "",
    paymentMethod: "CASH",
    receiptNo: "",
    note: "",
  });
  const [totalCostInput, setTotalCostInput] = useState("");
  const [editingReceiptId, setEditingReceiptId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [actionMenu, setActionMenu] = useState({ anchorEl: null, receipt: null });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const normalizedAmountInput = Number(String(form.amount || "").replace(/[^\d.]/g, "")) || 0;
  const normalizedTotalCostInput = Number(String(totalCostInput || "").replace(/[^\d.]/g, "")) || 0;
  const selectedCase = useMemo(
    () => cases.find((item) => String(item.id) === String(form.caseId || "")) || null,
    [cases, form.caseId]
  );
  const selectedCaseReceipts = useMemo(
    () => receipts.filter((item) => String(item.caseId) === String(form.caseId || "")),
    [receipts, form.caseId]
  );
  const selectedCaseCollectedExcludingEditing = useMemo(() => {
    return selectedCaseReceipts.reduce((sum, item) => {
      if (editingReceiptId && Number(item.id) === Number(editingReceiptId)) return sum;
      return sum + Number(item.amount || 0);
    }, 0);
  }, [selectedCaseReceipts, editingReceiptId]);
  const selectedCaseProjectedTotal = selectedCaseCollectedExcludingEditing + normalizedAmountInput;
  const effectiveTotalCost =
    normalizedTotalCostInput > 0 ? normalizedTotalCostInput : Number(selectedCase?.feeAmount || 0);
  const currentCaseFeeAmount = Number(selectedCase?.feeAmount || 0);
  const willExceedTotalCost =
    effectiveTotalCost > 0 && normalizedAmountInput > 0 && selectedCaseProjectedTotal > effectiveTotalCost;
  const remainingAmount = Math.max(0, effectiveTotalCost - selectedCaseCollectedExcludingEditing);
  const statusKey = String(selectedCase?.status || "").toUpperCase();
  const paidAmount = Number(selectedCase?.feePaid || 0);
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
  const totalCostViolatesStatusRule =
    normalizedTotalCostInput > 0 &&
    maxTotalCostAllowedByStatus !== null &&
    normalizedTotalCostInput > maxTotalCostAllowedByStatus + 0.000001;
  const totalCostCheckpointTooltip = requiresFullCheckpoint
    ? `Hồ sơ đã ở bước Lưu trữ. Để giữ đủ điều kiện đã thu 100%, Tổng chi phí nên tối đa ${Math.floor(
        maxTotalCostAllowedByStatus || 0
      ).toLocaleString("vi-VN")} VNĐ.`
    : requiresThirtyPercentCheckpoint
      ? `Hồ sơ đã qua mốc pháp lý. Để giữ điều kiện đã thu tối thiểu 30%, Tổng chi phí nên tối đa ${Math.floor(
          maxTotalCostAllowedByStatus || 0
        ).toLocaleString("vi-VN")} VNĐ.`
      : "Bạn có thể cập nhật Tổng chi phí theo nghiệp vụ hiện tại.";
  const updateCaseTotalCostFromReceiptScreen = async () => {
    if (!form.caseId) return;
    const totalCostValue = Number(String(totalCostInput || "").replace(/[^\d.]/g, ""));
    if (totalCostValue <= 0 || totalCostValue === currentCaseFeeAmount) return;
    if (totalCostViolatesStatusRule) {
      toastApi?.warning?.(totalCostCheckpointTooltip);
      return;
    }
    try {
      await axios.put(`http://localhost:4000/cases/${Number(form.caseId)}/fee`, {
        feeAmount: totalCostValue,
      });
      toastApi?.success?.("Đã cập nhật Tổng chi phí của hồ sơ.");
      await fetchReceipts();
    } catch (error) {
      console.error(error);
      toastApi?.error?.(error?.response?.data || "Không thể cập nhật Tổng chi phí.");
    }
  };

  useEffect(() => {
    if (focusCaseId) {
      const value = String(focusCaseId);
      setCaseIdFilter(value);
      setForm((prev) => ({ ...prev, caseId: value }));
      onFocusConsumed?.();
    }
  }, [focusCaseId, onFocusConsumed]);
  useEffect(() => {
    const selectedCase = cases.find((item) => String(item.id) === String(form.caseId || ""));
    if (selectedCase) {
      setTotalCostInput(String(Number(selectedCase.feeAmount || 0)));
    } else {
      setTotalCostInput("");
    }
  }, [form.caseId, cases]);

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (caseIdFilter) params.set("caseId", caseIdFilter);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const res = await axios.get(`http://localhost:4000/receipts${suffix}`);
      setReceipts(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(error);
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, [caseIdFilter]);

  const filteredReceipts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const minValue = Number(String(minAmountFilter || "").replace(/[^\d.]/g, ""));
    const maxValue = Number(String(maxAmountFilter || "").replace(/[^\d.]/g, ""));
    return receipts.filter((item) => {
      const amount = Number(item.amount || 0);
      const matchQuery =
        !q ||
        [item.receiptNo, item.case?.caseId, item.case?.customerName, item.note, item.collectedBy]
          .map((v) => String(v || "").toLowerCase())
          .some((v) => v.includes(q));
      const matchMethod = !paymentMethodFilter || item.paymentMethod === paymentMethodFilter;
      const matchMin = !minAmountFilter || amount >= minValue;
      const matchMax = !maxAmountFilter || amount <= maxValue;
      return matchQuery && matchMethod && matchMin && matchMax;
    });
  }, [receipts, query, paymentMethodFilter, minAmountFilter, maxAmountFilter]);
  const sortedReceipts = useMemo(() => {
    const items = filteredReceipts.slice();
    const getValue = (item) => {
      if (receiptSort.field === "amount") return Number(item.amount || 0);
      if (receiptSort.field === "feeAmount") return Number(item.case?.feeAmount || 0);
      if (receiptSort.field === "collectedAt") return new Date(item.collectedAt || 0).getTime();
      if (receiptSort.field === "paymentMethod") return String(item.paymentMethod || "");
      if (receiptSort.field === "caseId") return String(item.case?.caseId || "");
      if (receiptSort.field === "customerName") return String(item.case?.customerName || "");
      return String(item[receiptSort.field] || "");
    };
    return items.sort((a, b) => {
      const aValue = getValue(a);
      const bValue = getValue(b);
      if (typeof aValue === "number" && typeof bValue === "number") {
        return receiptSort.direction === "asc" ? aValue - bValue : bValue - aValue;
      }
      const compared = String(aValue).localeCompare(String(bValue), "vi", { sensitivity: "base" });
      return receiptSort.direction === "asc" ? compared : -compared;
    });
  }, [filteredReceipts, receiptSort]);
  const totalCollected = useMemo(
    () => filteredReceipts.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [filteredReceipts]
  );
  const pagedReceipts = sortedReceipts.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sortedReceipts.length / rowsPerPage) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [sortedReceipts.length, rowsPerPage, page]);

  const createReceipt = async () => {
    if (!form.caseId || !Number(form.amount || 0)) {
      toastApi?.warning?.(t("receipts.amountRequired"));
      return;
    }
    try {
      const totalCostValue = Number(String(totalCostInput || "").replace(/[^\d.]/g, ""));
      if (totalCostValue <= 0 && currentCaseFeeAmount <= 0) {
        toastApi?.warning?.("Vui lòng cập nhật Tổng chi phí trước khi tạo phiếu thu.");
        return;
      }
      if (totalCostViolatesStatusRule) {
        toastApi?.warning?.(totalCostCheckpointTooltip);
        return;
      }
      if (totalCostValue > 0 && totalCostValue !== currentCaseFeeAmount) {
        await axios.put(`http://localhost:4000/cases/${Number(form.caseId)}/fee`, {
          feeAmount: totalCostValue,
        });
      }
      if (willExceedTotalCost) {
        toastApi?.warning?.(t("receipts.exceedsCaseTotal"));
        return;
      }
      const payload = {
        caseId: Number(form.caseId),
        amount: Number(String(form.amount).replace(/[^\d.]/g, "")),
        paymentMethod: form.paymentMethod,
        receiptNo: form.receiptNo || undefined,
        note: form.note || "",
      };
      if (editingReceiptId) {
        await axios.put(`http://localhost:4000/receipts/${editingReceiptId}`, payload);
        toastApi?.success?.(t("receipts.updateSuccess"));
      } else {
        await axios.post("http://localhost:4000/receipts", payload);
        toastApi?.success?.(t("receipts.createSuccess"));
      }
      setForm((prev) => ({ ...prev, amount: "", receiptNo: "", note: "" }));
      setEditingReceiptId(null);
      fetchReceipts();
    } catch (error) {
      console.error(error);
      toastApi?.error?.(error?.response?.data || t("receipts.createError"));
    }
  };
  const startEdit = (receipt) => {
    setEditingReceiptId(receipt.id);
    setForm({
      caseId: String(receipt.caseId),
      amount: String(receipt.amount || ""),
      paymentMethod: receipt.paymentMethod || "CASH",
      receiptNo: receipt.receiptNo || "",
      note: receipt.note || "",
    });
  };
  const deleteReceipt = async () => {
    if (!confirmDeleteId) return;
    try {
      await axios.delete(`http://localhost:4000/receipts/${confirmDeleteId}`);
      toastApi?.success?.(t("receipts.deleteSuccess"));
      setConfirmDeleteId(null);
      if (editingReceiptId === confirmDeleteId) {
        setEditingReceiptId(null);
        setForm((prev) => ({ ...prev, amount: "", receiptNo: "", note: "" }));
      }
      fetchReceipts();
    } catch (error) {
      console.error(error);
      toastApi?.error?.(error?.response?.data || t("receipts.deleteError"));
    }
  };
  const exportReceiptReport = async () => {
    try {
      const res = await axios.get("http://localhost:4000/receipts/export", {
        params: { lang: language === "en" ? "en" : "vi" },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      const fallbackFilename =
        language === "vi"
          ? `BaoCaoPhieuThu_${new Date().toISOString().slice(0, 10)}.csv`
          : `ReceiptReport_${new Date().toISOString().slice(0, 10)}.csv`;
      link.download = getFilenameFromDisposition(res.headers?.["content-disposition"], fallbackFilename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      toastApi?.error?.(error?.response?.data || t("receipts.exportError"));
    }
  };
  const quickExportReceiptView = () => {
    const dateLocale = language === "vi" ? "vi-VN" : "en-US";
    const headers = [
      t("receipts.receiptNo"),
      t("receipts.caseLabel"),
      t("receipts.customerName"),
      t("app.totalFeeAmount"),
      t("receipts.amount"),
      t("receipts.method"),
      t("receipts.collectedBy"),
      t("receipts.collectedAt"),
    ];
    const rows = sortedReceipts.map((item) => [
      item.receiptNo || "",
      item.case?.caseId || "",
      item.case?.customerName || "",
      Number(item.case?.feeAmount || 0),
      Number(item.amount || 0),
      item.paymentMethod === "BANK_TRANSFER" ? t("receipts.methodTransfer") : t("receipts.methodCash"),
      item.collectedBy || "",
      item.collectedAt ? new Date(item.collectedAt).toLocaleString(dateLocale) : "",
    ]);
    const filename =
      language === "vi"
        ? `DanhSachPhieuThu_Nhanh_${getExportTimestamp()}.csv`
        : `receipts_quick_view_${getExportTimestamp()}.csv`;
    downloadCsvFile(filename, headers, rows);
    toastApi?.success?.(
      language === "vi"
        ? "Đã kết xuất nhanh danh sách phiếu thu theo view hiện tại."
        : "Receipt quick export completed for current list view."
    );
  };
  const openActionMenu = (event, receipt) => {
    setActionMenu({ anchorEl: event.currentTarget, receipt });
  };
  const closeActionMenu = () => {
    setActionMenu({ anchorEl: null, receipt: null });
  };
  const toggleReceiptSort = (field) => {
    setReceiptSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <Box>
      <Typography variant="h5" mb={2}>
        {t("receipts.title")}
      </Typography>
      <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold" mb={1}>
          {editingReceiptId ? t("receipts.updateTitle") : t("receipts.createTitle")}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 1.5 }}>
          <FormControl size="small" fullWidth sx={{ minWidth: 240 }} required>
            <InputLabel required>{t("receipts.case")}</InputLabel>
            <Select
              value={form.caseId}
              label={t("receipts.case")}
              onChange={(e) => setForm((prev) => ({ ...prev, caseId: e.target.value }))}
              MenuProps={{ PaperProps: { style: { maxHeight: 360 } } }}
            >
              {cases.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.caseId} - {c.customerName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label={t("receipts.amount")}
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
            fullWidth
            required
            error={willExceedTotalCost}
            helperText={
              willExceedTotalCost
                ? t("receipts.exceedsCaseTotal")
                : effectiveTotalCost > 0
                  ? `Hiện tại hồ sơ tạm thiếu ${Number(remainingAmount || 0).toLocaleString("vi-VN")} VNĐ`
                  : ""
            }
          />
          <TextField
            size="small"
            label="Tổng chi phí"
            value={totalCostInput}
            onChange={(e) => setTotalCostInput(e.target.value)}
            onBlur={updateCaseTotalCostFromReceiptScreen}
            fullWidth
            error={totalCostViolatesStatusRule}
            helperText={
              totalCostViolatesStatusRule
                ? totalCostCheckpointTooltip
                : currentCaseFeeAmount > 0
                ? "Nhập và rời ô để cập nhật Tổng chi phí hồ sơ."
                : "Hồ sơ này chưa có Tổng chi phí. Nhập tại đây để cập nhật ngay."
            }
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={totalCostCheckpointTooltip} arrow>
                    <InfoOutlinedIcon fontSize="small" color="action" />
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />
          <FormControl size="small" fullWidth sx={{ minWidth: 220 }} required>
            <InputLabel required>{t("receipts.paymentMethod")}</InputLabel>
            <Select
              value={form.paymentMethod}
              label={t("receipts.paymentMethod")}
              onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
            >
              <MenuItem value="CASH">{t("receipts.methodCash")}</MenuItem>
              <MenuItem value="BANK_TRANSFER">{t("receipts.methodTransfer")}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label={t("receipts.receiptNoOptional")}
            value={form.receiptNo}
            onChange={(e) => setForm((prev) => ({ ...prev, receiptNo: e.target.value }))}
            fullWidth
            helperText="Để trống để hệ thống tự tạo số phiếu."
          />
          <TextField
            size="small"
            label={t("receipts.note")}
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
            fullWidth
          />
        </Box>
        <Button variant="contained" sx={{ mt: 1.5 }} onClick={createReceipt} disabled={willExceedTotalCost}>
          {editingReceiptId ? t("receipts.saveUpdate") : t("receipts.saveCreate")}
        </Button>
        {editingReceiptId && (
          <Button
            variant="text"
            sx={{ mt: 1.5, ml: 1 }}
            onClick={() => {
              setEditingReceiptId(null);
              setForm((prev) => ({ ...prev, amount: "", receiptNo: "", note: "" }));
            }}
          >
            {t("receipts.cancelEdit")}
          </Button>
        )}
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
          <TextField
            size="small"
            label={t("receipts.search")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t("receipts.method")}</InputLabel>
            <Select
              value={paymentMethodFilter}
              label={t("receipts.method")}
              onChange={(e) => {
                setPaymentMethodFilter(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">{t("receipts.all")}</MenuItem>
              <MenuItem value="CASH">{t("receipts.methodCash")}</MenuItem>
              <MenuItem value="BANK_TRANSFER">{t("receipts.methodTransfer")}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label={t("receipts.amountFrom")}
            value={minAmountFilter}
            onChange={(e) => {
              setMinAmountFilter(e.target.value);
              setPage(0);
            }}
            sx={{ width: 140 }}
          />
          <TextField
            size="small"
            label={t("receipts.amountTo")}
            value={maxAmountFilter}
            onChange={(e) => {
              setMaxAmountFilter(e.target.value);
              setPage(0);
            }}
            sx={{ width: 140 }}
          />
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>{t("receipts.filterByCase")}</InputLabel>
            <Select
              value={caseIdFilter}
              label={t("receipts.filterByCase")}
              onChange={(e) => setCaseIdFilter(e.target.value)}
            >
              <MenuItem value="">{t("receipts.allCases")}</MenuItem>
              {cases.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.caseId}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" onClick={fetchReceipts} disabled={loading}>
            {t("receipts.refresh")}
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setQuery("");
              setPaymentMethodFilter("");
              setMinAmountFilter("");
              setMaxAmountFilter("");
              setCaseIdFilter("");
              setReceiptSort({ field: "collectedAt", direction: "desc" });
              setPage(0);
            }}
          >
            {t("receipts.clearFilters")}
          </Button>
          <Button variant="contained" onClick={exportReceiptReport}>
            {t("receipts.exportReport")}
          </Button>
          <Button variant="contained" color="secondary" onClick={quickExportReceiptView}>
            {t("common.quickExportCsv")}
          </Button>
        </Box>
        {(query.trim() ||
          caseIdFilter ||
          paymentMethodFilter ||
          minAmountFilter ||
          maxAmountFilter ||
          receiptSort.field !== "collectedAt" ||
          receiptSort.direction !== "desc") && (
          <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
            {query.trim() && (
              <Chip
                size="small"
                color="primary"
                label={`${t("receipts.keyword")}: ${query.trim()}`}
                onDelete={() => {
                  setQuery("");
                  setPage(0);
                }}
              />
            )}
            {caseIdFilter && (
              <Chip
                size="small"
                color="primary"
                label={`${t("receipts.caseLabel")}: ${cases.find((c) => String(c.id) === caseIdFilter)?.caseId || caseIdFilter}`}
                onDelete={() => {
                  setCaseIdFilter("");
                  setPage(0);
                }}
              />
            )}
            {paymentMethodFilter && (
              <Chip
                size="small"
                color="primary"
                label={`${t("receipts.method")}: ${paymentMethodFilter === "BANK_TRANSFER" ? t("receipts.methodTransfer") : t("receipts.methodCash")}`}
                onDelete={() => {
                  setPaymentMethodFilter("");
                  setPage(0);
                }}
              />
            )}
            {minAmountFilter && (
              <Chip
                size="small"
                variant="outlined"
                label={`${t("receipts.amountFrom")}: ${minAmountFilter}`}
                onDelete={() => {
                  setMinAmountFilter("");
                  setPage(0);
                }}
              />
            )}
            {maxAmountFilter && (
              <Chip
                size="small"
                variant="outlined"
                label={`${t("receipts.amountTo")}: ${maxAmountFilter}`}
                onDelete={() => {
                  setMaxAmountFilter("");
                  setPage(0);
                }}
              />
            )}
            {(receiptSort.field !== "collectedAt" || receiptSort.direction !== "desc") && (
              <Chip
                size="small"
                variant="outlined"
                label={`${t("receipts.sortBy")}: ${
                  {
                    caseId: t("receipts.caseLabel"),
                    feeAmount: t("app.totalFeeAmount"),
                    amount: t("receipts.amount"),
                    paymentMethod: t("receipts.method"),
                    collectedBy: t("receipts.collectedBy"),
                    collectedAt: t("receipts.collectedAt"),
                  }[receiptSort.field] || receiptSort.field
                } (${receiptSort.direction === "asc" ? t("customers.ascending") : t("customers.descending")})`}
                onDelete={() => setReceiptSort({ field: "collectedAt", direction: "desc" })}
              />
            )}
          </Box>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t("receipts.totalCollected")}: {totalCollected.toLocaleString(language === "vi" ? "vi-VN" : "en-US")} đ
        </Typography>
        <TableContainer sx={{ maxHeight: 480, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>{t("receipts.receiptNo")}</TableCell>
              <TableCell>
                <TableSortLabel
                  active={receiptSort.field === "caseId"}
                  direction={receiptSort.field === "caseId" ? receiptSort.direction : "asc"}
                  onClick={() => toggleReceiptSort("caseId")}
                >
                  {t("receipts.caseLabel")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={receiptSort.field === "customerName"}
                  direction={receiptSort.field === "customerName" ? receiptSort.direction : "asc"}
                  onClick={() => toggleReceiptSort("customerName")}
                >
                  {t("receipts.customerName")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={receiptSort.field === "feeAmount"}
                  direction={receiptSort.field === "feeAmount" ? receiptSort.direction : "asc"}
                  onClick={() => toggleReceiptSort("feeAmount")}
                >
                  {t("app.totalFeeAmount")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={receiptSort.field === "amount"}
                  direction={receiptSort.field === "amount" ? receiptSort.direction : "asc"}
                  onClick={() => toggleReceiptSort("amount")}
                >
                  {t("receipts.amount")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={receiptSort.field === "paymentMethod"}
                  direction={receiptSort.field === "paymentMethod" ? receiptSort.direction : "asc"}
                  onClick={() => toggleReceiptSort("paymentMethod")}
                >
                  {t("receipts.method")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={receiptSort.field === "collectedBy"}
                  direction={receiptSort.field === "collectedBy" ? receiptSort.direction : "asc"}
                  onClick={() => toggleReceiptSort("collectedBy")}
                >
                  {t("receipts.collectedBy")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={receiptSort.field === "collectedAt"}
                  direction={receiptSort.field === "collectedAt" ? receiptSort.direction : "asc"}
                  onClick={() => toggleReceiptSort("collectedAt")}
                >
                  {t("receipts.collectedAt")}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">{t("receipts.actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedReceipts.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.receiptNo}</TableCell>
                <TableCell>{item.case?.caseId || "-"}</TableCell>
                <TableCell>{item.case?.customerName || "-"}</TableCell>
                <TableCell>{Number(item.case?.feeAmount || 0).toLocaleString(language === "vi" ? "vi-VN" : "en-US")} đ</TableCell>
                <TableCell>{Number(item.amount || 0).toLocaleString(language === "vi" ? "vi-VN" : "en-US")} đ</TableCell>
                <TableCell>{item.paymentMethod === "BANK_TRANSFER" ? t("receipts.methodTransfer") : t("receipts.methodCash")}</TableCell>
                <TableCell>{item.collectedBy}</TableCell>
                <TableCell>{new Date(item.collectedAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={(event) => openActionMenu(event, item)}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={sortedReceipts.length}
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
      </Paper>
      <Menu anchorEl={actionMenu.anchorEl} open={Boolean(actionMenu.anchorEl)} onClose={closeActionMenu}>
        <MenuItem
          onClick={() => {
            if (actionMenu.receipt) startEdit(actionMenu.receipt);
            closeActionMenu();
          }}
        >
          <ListItemIcon>
            <EditOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("common.edit")}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (actionMenu.receipt) setConfirmDeleteId(actionMenu.receipt.id);
            closeActionMenu();
          }}
        >
          <ListItemIcon>
            <DeleteOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("common.delete")}</ListItemText>
        </MenuItem>
      </Menu>
      <Dialog open={Boolean(confirmDeleteId)} onClose={() => setConfirmDeleteId(null)}>
        <DialogTitle>{t("receipts.deleteTitle")}</DialogTitle>
        <DialogContent>{t("receipts.deleteConfirm")}</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</Button>
          <Button color="error" variant="contained" onClick={deleteReceipt}>
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
