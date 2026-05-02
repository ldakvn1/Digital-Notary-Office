import { useEffect, useState } from "react";
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
  Switch,
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
} from "@mui/material";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";
import { downloadCsvFile, getExportTimestamp } from "./utils/csvExport";

const EMPTY_FORM = {
  id: null,
  fullName: "",
  idNumber: "",
  languages: "",
  signatureSample: "",
  isActive: true,
};

export default function TranslatorManagement() {
  const { t, language } = useI18n();
  const [list, setList] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [translatorSort, setTranslatorSort] = useState({ field: "fullName", direction: "asc" });
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const TRANSLATOR_SORT_LABELS = {
    fullName: t("translator.fullName"),
    idNumber: t("translator.idNumber"),
    languages: t("translator.languages"),
    isActive: t("translator.isActive"),
  };

  const fetchList = async () => {
    try {
      const res = await axios.get(API_BASE + "/translator-collaborators");
      setList(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setList([]);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const save = async () => {
    if (!form.fullName.trim()) {
      toastApi.warning(t("translator.requireName"));
      return;
    }
    setLoading(true);
    try {
      if (form.id) {
        await axios.put(`${API_BASE}/translator-collaborators/${form.id}`, {
          fullName: form.fullName,
          idNumber: form.idNumber,
          languages: form.languages,
          signatureSample: form.signatureSample,
          isActive: form.isActive,
        });
      } else {
        await axios.post(API_BASE + "/translator-collaborators", {
          fullName: form.fullName,
          idNumber: form.idNumber,
          languages: form.languages,
          signatureSample: form.signatureSample,
        });
      }
      setOpen(false);
      setForm(EMPTY_FORM);
      await fetchList();
      toastApi.success(t("translator.saveSuccess"));
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || t("translator.saveError"));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id) => {
    try {
      await axios.delete(`${API_BASE}/translator-collaborators/${id}`);
      await fetchList();
      toastApi.success(t("translator.deleteSuccess"));
    } catch (err) {
      console.error(err);
      toastApi.error(err?.response?.data || t("translator.deleteError"));
    }
  };

  const sortedList = list.slice().sort((a, b) => {
    const aValue =
      translatorSort.field === "isActive"
        ? Number(a.isActive ? 1 : 0)
        : String(a[translatorSort.field] || "");
    const bValue =
      translatorSort.field === "isActive"
        ? Number(b.isActive ? 1 : 0)
        : String(b[translatorSort.field] || "");
    if (typeof aValue === "number" && typeof bValue === "number") {
      return translatorSort.direction === "asc" ? aValue - bValue : bValue - aValue;
    }
    const compared = aValue.localeCompare(bValue, "vi", { sensitivity: "base" });
    return translatorSort.direction === "asc" ? compared : -compared;
  });
  const toggleTranslatorSort = (field) => {
    setTranslatorSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };
  const quickExportCollaborators = () => {
    const headers = [
      t("translator.fullName"),
      t("translator.idNumber"),
      t("translator.languages"),
      t("translator.isActive"),
    ];
    const rows = sortedList.map((row) => [
      row.fullName || "",
      row.idNumber || "",
      row.languages || "",
      row.isActive
        ? language === "vi"
          ? "Đang hoạt động"
          : "Active"
        : language === "vi"
          ? "Ngừng hoạt động"
          : "Inactive",
    ]);
    const filename =
      language === "vi"
        ? `DanhSachCongTacVienDichThuat_Nhanh_${getExportTimestamp()}.csv`
        : `translator_collaborators_quick_view_${getExportTimestamp()}.csv`;
    downloadCsvFile(filename, headers, rows);
    toastApi.success(
      language === "vi" ? "Đã kết xuất nhanh danh sách cộng tác viên." : "Translator collaborator quick export completed."
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      <ToastHost toast={toast} onClose={closeToast} />
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">{t("translator.title")}</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" onClick={quickExportCollaborators}>
            {t("common.quickExportCsv")}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setForm(EMPTY_FORM);
              setOpen(true);
            }}
          >
            {t("translator.addBtn")}
          </Button>
        </Box>
      </Box>
      <TableContainer component={Paper}>
        <Box sx={{ px: 2, pt: 1 }}>
          <Tooltip
            arrow
            title={`Đang sắp xếp theo "${TRANSLATOR_SORT_LABELS[translatorSort.field]}": ${
              translatorSort.direction === "asc" ? "tăng dần" : "giảm dần"
            }`}
          >
            <Typography variant="caption" color="text.secondary">
              ↕ Sắp xếp: {TRANSLATOR_SORT_LABELS[translatorSort.field]} (
              {translatorSort.direction === "asc" ? "A→Z" : "Z→A"})
            </Typography>
          </Tooltip>
        </Box>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={translatorSort.field === "fullName"}
                  direction={translatorSort.field === "fullName" ? translatorSort.direction : "asc"}
                  onClick={() => toggleTranslatorSort("fullName")}
                >
                  {t("translator.fullName")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={translatorSort.field === "idNumber"}
                  direction={translatorSort.field === "idNumber" ? translatorSort.direction : "asc"}
                  onClick={() => toggleTranslatorSort("idNumber")}
                >
                  {t("translator.idNumber")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={translatorSort.field === "languages"}
                  direction={translatorSort.field === "languages" ? translatorSort.direction : "asc"}
                  onClick={() => toggleTranslatorSort("languages")}
                >
                  {t("translator.languages")}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={translatorSort.field === "isActive"}
                  direction={translatorSort.field === "isActive" ? translatorSort.direction : "asc"}
                  onClick={() => toggleTranslatorSort("isActive")}
                >
                  {t("translator.isActive")}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">{t("users.actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography color="text.secondary">{t("translator.noCollaborators")}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              sortedList.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.fullName}</TableCell>
                  <TableCell>{row.idNumber || "-"}</TableCell>
                  <TableCell>{row.languages || "-"}</TableCell>
                  <TableCell>
                    {row.isActive ? <Chip label="Active" color="success" size="small" /> : <Chip label="Inactive" size="small" />}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      onClick={() => {
                        setForm({
                          id: row.id,
                          fullName: row.fullName,
                          idNumber: row.idNumber || "",
                          languages: row.languages || "",
                          signatureSample: row.signatureSample || "",
                          isActive: row.isActive,
                        });
                        setOpen(true);
                      }}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button size="small" color="error" onClick={() => remove(row.id)}>
                      {t("common.delete")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{form.id ? t("common.update") : t("translator.addBtn")}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField
              label={t("translator.fullName")}
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label={t("translator.idNumber")}
              value={form.idNumber}
              onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("translator.languages")}
              value={form.languages}
              onChange={(e) => setForm({ ...form, languages: e.target.value })}
              fullWidth
              placeholder="VD: Anh, Nhật, Trung"
            />
            <TextField
              label={t("translator.signatureSample")}
              value={form.signatureSample}
              onChange={(e) => setForm({ ...form, signatureSample: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
            {form.id && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Switch
                  checked={!!form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <Typography>{t("translator.isActive")}</Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={save} disabled={loading}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
