import { useRef, useState } from "react";
import axios from "axios";
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
  Typography,
  LinearProgress,
} from "@mui/material";
import { ToastHost, useToastQueue } from "./toast";
import { useI18n } from "./i18n";
import { evaluatePasswordPolicy } from "./utils/passwordPolicy";

export default function Login({ onLogin }) {
  const { t, language, setLanguage } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [initialChangeOpen, setInitialChangeOpen] = useState(false);
  const [initialNewPassword, setInitialNewPassword] = useState("");
  const [initialConfirmPassword, setInitialConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [loginFieldErrors, setLoginFieldErrors] = useState({
    username: "",
    password: "",
    captcha: "",
  });
  const usernameInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const captchaInputRef = useRef(null);
  const { toast, closeToast, api: toastApi } = useToastQueue();
  const initialPasswordPolicy = evaluatePasswordPolicy(initialNewPassword);
  const initialStrengthLabel =
    initialPasswordPolicy.score < 40
      ? t("common.weak")
      : initialPasswordPolicy.score < 80
        ? t("common.medium")
        : t("common.strong");

  const handleLogin = async () => {
    const validateRequiredFields = () => {
      const nextErrors = { username: "", password: "", captcha: "" };
      if (!String(username || "").trim()) {
        nextErrors.username = t("common.validationRequired");
      }
      if (!String(password || "").trim()) {
        nextErrors.password = t("common.validationRequired");
      }
      if (captchaQuestion && !String(captchaAnswer || "").trim()) {
        nextErrors.captcha = t("common.validationRequired");
      }
      setLoginFieldErrors(nextErrors);
      if (nextErrors.username) {
        usernameInputRef.current?.focus?.();
        return false;
      }
      if (nextErrors.password) {
        passwordInputRef.current?.focus?.();
        return false;
      }
      if (nextErrors.captcha) {
        captchaInputRef.current?.focus?.();
        return false;
      }
      return true;
    };
    if (!validateRequiredFields()) return;
    try {
      const res = await axios.post("http://localhost:4000/login", {
        username,
        password,
        captchaToken: captchaToken || undefined,
        captchaAnswer: captchaAnswer || undefined,
      });

      onLogin(res.data.user, {
        accessToken: res.data.accessToken || res.data.token,
        refreshToken: res.data.refreshToken,
      });
      setLoginFieldErrors({ username: "", password: "", captcha: "" });
      setCaptchaToken("");
      setCaptchaQuestion("");
      setCaptchaAnswer("");
    } catch (err) {
      if (
        err.response?.status === 401 &&
        (err.response?.data?.code === "INVALID_CREDENTIALS" || err.response?.data === "Invalid credentials")
      ) {
        toastApi.error(t("login.invalidCredentials"));
        return;
      }
      if (err.response?.status === 428 && err.response?.data?.code === "CAPTCHA_REQUIRED") {
        setCaptchaToken(err.response.data?.captcha?.token || "");
        setCaptchaQuestion(err.response.data?.captcha?.question || "");
        setLoginFieldErrors((prev) => ({ ...prev, captcha: "" }));
        toastApi.warning(t("login.captchaRequired"));
        return;
      }
      if (err.response?.status === 403 && err.response?.data?.code === "MUST_CHANGE_PASSWORD") {
        if (err.response?.data?.username) {
          setUsername(err.response.data.username);
        }
        setInitialChangeOpen(true);
        toastApi.warning(t("login.mustChangePassword"));
        return;
      }
      if (
        err.response?.status === 403 &&
        (err.response?.data?.code === "USER_DISABLED" ||
          err.response?.data?.code === "INITIAL_PASSWORD_EXPIRED")
      ) {
        toastApi.error(err.response?.data?.message || t("login.accountLocked"));
        return;
      }
      toastApi.error(err.response?.data?.message || err.response?.data || t("login.failed"));
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      toastApi.warning(t("login.forgotEmailRequired"));
      return;
    }
    setForgotLoading(true);
    try {
      const res = await axios.post("http://localhost:4000/auth/forgot-password", {
        email: forgotEmail.trim(),
      });
      toastApi.success(
        res.data?.message || t("login.forgotSentFallback")
      );
      setForgotOpen(false);
      setForgotEmail("");
    } catch (err) {
      toastApi.error(err.response?.data?.message || err.response?.data || t("login.forgotSendError"));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleInitialPasswordChange = async () => {
    if (!initialPasswordPolicy.isValid) {
      toastApi.warning(t("common.passwordRuleHint"));
      return;
    }
    if (initialNewPassword !== initialConfirmPassword) {
      toastApi.warning(t("login.confirmPasswordMismatch"));
      return;
    }
    try {
      await axios.post("http://localhost:4000/auth/initial-password-change", {
        username,
        currentPassword: password,
        newPassword: initialNewPassword,
      });
      toastApi.success(t("login.firstChangeSuccess"));
      setInitialChangeOpen(false);
      setInitialNewPassword("");
      setInitialConfirmPassword("");
    } catch (err) {
      if (err.response?.data?.code === "WEAK_PASSWORD") {
        toastApi.error(t("common.passwordRuleHint"));
        return;
      }
      toastApi.error(err.response?.data?.message || err.response?.data || t("login.firstChangeError"));
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 10% 20%, rgba(59,130,246,0.28) 0%, rgba(59,130,246,0) 35%), radial-gradient(circle at 85% 15%, rgba(168,85,247,0.24) 0%, rgba(168,85,247,0) 40%), linear-gradient(135deg,#0f172a 0%,#172554 45%,#312e81 100%)",
        p: 2,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.22,
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          top: -120,
          left: -120,
          width: 320,
          height: 320,
          borderRadius: "50%",
          bgcolor: "rgba(56,189,248,0.35)",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          right: -100,
          bottom: -100,
          width: 300,
          height: 300,
          borderRadius: "50%",
          bgcolor: "rgba(168,85,247,0.35)",
          filter: "blur(90px)",
          pointerEvents: "none",
        }}
      />
      <Paper
        sx={{
          p: 4,
          width: 400,
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.18)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(248,250,252,0.9) 100%)",
          boxShadow: "0 25px 60px rgba(2,6,23,0.42)",
          backdropFilter: "blur(8px)",
          zIndex: 1,
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>{t("common.language")}</InputLabel>
            <Select
              value={language}
              label={t("common.language")}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <MenuItem value="vi">{t("language.vi")}</MenuItem>
              <MenuItem value="en">{t("language.en")}</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
          <Avatar
            sx={{
              width: 44,
              height: 44,
              bgcolor: "primary.main",
              fontSize: 24,
              boxShadow: "0 8px 18px rgba(37,99,235,0.35)",
            }}
          >
            🏛️
          </Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
              {t("app.appName")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("login.secureTagline")}
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" mb={4}>
          {t("login.subtitle")}
        </Typography>
        <TextField
          fullWidth
          label={t("login.usernameOrEmail")}
          inputRef={usernameInputRef}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (loginFieldErrors.username) {
              setLoginFieldErrors((prev) => ({ ...prev, username: "" }));
            }
          }}
          onKeyPress={handleKeyPress}
          inputProps={{ lang: language === "vi" ? "vi" : "en" }}
          autoComplete="username"
          error={Boolean(loginFieldErrors.username)}
          helperText={loginFieldErrors.username || ""}
          sx={{ mt: 0.5, mb: 1 }}
        />
        <TextField
          fullWidth
          type="password"
          label={t("login.password")}
          inputRef={passwordInputRef}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (loginFieldErrors.password) {
              setLoginFieldErrors((prev) => ({ ...prev, password: "" }));
            }
          }}
          onKeyPress={handleKeyPress}
          inputProps={{ lang: language === "vi" ? "vi" : "en" }}
          autoComplete="current-password"
          error={Boolean(loginFieldErrors.password)}
          helperText={loginFieldErrors.password || ""}
          sx={{ mb: 1.5 }}
        />
        {captchaQuestion && (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Captcha: <b>{captchaQuestion}</b>
            </Typography>
            <TextField
              fullWidth
              label={t("login.captchaAnswer")}
              inputRef={captchaInputRef}
              value={captchaAnswer}
              onChange={(e) => {
                setCaptchaAnswer(e.target.value);
                if (loginFieldErrors.captcha) {
                  setLoginFieldErrors((prev) => ({ ...prev, captcha: "" }));
                }
              }}
              onKeyPress={handleKeyPress}
              inputProps={{ lang: language === "vi" ? "vi" : "en" }}
              autoComplete="off"
              error={Boolean(loginFieldErrors.captcha)}
              helperText={loginFieldErrors.captcha || ""}
              sx={{ mb: 2 }}
            />
          </>
        )}
        <Button fullWidth variant="contained" size="large" onClick={handleLogin}>
          {t("login.submit")}
        </Button>
        <Button fullWidth sx={{ mt: 1 }} onClick={() => setForgotOpen(true)}>
          {t("login.forgotPassword")}
        </Button>
      </Paper>
      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("login.forgotTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t("login.forgotDescription")}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label={t("login.forgotEmailLabel")}
            type="email"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForgotOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleForgotPassword} disabled={forgotLoading}>
            {forgotLoading ? t("login.forgotSending") : t("login.forgotSubmit")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={initialChangeOpen} onClose={() => setInitialChangeOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("login.firstChangeTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t("login.firstChangeDescription")}
          </Typography>
          <TextField
            fullWidth
            type="password"
            label={t("login.newPassword")}
            value={initialNewPassword}
            onChange={(e) => setInitialNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            sx={{ mb: 1.5 }}
          />
          <Tooltip
            arrow
            title={`${t("common.passwordRuleMinLength")}; ${t("common.passwordRuleLowercase")}; ${t("common.passwordRuleUppercase")}; ${t("common.passwordRuleNumber")}; ${t("common.passwordRuleSpecial")}`}
          >
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {t("common.passwordStrength")}: {initialStrengthLabel} ({initialPasswordPolicy.score}%)
              </Typography>
              <LinearProgress variant="determinate" value={initialPasswordPolicy.score} sx={{ mt: 0.5, height: 8, borderRadius: 5 }} />
            </Box>
          </Tooltip>
          <TextField
            fullWidth
            type="password"
            label={t("login.confirmNewPassword")}
            value={initialConfirmPassword}
            onChange={(e) => setInitialConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInitialChangeOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={handleInitialPasswordChange}>{t("login.updatePassword")}</Button>
        </DialogActions>
      </Dialog>
      <ToastHost toast={toast} onClose={closeToast} />
    </Box>
  );
}