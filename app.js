// app.js
(function () {
  const CFG = window.APP_CONFIG || {};
  const API_BASE = (CFG.API_BASE || "").trim();

  // ===== Helpers =====
  function $(id) { return document.getElementById(id); }

  function setStatus(msg, type) {
    // type: "ok" | "err" | "info"
    const el = $("statusText");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = (type === "err") ? "#dc2626" : (type === "ok" ? "#16a34a" : "#334155");
  }

  function toQuery(params) {
    const usp = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      usp.set(k, String(v));
    });
    return usp.toString();
  }

  async function apiGet(action, params) {
    if (!API_BASE) throw new Error("API_BASE kosong. Semak config.js (guna URL googleusercontent).");

    const qs = toQuery({ action, ...params });
    const url = API_BASE + (API_BASE.includes("?") ? "&" : "?") + qs;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);

    try {
      const res = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        signal: ctrl.signal
      });

      // Kadang2 endpoint akan balas text/plain; kita cuba parse JSON
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { ok: false, raw: text }; }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} — ${text.slice(0, 120)}`);
      }
      return data;
    } finally {
      clearTimeout(t);
    }
  }

  // ===== Google Sign-In Callback =====
  async function onGoogleCredentialResponse(response) {
    try {
      setStatus("Semak akaun & whitelist...", "info");

      const credential = response && response.credential;
      if (!credential) throw new Error("Token Google kosong (credential missing).");

      // whoami: backend verify token, semak domain + whitelist
      const data = await apiGet("whoami", { credential });

      // expected: { ok:true, email:"...", allowed:true/false }
      if (!data || data.ok !== true) {
        throw new Error(data && data.error ? data.error : "Server balas tidak valid");
      }

      if (!data.email) throw new Error("Email kosong dari server.");
      if (data.allowed !== true) {
        setStatus("Akses ditolak: email tiada dalam whitelist.", "err");
        return;
      }

      // store session ringan (kalau kau ada team.html)
      localStorage.setItem("ri_email", data.email);
      localStorage.setItem("ri_login_ts", String(Date.now()));

      setStatus("Login berjaya. Redirect...", "ok");
      // ubah ikut flow kau
      window.location.href = "team.html";
    } catch (err) {
      const msg = (err && err.name === "AbortError")
        ? "Login gagal: Proxy timeout (request lambat / blocked)."
        : ("Login gagal: " + (err?.message || String(err)));
      setStatus(msg, "err");
      console.error(err);
    }
  }

  // ===== Boot =====
  async function boot() {
    try {
      setStatus("Memulakan sistem...", "info");

      // test ping
      const ping = await apiGet("ping", {});
      // ping boleh jadi {ok:true,...} atau text raw, ikut backend
      setStatus("Sedia. Sila login.", "ok");
      console.log("ping:", ping);

      // init Google button
      if (!CFG.GOOGLE_CLIENT_ID || !CFG.GOOGLE_CLIENT_ID.includes(".apps.googleusercontent.com")) {
        setStatus("GOOGLE_CLIENT_ID tak betul. Semak config.js.", "err");
        return;
      }

      if (!window.google || !google.accounts || !google.accounts.id) {
        setStatus("Google Identity Services tak load (check script client).", "err");
        return;
      }

      google.accounts.id.initialize({
        client_id: CFG.GOOGLE_CLIENT_ID,
        callback: onGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });

      // Render button pada div id="googleBtn"
      const btnEl = $("googleBtn");
      if (!btnEl) {
        setStatus("UI missing: div#googleBtn tak wujud.", "err");
        return;
      }

      google.accounts.id.renderButton(btnEl, {
        theme: "outline",
        size: "large",
        type: "standard",
        text: "continue_with",
        shape: "rectangular"
      });

    } catch (err) {
      const msg = (err && err.name === "AbortError")
        ? "Server ping timeout."
        : ("Boot error: " + (err?.message || String(err)));
      setStatus(msg, "err");
      console.error(err);
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
