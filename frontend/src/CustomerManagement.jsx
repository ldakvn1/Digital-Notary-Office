import { useEffect, useState } from "react";
import { API_BASE } from "./apiBase";
import {
  Box,
  Paper,
  Button,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import axios from "axios";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";
import { downloadCsvFile, getExportTimestamp } from "./utils/csvExport";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { viVN } from "@mui/x-date-pickers/locales";
import dayjs from "dayjs";
import "dayjs/locale/vi";

export default function CustomerManagement({ currentUser, focusCustomerId = null, onFocusConsumed }) {
  const { t, language } = useI18n();
  const normalizedRole = String(currentUser?.role || "").toLowerCase();
  const isAdmin = normalizedRole === "admin";
  const canCreateCustomer = ["admin", "notary_officer", "staff"].includes(normalizedRole);
  const [customers, setCustomers] = useState([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [cccdFile, setCccdFile] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [customerSort, setCustomerSort] = useState({ field: "customerId", direction: "asc" });
  const [customerQuery, setCustomerQuery] = useState("");
  const [actionMenu, setActionMenu] = useState({ anchorEl: null, customer: null });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const normalizeIdentity = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();
  const normalizeGenderForApi = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "male" || normalized === "nam") return "MALE";
    if (normalized === "female" || normalized === "nữ" || normalized === "nu") return "FEMALE";
    if (normalized === "other" || normalized === "khác" || normalized === "khac") return "OTHER";
    return "";
  };
  const normalizeToDateInputValue = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    // Already valid for <input type="date">
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    // Legacy dd/MM/yyyy
    const viMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (viMatch) return `${viMatch[3]}-${viMatch[2]}-${viMatch[1]}`;
    // ISO datetime or other parseable formats
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  const CUSTOMER_SORT_LABELS = {
    customerId: t("customers.customerCode"),
    fullName: t("customers.fullName"),
    phone: t("customers.phone"),
    email: "Email",
    idNumber: t("customers.idNumber"),
    gender: t("customers.gender"),
    dateOfBirth: t("customers.dateOfBirth"),
    notes: t("customers.notes"),
    totalCases: t("customers.totalCaseCount"),
    createdBy: t("customers.createdBy"),
    createdAt: t("customers.createdAt"),
    updatedBy: t("customers.updatedBy"),
    updatedAt: t("customers.updatedAt"),
  };

  useEffect(() => {
    fetchCustomers();
  }, []);
  useEffect(() => {
    if (focusCustomerId && typeof onFocusConsumed === "function") {
      onFocusConsumed();
    }
  }, [focusCustomerId, onFocusConsumed]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API_BASE + "/customers");
      setCustomers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFullName("");
    setPhone("");
    setEmail("");
    setIdNumber("");
    setGender("");
    setDateOfBirth("");
    setAddress("");
    setNotes("");
    setCccdFile(null);
    setEditingId(null);
  };

  const handleOpenDialog = (customer = null) => {
    if (customer) {
      setFullName(customer.fullName);
      setPhone(customer.phone);
      setEmail(customer.email || "");
      setIdNumber(customer.idNumber || "");
      setGender(normalizeGenderForApi(customer.gender));
      setDateOfBirth(normalizeToDateInputValue(customer.dateOfBirth));
      setAddress(customer.address || "");
      setNotes(customer.notes || "");
      setCccdFile(null);
      setEditingId(customer.id);
    } else {
      resetForm();
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    resetForm();
  };

  const handleSave = async () => {
    if (!fullName.trim() || !phone.trim()) {
      toastApi.warning(t("customers.requireFields"));
      return;
    }

    const existingCustomer = editingId
      ? (customers || []).find((item) => Number(item.id) === Number(editingId))
      : null;
    const isPhoneChanged = editingId ? normalizeIdentity(phone) !== normalizeIdentity(existingCustomer?.phone) : true;
    const isIdNumberChanged = editingId
      ? normalizeIdentity(idNumber) !== normalizeIdentity(existingCustomer?.idNumber)
      : true;
    const isEmailChanged = editingId ? String(email || "").trim() !== String(existingCustomer?.email || "").trim() : true;
    const isAddressChanged = editingId ? String(address || "").trim() !== String(existingCustomer?.address || "").trim() : true;
    const isNotesChanged = editingId ? String(notes || "").trim() !== String(existingCustomer?.notes || "").trim() : true;
    const fullNameValue = fullName.trim();
    const phoneValue = phone.trim();
    const emailValue = String(email || "").trim();
    const idNumberValue = String(idNumber || "").trim();
    const addressValue = String(address || "").trim();
    const notesValue = String(notes || "").trim();
    const normalizedGender = normalizeGenderForApi(gender);
    const normalizedDateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(String(dateOfBirth || "").trim())
      ? String(dateOfBirth).trim()
      : undefined;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if ((!editingId || isPhoneChanged) && (phoneValue.length < 8 || phoneValue.length > 20)) {
      toastApi.warning(t("customers.phoneLengthInvalid"));
      return;
    }
    if ((!editingId || isEmailChanged) && emailValue && !emailRegex.test(emailValue)) {
      toastApi.warning(t("customers.emailInvalid"));
      return;
    }
    if ((!editingId || isIdNumberChanged) && idNumberValue && idNumberValue.length > 20) {
      toastApi.warning(t("customers.idNumberLengthInvalid"));
      return;
    }
    if ((!editingId || isAddressChanged) && addressValue.length > 250) {
      toastApi.warning(t("customers.addressLengthInvalid"));
      return;
    }
    if ((!editingId || isNotesChanged) && notesValue.length > 500) {
      toastApi.warning(t("customers.notesLengthInvalid"));
      return;
    }
    if (String(dateOfBirth || "").trim() && !normalizedDateOfBirth) {
      toastApi.warning(t("customers.dateOfBirthInvalid"));
      return;
    }

    const normalizedEditingId = editingId ? Number(editingId) : null;
    const duplicateByIdNumber = (customers || []).find(
      (item) =>
        Number(item.id) !== normalizedEditingId &&
        normalizeIdentity(item.idNumber) &&
        normalizeIdentity(item.idNumber) === normalizeIdentity(idNumber)
    );
    if (isIdNumberChanged && idNumber.trim() && duplicateByIdNumber) {
      toastApi.warning(`CCCD trùng với khách hàng "${duplicateByIdNumber.fullName}".`);
      return;
    }
    const duplicateByPhone = (customers || []).find(
      (item) =>
        Number(item.id) !== normalizedEditingId &&
        normalizeIdentity(item.phone) &&
        normalizeIdentity(item.phone) === normalizeIdentity(phone)
    );
    if (isPhoneChanged && phone.trim() && duplicateByPhone) {
      toastApi.warning(`Số điện thoại trùng với khách hàng "${duplicateByPhone.fullName}".`);
      return;
    }

    setLoading(true);
    try {
      const payload = editingId
        ? {}
        : {
            fullName: fullNameValue,
            phone: phoneValue,
            email: emailValue || undefined,
            idNumber: idNumberValue || undefined,
            gender: normalizedGender || undefined,
            dateOfBirth: normalizedDateOfBirth,
            address: addressValue,
            notes: notesValue,
          };

      if (editingId) {
        if (fullNameValue !== String(existingCustomer?.fullName || "").trim()) payload.fullName = fullNameValue;
        if (normalizeIdentity(phoneValue) !== normalizeIdentity(existingCustomer?.phone)) payload.phone = phoneValue;
        if (emailValue !== String(existingCustomer?.email || "").trim()) payload.email = emailValue || "";
        if (normalizeIdentity(idNumberValue) !== normalizeIdentity(existingCustomer?.idNumber)) {
          payload.idNumber = idNumberValue || "";
        }
        if (normalizedGender !== normalizeGenderForApi(existingCustomer?.gender)) payload.gender = normalizedGender || null;
        if (normalizedDateOfBirth !== normalizeToDateInputValue(existingCustomer?.dateOfBirth)) {
          payload.dateOfBirth = normalizedDateOfBirth || null;
        }
        if (addressValue !== String(existingCustomer?.address || "").trim()) payload.address = addressValue;
        if (notesValue !== String(existingCustomer?.notes || "").trim()) payload.notes = notesValue;
        if (Object.keys(payload).length === 0) {
          toastApi.warning(t("customers.noChangesToSave"));
          return;
        }
        const legacyWarnings = [];
        const legacyPhone = String(existingCustomer?.phone || "").trim();
        if (legacyPhone && (legacyPhone.length < 8 || legacyPhone.length > 20) && !isPhoneChanged) {
          legacyWarnings.push(t("customers.legacyPhoneWarning"));
        }
        const legacyIdNumber = String(existingCustomer?.idNumber || "").trim();
        if (legacyIdNumber && legacyIdNumber.length > 20 && !isIdNumberChanged) {
          legacyWarnings.push(t("customers.legacyIdNumberWarning"));
        }
        if (legacyWarnings.length > 0) {
          toastApi.warning(legacyWarnings.join(" "));
        }
      }
      if (editingId) {
        // Update existing customer
        await axios.put(`${API_BASE}/customers/${editingId}`, payload);
        toastApi.success(t("customers.saveSuccess"));
      } else {
        // Create new customer
        await axios.post(API_BASE + "/customers", payload);
        toastApi.success(t("customers.saveSuccess"));
      }
      fetchCustomers();
      handleCloseDialog();
    } catch (err) {
      console.error(err);
      const responseData = err.response?.data;
      const validationText = Array.isArray(responseData?.errors)
        ? responseData.errors
            .map((item) => (item?.field ? `${item.field}: ${item?.message}` : item?.message))
            .filter(Boolean)
            .join("; ")
        : "";
      const errorText =
        typeof responseData === "string"
          ? responseData
          : validationText || responseData?.message || responseData?.error || err.message;
      toastApi.error(`${t("customers.saveError")}: ${errorText}`);
    } finally {
      setLoading(false);
    }
  };

  const handleScanCccd = async () => {
    if (!cccdFile) {
      toastApi.warning(t("customers.selectCccdFirst"));
      return;
    }
    const formData = new FormData();
    formData.append("file", cccdFile);
    setOcrLoading(true);
    try {
      const res = await axios.post(API_BASE + "/ocr/cccd", formData);
      const extracted = res.data?.data || {};
      if (extracted.fullName) setFullName(extracted.fullName);
      if (extracted.idNumber) setIdNumber(extracted.idNumber);
      toastApi.success(t("customers.scanSuccess"));
    } catch (err) {
      console.error(err);
      toastApi.error(t("customers.scanError"));
    } finally {
      setOcrLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setConfirmDeleteId(id);
  };

  const confirmDeleteCustomer = async () => {
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/customers/${id}`);
      toastApi.success(t("customers.deleteSuccess"));
      fetchCustomers();
    } catch (err) {
      console.error(err);
      toastApi.error(`${t("customers.deleteError")}: ${err.response?.data || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const visibleCustomers = focusCustomerId
    ? customers.filter((item) => item.id === focusCustomerId)
    : customers;
  const filteredCustomers = visibleCustomers.filter((item) => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return true;
    return [
      item.customerId,
      item.fullName,
      item.phone,
      item.email,
      item.idNumber,
      item.gender,
      item.dateOfBirth,
      item.notes,
      item.createdBy,
      item.updatedBy,
    ]
      .map((v) => String(v || "").toLowerCase())
      .some((v) => v.includes(q));
  });
  const sortedCustomers = filteredCustomers.slice().sort((a, b) => {
    const getValue = (item) => {
      if (customerSort.field === "totalCases") return Number(item.totalCases || 0);
      if (customerSort.field === "createdAt" || customerSort.field === "updatedAt") {
        return new Date(item[customerSort.field] || 0).getTime();
      }
      return String(item[customerSort.field] || "");
    };
    const aValue = getValue(a);
    const bValue = getValue(b);
    if (typeof aValue === "number" && typeof bValue === "number") {
      return customerSort.direction === "asc" ? aValue - bValue : bValue - aValue;
    }
    const compared = String(aValue).localeCompare(String(bValue), "vi", { sensitivity: "base" });
    return customerSort.direction === "asc" ? compared : -compared;
  });
  const toggleCustomerSort = (field) => {
    setCustomerSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };
  const pagedCustomers = sortedCustomers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const quickExportCustomers = () => {
    const dateLocale = language === "vi" ? "vi-VN" : "en-US";
    const headers = [
      t("customers.customerCode"),
      t("customers.fullName"),
      t("customers.phone"),
      "Email",
      t("customers.idNumber"),
      t("customers.gender"),
      t("customers.dateOfBirth"),
      t("customers.notes"),
      t("customers.totalCaseCount"),
      t("customers.createdBy"),
      t("customers.createdAt"),
      t("customers.updatedBy"),
      t("customers.updatedAt"),
    ];
    const rows = sortedCustomers.map((customer) => [
      customer.customerId || "",
      customer.fullName || "",
      customer.phone || "",
      customer.email || "",
      customer.idNumber || "",
      customer.gender === "MALE"
        ? t("customers.male")
        : customer.gender === "FEMALE"
          ? t("customers.female")
          : customer.gender === "OTHER"
            ? t("customers.other")
            : customer.gender || "",
      customer.dateOfBirth ? new Date(customer.dateOfBirth).toLocaleDateString(dateLocale) : "",
      customer.notes || "",
      Number(customer.totalCases || 0),
      displayActor(customer.createdBy),
      customer.createdAt ? new Date(customer.createdAt).toLocaleString(dateLocale) : "",
      displayActor(customer.updatedBy),
      customer.updatedAt ? new Date(customer.updatedAt).toLocaleString(dateLocale) : "",
    ]);
    const filename =
      language === "vi"
        ? `DanhSachKhachHang_Nhanh_${getExportTimestamp()}.csv`
        : `customers_quick_view_${getExportTimestamp()}.csv`;
    downloadCsvFile(filename, headers, rows);
    toastApi.success(language === "vi" ? "Đã kết xuất nhanh danh sách khách hàng." : "Customer quick export completed.");
  };
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sortedCustomers.length / rowsPerPage) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [sortedCustomers.length, rowsPerPage, page]);
  const openActionMenu = (event, customer) => {
    setActionMenu({ anchorEl: event.currentTarget, customer });
  };
  const closeActionMenu = () => {
    setActionMenu({ anchorEl: null, customer: null });
  };
  const canManageCustomer = (customer) => {
    if (!customer) return false;
    if (isAdmin) return true;
    const createdBy = String(customer.createdBy || "").trim().toLowerCase();
    const isLegacyOwner =
      createdBy === "legacy_data" ||
      createdBy === "dữ liệu cũ" ||
      createdBy === "du lieu cu" ||
      createdBy.includes("?");
    return (
      canCreateCustomer &&
      (String(customer.createdBy || "") === String(currentUser?.username || "") || isLegacyOwner)
    );
  };
  const displayActor = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const normalized = raw.toLowerCase();
    if (normalized === "legacy_data" || normalized === "dữ liệu cũ" || normalized.includes("?")) {
      return t("customers.legacyData");
    }
    return raw;
  };
  const duplicateByIdNumber = (customers || []).find(
    (item) =>
      item.id !== editingId &&
      normalizeIdentity(item.idNumber) &&
      normalizeIdentity(item.idNumber) === normalizeIdentity(idNumber)
  );
  const duplicateByPhone = (customers || []).find(
    (item) =>
      item.id !== editingId &&
      normalizeIdentity(item.phone) &&
      normalizeIdentity(item.phone) === normalizeIdentity(phone)
  );
  const hasDuplicateIdentity = Boolean(
    (idNumber.trim() && duplicateByIdNumber) || (phone.trim() && duplicateByPhone)
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3, display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography variant="h5" fontWeight="bold">
          {t("customers.title")}
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => handleOpenDialog()}
          disabled={loading || !canCreateCustomer}
          sx={{ alignSelf: "flex-start" }}
        >
          {t("customers.addBtn")}
        </Button>
      </Box>

      {/* Dialog Add/Edit Customer */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingId ? t("customers.editTitle") : t("customers.addTitle")}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          <TextField
            label={t("customers.fullName")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            fullWidth
          />
          <TextField
            label={t("customers.phone")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            fullWidth
            error={Boolean(phone.trim() && duplicateByPhone)}
            helperText={
              phone.trim() && duplicateByPhone
                ? `Số điện thoại trùng với: ${duplicateByPhone.fullName}`
                : ""
            }
          />
          <TextField
            label={t("customers.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
          />
          <TextField
            label={t("customers.idNumber")}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            fullWidth
            error={Boolean(idNumber.trim() && duplicateByIdNumber)}
            helperText={
              idNumber.trim() && duplicateByIdNumber
                ? `CCCD trùng với: ${duplicateByIdNumber.fullName}`
                : ""
            }
          />
          <TextField
            select
            label={t("customers.gender")}
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            fullWidth
          >
            <MenuItem value="">{t("customers.notSelected")}</MenuItem>
            <MenuItem value="MALE">{t("customers.male")}</MenuItem>
            <MenuItem value="FEMALE">{t("customers.female")}</MenuItem>
            <MenuItem value="OTHER">{t("customers.other")}</MenuItem>
          </TextField>
          <LocalizationProvider
            dateAdapter={AdapterDayjs}
            adapterLocale={language === "vi" ? "vi" : "en"}
            localeText={language === "vi" ? viVN.components.MuiLocalizationProvider.defaultProps.localeText : undefined}
          >
            <DatePicker
              format="DD/MM/YYYY"
              label={t("customers.dateOfBirth")}
              value={dateOfBirth ? dayjs(dateOfBirth) : null}
              onChange={(value) => setDateOfBirth(value && value.isValid() ? value.format("YYYY-MM-DD") : "")}
              slotProps={{
                textField: {
                  fullWidth: true,
                  helperText: t("customers.dateFormatHint"),
                },
              }}
            />
          </LocalizationProvider>
          {!editingId && (
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Button variant="outlined" component="label" disabled={ocrLoading}>
                {cccdFile ? t("customers.changeCccdImage") : t("customers.chooseCccdImage")}
                <input
                  type="file"
                  hidden
                  accept="image/*,.pdf"
                  onChange={(e) => setCccdFile(e.target.files?.[0] || null)}
                />
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                {cccdFile ? cccdFile.name : t("customers.noCccdFileSelected")}
              </Typography>
              <Button variant="contained" onClick={handleScanCccd} disabled={ocrLoading}>
                {ocrLoading ? t("customers.scanningCccd") : t("customers.scanCccd")}
              </Button>
            </Box>
          )}
          <TextField
            label={t("customers.address")}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          <TextField
            label={t("customers.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            color="primary"
            disabled={loading || hasDuplicateIdentity}
          >
            {editingId ? t("common.update") : t("common.create")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Customers Table */}
      <Paper>
        <Box sx={{ px: 2, pt: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField
            size="small"
            label={t("customers.searchLabel")}
            placeholder={t("customers.searchPlaceholder")}
            value={customerQuery}
            onChange={(e) => {
              setCustomerQuery(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 320 }}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setCustomerQuery("");
              setPage(0);
            }}
            disabled={!customerQuery.trim()}
          >
            {t("customers.clearFilter")}
          </Button>
          <Button size="small" variant="contained" onClick={quickExportCustomers}>
            {t("common.quickExportCsv")}
          </Button>
        </Box>
        {(customerQuery.trim() || customerSort.field !== "customerId" || customerSort.direction !== "asc") && (
          <Box sx={{ px: 2, pt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
            {customerQuery.trim() && (
              <Chip
                size="small"
                color="primary"
                label={`${t("customers.keywordLabel")}: ${customerQuery.trim()}`}
                onDelete={() => {
                  setCustomerQuery("");
                  setPage(0);
                }}
              />
            )}
            {(customerSort.field !== "customerId" || customerSort.direction !== "asc") && (
              <Chip
                size="small"
                variant="outlined"
                label={`${t("customers.sortLabel")}: ${CUSTOMER_SORT_LABELS[customerSort.field]} (${
                  customerSort.direction === "asc"
                    ? t("customers.ascending")
                    : t("customers.descending")
                })`}
                onDelete={() => setCustomerSort({ field: "customerId", direction: "asc" })}
              />
            )}
          </Box>
        )}
        <Tooltip
          arrow
          title={`Đang sắp xếp theo "${CUSTOMER_SORT_LABELS[customerSort.field]}": ${
            customerSort.direction === "asc" ? t("customers.ascending") : t("customers.descending")
          }`}
        >
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, display: "block" }}>
            ↕ Sắp xếp: {CUSTOMER_SORT_LABELS[customerSort.field]} ({customerSort.direction === "asc" ? "A→Z" : "Z→A"})
          </Typography>
        </Tooltip>
        <TableContainer sx={{ maxHeight: 620 }}>
        <Table stickyHeader>
          <TableHead sx={{ bgcolor: "#f3f4f6" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "customerId"}
                  direction={customerSort.field === "customerId" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("customerId")}
                >
                  {t("customers.customerCode")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "fullName"}
                  direction={customerSort.field === "fullName" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("fullName")}
                >
                  {t("customers.fullName")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "phone"}
                  direction={customerSort.field === "phone" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("phone")}
                >
                  {t("customers.phone")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "email"}
                  direction={customerSort.field === "email" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("email")}
                >
                  Email
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "idNumber"}
                  direction={customerSort.field === "idNumber" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("idNumber")}
                >
                  {t("customers.idNumber")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "gender"}
                  direction={customerSort.field === "gender" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("gender")}
                >
                  Giới tính
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "dateOfBirth"}
                  direction={customerSort.field === "dateOfBirth" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("dateOfBirth")}
                >
                  Ngày sinh
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "notes"}
                  direction={customerSort.field === "notes" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("notes")}
                >
                  {t("customers.notes")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "totalCases"}
                  direction={customerSort.field === "totalCases" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("totalCases")}
                >
                  {t("customers.totalCaseCount")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "createdBy"}
                  direction={customerSort.field === "createdBy" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("createdBy")}
                >
                  {t("customers.createdBy")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "createdAt"}
                  direction={customerSort.field === "createdAt" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("createdAt")}
                >
                  {t("customers.createdAt")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "updatedBy"}
                  direction={customerSort.field === "updatedBy" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("updatedBy")}
                >
                  {t("customers.updatedBy")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>
                <TableSortLabel
                  active={customerSort.field === "updatedAt"}
                  direction={customerSort.field === "updatedAt" ? customerSort.direction : "asc"}
                  onClick={() => toggleCustomerSort("updatedAt")}
                >
                  {t("customers.updatedAt")}
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: "bold" }} align="center">
                {t("users.actions")}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} align="center" sx={{ py: 3, color: "#9ca3af" }}>
                  {t("customers.noCustomers")}
                </TableCell>
              </TableRow>
            ) : (
              pagedCustomers.map((customer) => (
                <TableRow key={customer.id} hover>
                  <TableCell sx={{ fontFamily: "monospace" }}>
                    {customer.customerId}
                  </TableCell>
                  <TableCell>{customer.fullName}</TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell>{customer.email || "-"}</TableCell>
                  <TableCell>{customer.idNumber || "-"}</TableCell>
                  <TableCell>
                    {customer.gender === "MALE"
                      ? t("customers.male")
                      : customer.gender === "FEMALE"
                        ? t("customers.female")
                        : customer.gender === "OTHER"
                          ? t("customers.other")
                          : customer.gender || "-"}
                  </TableCell>
                  <TableCell>
                    {customer.dateOfBirth ? new Date(customer.dateOfBirth).toLocaleDateString("vi-VN") : "-"}
                  </TableCell>
                  <TableCell>{customer.notes || "-"}</TableCell>
                  <TableCell align="center">{customer.totalCases || 0}</TableCell>
                  <TableCell>{displayActor(customer.createdBy)}</TableCell>
                  <TableCell>
                    {customer.createdAt ? new Date(customer.createdAt).toLocaleString("vi-VN") : "-"}
                  </TableCell>
                  <TableCell>{displayActor(customer.updatedBy)}</TableCell>
                  <TableCell>
                    {customer.updatedAt ? new Date(customer.updatedAt).toLocaleString("vi-VN") : "-"}
                  </TableCell>
                  <TableCell align="center">
                    {canManageCustomer(customer) ? (
                      <IconButton size="small" onClick={(event) => openActionMenu(event, customer)} disabled={loading}>
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={sortedCustomers.length}
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
        {actionMenu.customer && canManageCustomer(actionMenu.customer) && (
          <MenuItem
            onClick={() => {
              if (actionMenu.customer) handleOpenDialog(actionMenu.customer);
              closeActionMenu();
            }}
          >
            <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("common.edit")}</ListItemText>
          </MenuItem>
        )}
        {actionMenu.customer && canManageCustomer(actionMenu.customer) && (
          <MenuItem
            onClick={() => {
              if (actionMenu.customer) handleDelete(actionMenu.customer.id);
              closeActionMenu();
            }}
          >
            <ListItemIcon><DeleteOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("common.delete")}</ListItemText>
          </MenuItem>
        )}
      </Menu>
      <Dialog open={Boolean(confirmDeleteId)} onClose={() => setConfirmDeleteId(null)}>
        <DialogTitle>{t("customers.confirmDeleteTitle")}</DialogTitle>
        <DialogContent>{t("customers.confirmDeleteText")}</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</Button>
          <Button color="error" variant="contained" onClick={confirmDeleteCustomer}>
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>
      <ToastHost toast={toast} onClose={closeToast} />
    </Box>
  );
}
