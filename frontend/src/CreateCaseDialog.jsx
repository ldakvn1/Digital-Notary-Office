import { useMemo, useState } from "react";
import { API_BASE } from "./apiBase";
import axios from "axios";
import {
  AppBar,
  Toolbar,
  Dialog,
  Slide,
  IconButton,
  Typography,
  Button,
  Box,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  Chip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useI18n } from "./i18n";
import { FILE_TYPES } from "./constants/fileTypes";

export default function CreateCaseDialog({ open, onClose, customers, onCreated, toastApi }) {
  const { t } = useI18n();
  const [step, setStep] = useState("form");
  const steps = [t("app.createCaseStepInfo"), t("app.createCaseStepDocs")];
  const activeStep = step === "form" ? 0 : 1;
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [type, setType] = useState("");
  const [authorizationKind, setAuthorizationKind] = useState("");
  const [certificationKind, setCertificationKind] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("__new__");
  const [cccdFile, setCccdFile] = useState(null);

  const [createdCaseId, setCreatedCaseId] = useState(null);
  const [createdCaseCode, setCreatedCaseCode] = useState("");
  const [uploadItems, setUploadItems] = useState([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const normalizeIdentity = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();
  const REQUIRED_FILES_BY_CASE_TYPE = {
    "Mua bán": ["CCCD", "CONTRACT", "LAND_CERT"],
    "Ủy quyền": ["CCCD", "CONTRACT"],
    "Thừa kế": ["CCCD", "CONTRACT", "LAND_CERT"],
    "Di chúc": ["CCCD"],
    "Chứng thực": ["CCCD"],
    "Khác": ["CCCD"],
  };

  const resetAll = () => {
    setStep("form");
    setLoading(false);
    setOcrLoading(false);
    setUploadProgress(0);
    setName("");
    setPhone("");
    setIdNumber("");
    setType("");
    setAuthorizationKind("");
    setCertificationKind("");
    setDescription("");
    setNotes("");
    setSelectedCustomerId("__new__");
    setCccdFile(null);
    setCreatedCaseId(null);
    setCreatedCaseCode("");
    setUploadItems([]);
  };

  const handleClose = () => {
    resetAll();
    onClose?.();
  };

  const customerHints = useMemo(() => {
    if (selectedCustomerId !== "__new__") return [];
    if (!name.trim() && !phone.trim() && !idNumber.trim()) return [];
    const qName = name.trim().toLowerCase();
    const qPhone = phone.trim().toLowerCase();
    const qId = idNumber.trim().toLowerCase();
    return (customers || [])
      .filter((customer) => {
        const matchName = qName
          ? String(customer.fullName || "")
              .toLowerCase()
              .includes(qName)
          : false;
        const matchPhone = qPhone
          ? String(customer.phone || "")
              .toLowerCase()
              .includes(qPhone)
          : false;
        const matchId = qId
          ? String(customer.idNumber || "")
              .toLowerCase()
              .includes(qId)
          : false;
        return matchName || matchPhone || matchId;
      })
      .slice(0, 5);
  }, [customers, idNumber, name, phone, selectedCustomerId]);
  const duplicateCustomerByIdNumber = useMemo(() => {
    if (selectedCustomerId !== "__new__") return null;
    const normalizedInput = normalizeIdentity(idNumber);
    if (!normalizedInput) return null;
    return (
      (customers || []).find(
        (customer) => normalizeIdentity(customer.idNumber) === normalizedInput
      ) || null
    );
  }, [customers, idNumber, selectedCustomerId]);

  const applyCustomerHint = (customer) => {
    setSelectedCustomerId(customer.id);
    setName(customer.fullName || "");
    setPhone(customer.phone || "");
    setIdNumber(customer.idNumber || "");
    setCccdFile(null);
  };

  const unlinkSelectedCustomer = () => {
    setSelectedCustomerId("__new__");
    setName("");
    setPhone("");
    setIdNumber("");
    setCccdFile(null);
  };

  const scanCccd = async () => {
    if (!cccdFile) {
      toastApi.warning("Vui lòng chọn ảnh CCCD trước");
      return;
    }
    const formData = new FormData();
    formData.append("file", cccdFile);
    setOcrLoading(true);
    try {
      const res = await axios.post(API_BASE + "/ocr/cccd", formData);
      const extracted = res.data?.data || {};
      if (extracted.fullName) setName(extracted.fullName);
      if (extracted.idNumber) setIdNumber(extracted.idNumber);
      toastApi.success("Đã quét CCCD và điền thông tin tự động");
    } catch (error) {
      console.error(error);
      toastApi.error("Không thể quét CCCD, vui lòng kiểm tra tài liệu");
    } finally {
      setOcrLoading(false);
    }
  };

  const createCase = async () => {
    if (!name.trim()) {
      toastApi.warning(t("app.requireCustomerName"));
      return;
    }
    if (!type) {
      toastApi.warning(t("app.requireTransactionType"));
      return;
    }
    if (type === "Ủy quyền" && !authorizationKind) {
      toastApi.warning(t("app.requireAuthorizationKind"));
      return;
    }
    if (type === "Chứng thực" && !certificationKind) {
      toastApi.warning(t("app.requireCertificationKind"));
      return;
    }
    if (selectedCustomerId === "__new__" && !idNumber.trim()) {
      toastApi.warning("Vui lòng tải lên và quét CCCD để lấy số định danh");
      return;
    }
    if (selectedCustomerId === "__new__" && duplicateCustomerByIdNumber) {
      toastApi.warning(
        `CCCD đã tồn tại với khách hàng "${duplicateCustomerByIdNumber.fullName}". Vui lòng liên kết khách hàng hiện có.`
      );
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(API_BASE + "/cases", {
        customerId: selectedCustomerId !== "__new__" ? selectedCustomerId : undefined,
        customerName: name.trim(),
        phone: phone.trim(),
        idNumber: idNumber.trim(),
        type,
        authorizationKind: type === "Ủy quyền" ? authorizationKind : undefined,
        certificationKind: type === "Chứng thực" ? certificationKind : undefined,
        description: description.trim(),
        notes: notes.trim(),
      });
      setCreatedCaseId(res.data?.id || null);
      setCreatedCaseCode(res.data?.caseId || "");
      setStep("upload");
      onCreated?.();
      toastApi.success("Đã tạo hồ sơ. Bạn có thể tải lên tài liệu ngay bây giờ hoặc bỏ qua.");
    } catch (err) {
      console.error(err);
      toastApi.error(t("app.createCaseError"));
    } finally {
      setLoading(false);
    }
  };

  const onPickUploadFiles = (files) => {
    const nextItems = Array.from(files || []).map((file) => ({ file, fileType: "OTHER" }));
    setUploadItems((prev) => [...prev, ...nextItems]);
  };

  const updateUploadItemType = (index, fileType) => {
    setUploadItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, fileType } : item)));
  };
  const removeUploadItem = (index) => {
    setUploadItems((prev) => prev.filter((_, idx) => idx !== index));
  };
  const requiredFileTypes = REQUIRED_FILES_BY_CASE_TYPE[type] || ["CCCD"];
  const selectedFileTypes = new Set(uploadItems.map((item) => item.fileType));
  const missingRequiredFileTypes = requiredFileTypes.filter((requiredType) => !selectedFileTypes.has(requiredType));
  const toFileTypeLabel = (fileTypeKey) => FILE_TYPES[fileTypeKey] || fileTypeKey;
  const missingRequiredFileTypeLabels = missingRequiredFileTypes.map(toFileTypeLabel);

  const uploadDocuments = async () => {
    if (!createdCaseId) return;
    if (!uploadItems.length) {
      toastApi.warning(t("app.noDocumentsSelectedForUpload"));
      return;
    }
    if (missingRequiredFileTypes.length > 0) {
      toastApi.warning(
        t("app.requiredDocumentsMissing", { docs: missingRequiredFileTypeLabels.join(", ") })
      );
    }
    const formData = new FormData();
    uploadItems.forEach((item) => {
      formData.append("files", item.file);
      formData.append("fileTypes", item.fileType);
    });
    setLoading(true);
    setUploadProgress(0);
    try {
      await axios.post(`${API_BASE}/upload/${createdCaseId}`, formData, {
        onUploadProgress: (event) => {
          const percent = Math.round((event.loaded * 100) / (event.total || 1));
          setUploadProgress(percent);
        },
      });
      toastApi.success(t("app.uploadDocumentsSuccess"));
      handleClose();
    } catch (err) {
      console.error(err);
      toastApi.error(
        typeof err?.response?.data === "string" ? err.response.data : t("app.uploadDocumentsError")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={handleClose}
      slots={{ transition: Slide }}
      slotProps={{ transition: { direction: "up" } }}
    >
      <AppBar sx={{ position: "relative" }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={handleClose} aria-label="close">
            <CloseIcon />
          </IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6">
            {step === "form"
              ? t("app.createCase")
              : t("app.uploadDocumentsForCase", { caseCode: createdCaseCode || "" })}
          </Typography>
          {step === "upload" && (
            <Button color="inherit" onClick={handleClose}>
              {t("app.skipUpload")}
            </Button>
          )}
        </Toolbar>
      </AppBar>
      <Box sx={{ p: 3 }}>
        <Paper sx={{ p: 2, maxWidth: 1100, mx: "auto", borderRadius: 3, mb: 2 }}>
          <Stepper activeStep={activeStep}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Paper>
        {step === "form" ? (
          <Paper sx={{ p: 3, maxWidth: 1100, mx: "auto", borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              Nhập thông tin hồ sơ và khách hàng
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
              <TextField
                label={t("app.customerName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                sx={{ minWidth: 220, flex: 1 }}
                InputProps={{ readOnly: selectedCustomerId !== "__new__" }}
                required
              />
              <TextField
                label={t("app.phone")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                sx={{ minWidth: 220, flex: 1 }}
                InputProps={{ readOnly: selectedCustomerId !== "__new__" }}
              />
              <TextField
                label={t("customers.idNumber")}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                sx={{ minWidth: 220, flex: 1 }}
                InputProps={{ readOnly: selectedCustomerId !== "__new__" }}
                error={Boolean(duplicateCustomerByIdNumber)}
                helperText={
                  duplicateCustomerByIdNumber
                    ? `CCCD trùng với khách hàng: ${duplicateCustomerByIdNumber.fullName}`
                    : ""
                }
              />
              <FormControl sx={{ minWidth: 220 }} required>
                <InputLabel required>{t("app.type")}</InputLabel>
                <Select
                  value={type}
                  label={t("app.type")}
                  onChange={(e) => {
                    const next = e.target.value;
                    setType(next);
                    if (next !== "Ủy quyền") setAuthorizationKind("");
                    if (next !== "Chứng thực") setCertificationKind("");
                  }}
                >
                  <MenuItem value="Mua bán">{t("caseType.contract")}</MenuItem>
                  <MenuItem value="Ủy quyền">{t("caseType.authorization")}</MenuItem>
                  <MenuItem value="Thừa kế">{t("caseType.inheritance")}</MenuItem>
                  <MenuItem value="Di chúc">{t("caseType.will")}</MenuItem>
                  <MenuItem value="Chứng thực">{t("caseType.certification")}</MenuItem>
                  <MenuItem value="Khác">{t("caseType.other")}</MenuItem>
                </Select>
              </FormControl>
              {type === "Ủy quyền" && (
                <FormControl sx={{ minWidth: 240 }} required>
                  <InputLabel required>{t("app.authorizationKind")}</InputLabel>
                  <Select
                    value={authorizationKind}
                    label={t("app.authorizationKind")}
                    onChange={(e) => setAuthorizationKind(e.target.value)}
                  >
                    <MenuItem value="AUTH_CONTRACT">{t("authorizationKind.contract")}</MenuItem>
                    <MenuItem value="AUTH_LETTER">{t("authorizationKind.letter")}</MenuItem>
                  </Select>
                </FormControl>
              )}
              {type === "Chứng thực" && (
                <FormControl sx={{ minWidth: 280 }} required>
                  <InputLabel required>{t("app.certificationKind")}</InputLabel>
                  <Select
                    value={certificationKind}
                    label={t("app.certificationKind")}
                    onChange={(e) => setCertificationKind(e.target.value)}
                  >
                    <MenuItem value="CERT_COPY">{t("certificationKind.copy")}</MenuItem>
                    <MenuItem value="CERT_SIGNATURE">{t("certificationKind.signature")}</MenuItem>
                    <MenuItem value="CERT_TRANSLATOR_SIGNATURE">
                      {t("certificationKind.translatorSignature")}
                    </MenuItem>
                  </Select>
                </FormControl>
              )}
              <FormControl sx={{ minWidth: 280 }}>
                <InputLabel>{t("app.typeOptional")}</InputLabel>
                <Select
                  value={selectedCustomerId}
                  label={t("app.typeOptional")}
                  onChange={(e) => {
                    const customerId = e.target.value;
                    setSelectedCustomerId(customerId);
                    if (customerId === "__new__") {
                      setName("");
                      setPhone("");
                      setIdNumber("");
                      return;
                    }
                    const customer = (customers || []).find((c) => c.id === Number(customerId));
                    if (customer) {
                      setName(customer.fullName || "");
                      setPhone(customer.phone || "");
                      setIdNumber(customer.idNumber || "");
                    }
                  }}
                >
                  <MenuItem value="__new__">{t("app.newCustomer")}</MenuItem>
                  {(customers || []).map((customer) => (
                    <MenuItem key={customer.id} value={customer.id}>
                      {customer.fullName} ({customer.phone})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {selectedCustomerId !== "__new__" && (
                <Button size="small" color="warning" onClick={unlinkSelectedCustomer}>
                  Bỏ liên kết khách hàng
                </Button>
              )}

              {selectedCustomerId === "__new__" && (
                <Box sx={{ minWidth: 360, flex: 2, display: "flex", gap: 1, alignItems: "center" }}>
                  <Button variant="outlined" component="label">
                    {cccdFile ? "Đổi ảnh CCCD" : "Chọn ảnh CCCD"}
                    <input
                      type="file"
                      hidden
                      accept="image/*,.pdf"
                      onChange={(e) => setCccdFile(e.target.files?.[0] || null)}
                    />
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    {cccdFile ? cccdFile.name : "Chưa chọn tài liệu"}
                  </Typography>
                  <Button variant="contained" onClick={scanCccd} disabled={ocrLoading}>
                    {ocrLoading ? "Đang quét..." : "Quét CCCD"}
                  </Button>
                </Box>
              )}

              {customerHints.length > 0 && (
                <Paper
                  variant="outlined"
                  sx={{
                    minWidth: 360,
                    flex: 2,
                    p: 1.5,
                    bgcolor: "#f8fafc",
                    borderColor: "#cbd5e1",
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                    {t("app.customerHintTitle")}
                  </Typography>
                  <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
                    {customerHints.map((hint) => (
                      <Box
                        key={hint.id}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 1,
                          p: 1,
                          borderRadius: 1,
                          bgcolor: "white",
                        }}
                      >
                        <Typography variant="body2">
                          <b>{hint.fullName}</b> | {hint.phone || "-"} | {hint.idNumber || "-"}
                        </Typography>
                        <Button size="small" variant="outlined" onClick={() => applyCustomerHint(hint)}>
                          {t("app.useThisCustomer")}
                        </Button>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              )}

              <TextField
                label={t("app.notes")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                sx={{ minWidth: 260, flex: 1 }}
              />

              <Box sx={{ width: "100%" }}>
                <TextField
                  label={t("app.description")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  fullWidth
                  multiline
                  rows={4}
                />
              </Box>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
              <Button variant="text" onClick={handleClose}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="contained"
                onClick={createCase}
                disabled={loading || Boolean(duplicateCustomerByIdNumber)}
              >
                {loading ? t("common.loading") : t("app.createCaseBtn")}
              </Button>
            </Box>
          </Paper>
        ) : (
          <Paper sx={{ p: 3, maxWidth: 1100, mx: "auto", borderRadius: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              {t("app.relatedDocumentsOptional")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t("app.uploadDocumentsHint")}
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                {t("app.requiredDocumentsByBusiness")}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                {requiredFileTypes.map((requiredType) => {
                  const isSatisfied = selectedFileTypes.has(requiredType);
                  return (
                    <Chip
                      key={requiredType}
                      label={`${toFileTypeLabel(requiredType)} ${isSatisfied ? `(${t("app.documentReady")})` : `(${t("app.documentMissing")})`}`}
                      color={isSatisfied ? "success" : "warning"}
                      variant={isSatisfied ? "filled" : "outlined"}
                    />
                  );
                })}
              </Box>
              <Typography variant="caption" color={missingRequiredFileTypes.length ? "warning.main" : "success.main"}>
                {missingRequiredFileTypes.length
                  ? t("app.requiredDocumentsMissing", { docs: missingRequiredFileTypeLabels.join(", ") })
                  : t("app.requiredDocumentsComplete")}
              </Typography>
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
                onPickUploadFiles(e.dataTransfer.files);
              }}
              sx={{
                p: 2,
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
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button variant="outlined" component="label">
                  {t("app.selectDocuments")}
                  <input hidden multiple type="file" onChange={(e) => onPickUploadFiles(e.target.files)} />
                </Button>
                <Button variant="text" component="label">
                  {t("app.addMoreDocuments")}
                  <input hidden multiple type="file" onChange={(e) => onPickUploadFiles(e.target.files)} />
                </Button>
                {uploadItems.length > 0 && (
                  <Button variant="text" color="error" onClick={() => setUploadItems([])}>
                    {t("app.clearAllDocuments")}
                  </Button>
                )}
              </Box>
            </Paper>
            <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
              {uploadItems.map((item, index) => (
                <Paper
                  key={`${item.file?.name}-${index}`}
                  variant="outlined"
                  sx={{ p: 1.5, display: "flex", gap: 1, alignItems: "center" }}
                >
                  <Typography sx={{ flex: 1 }} variant="body2">
                    {item.file?.name}
                  </Typography>
                  <FormControl sx={{ minWidth: 220 }} size="small">
                    <InputLabel>{t("app.documentType")}</InputLabel>
                    <Select
                      value={item.fileType}
                      label={t("app.documentType")}
                      onChange={(e) => updateUploadItemType(index, e.target.value)}
                    >
                      {Object.entries(FILE_TYPES).map(([key, label]) => (
                        <MenuItem key={key} value={key}>
                          {label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Chip
                    label={t("common.delete")}
                    color="error"
                    variant="outlined"
                    onClick={() => removeUploadItem(index)}
                    sx={{ cursor: "pointer" }}
                  />
                </Paper>
              ))}
            </Box>
            {loading && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress variant="determinate" value={uploadProgress} />
                <Typography variant="caption" color="text.secondary">
                  {uploadProgress}%
                </Typography>
              </Box>
            )}
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
              <Button onClick={handleClose}>{t("app.finishAndClose")}</Button>
              <Button
                variant="contained"
                onClick={uploadDocuments}
                disabled={loading || !uploadItems.length}
              >
                {t("app.uploadDocuments")}
              </Button>
            </Box>
          </Paper>
        )}
      </Box>
    </Dialog>
  );
}
