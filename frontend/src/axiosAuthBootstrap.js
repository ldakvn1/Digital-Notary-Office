import axios from "axios";

/** Apply Bearer token from localStorage before any child component fires axios (avoids 401 race on cold load). */
export function syncAxiosAuthFromStorage() {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("token");
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
}

syncAxiosAuthFromStorage();
