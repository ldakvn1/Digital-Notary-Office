import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";
import "./index.css";
import App from "./App.jsx";
import { I18nProvider } from "./i18n.jsx";

const getValidationLocale = () =>
  String(document?.documentElement?.lang || navigator.language || "en")
    .toLowerCase()
    .startsWith("vi")
    ? "vi"
    : "en";

const getValidationMessage = (inputEl) => {
  const locale = getValidationLocale();
  const isVi = locale === "vi";
  if (!inputEl?.validity || inputEl.validity.valid) return "";
  if (inputEl.validity.valueMissing) {
    return isVi ? "Vui lòng điền vào trường này." : "Please fill out this field.";
  }
  if (inputEl.validity.typeMismatch && String(inputEl.type || "").toLowerCase() === "email") {
    return isVi ? "Vui lòng nhập địa chỉ email hợp lệ." : "Please enter a valid email address.";
  }
  return isVi ? "Giá trị không hợp lệ." : "Please enter a valid value.";
};

const handleNativeInvalid = (event) => {
  const inputEl = event?.currentTarget;
  if (!inputEl || typeof inputEl.setCustomValidity !== "function") return;
  inputEl.setCustomValidity("");
  inputEl.setCustomValidity(getValidationMessage(inputEl));
};

const clearNativeInvalid = (event) => {
  const inputEl = event?.currentTarget;
  if (!inputEl || typeof inputEl.setCustomValidity !== "function") return;
  inputEl.setCustomValidity("");
};

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#2563eb" },
    secondary: { main: "#7c3aed" },
    success: { main: "#059669" },
    warning: { main: "#d97706" },
    error: { main: "#dc2626" },
    background: {
      default: "#f3f6fb",
      paper: "#ffffff",
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', Roboto, sans-serif",
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid #e2e8f0",
          boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingInline: 14,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: "small",
        autoComplete: "off",
      },
    },
    MuiInputBase: {
      defaultProps: {
        inputProps: {
          autoComplete: "off",
          onInvalid: handleNativeInvalid,
          onInput: clearNativeInvalid,
          onChange: clearNativeInvalid,
        },
      },
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
