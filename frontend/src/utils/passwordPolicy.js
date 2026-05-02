export function evaluatePasswordPolicy(password = "") {
  const value = String(password || "");
  const checks = {
    minLength: value.length >= 8,
    lowercase: /[a-z]/.test(value),
    uppercase: /[A-Z]/.test(value),
    number: /\d/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
  const passedCount = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passedCount / 5) * 100);
  const isValid = passedCount === 5;
  return { checks, score, isValid };
}
