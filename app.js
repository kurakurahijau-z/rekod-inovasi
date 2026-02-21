// app.js
(function () {
  const CFG = window.APP_CONFIG || {};
  const API_BASE = CFG.API_BASE;
  const ALLOWED_DOMAIN = CFG.ALLOWED_DOMAIN || "pms.edu.my";

  const $status = document.getElementById("statusText"); // pastikan id ni wujud
  const $btn = document.getElementById("googleBtn");     // container button
  const $emailHint = document.getElementById("emailHint");

  function setStatus(msg, isError) {
    if (!$status) return;
    $status.textContent = msg;
    $status.style.color = isError ? "#dc2626" : "#2563eb";
  }

  // --- JSONP helper (no CORS) ---
  function jsonp(url, params) {
    return new Promise((resolve, reject) => {
      const cbName = "cb_" + Math.random().toString(36).slice(2);
      const qs = new URLSearchParams({ ...params, callback: cbName });

      const src = url + (url.includes("?") ? "&" : "?") + qs.toString();
      const script = document.createElement("script");
      script.src = src;
      script.async = true;

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("jsonp_timeout"));
      }, 15000);

      function cleanup() {
        clearTimeout(timeout);
        delete window[cbName];
        script.remove();
      }

      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("jsonp_network_error"));
      };

      document.head.appendChild(script);
    });
  }

  // --- JWT decode (Google credential is a JWT) ---
  function decodeJwtEmail(credential) {
    const parts = String(credential || "").split(".");
    if (parts.length < 2) return "";
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(atob(payload).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
    const obj = JSON.parse(json);
    return String(obj.email || "").trim().toLowerCase();
  }

  async function handleGoogleCredential(response) {
    try {
      setStatus("Semak akaun Google...", false);

      const email = decodeJwtEmail(response.credential);
      if (!email) {
        setStatus("Login gagal: email kosong dari Google token", true);
        return;
      }

      if (!email.endsWith("@" + ALLOWED_DOMAIN)) {
        setStatus("Email bukan domain @" + ALLOWED_DOMAIN, true);
        return;
      }

      if ($emailHint) $emailHint.textContent = email;

      setStatus("Semak whitelist StaffDirectory...", false);

      const data = await jsonp(API_BASE, { action: "checkWhitelist", email });

      if (!data || data.ok !== true) {
        setStatus("Server error: " + (data && data.error ? data.error : "unknown"), true);
        return;
      }

      if (!data.allowed) {
        setStatus("Akses ditolak: email tiada dalam whitelist (StaffDirectory)", true);
        return;
      }

      // allowed -> you can redirect / show dashboard
      setStatus("Berjaya! Akses dibenarkan.", false);

      // contoh simpan session ringkas
      localStorage.setItem("ri_email", email);
      localStorage.setItem("ri_loggedIn", "1");

      // TODO: redirect page
      // window.location.href = "./home.html";

    } catch (err) {
      console.error(err);
      setStatus("Login gagal: " + String(err.message || err), true);
    }
  }

  // init Google button (GIS)
  window.initGoogle = function initGoogle() {
    if (!window.google || !google.accounts || !google.accounts.id) {
      setStatus("Google Identity Services belum load", true);
      return;
    }

    setStatus("", false);

    google.accounts.id.initialize({
      client_id: CFG.GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      hosted_domain: ALLOWED_DOMAIN // ini bagi hint domain
    });

    google.accounts.id.renderButton($btn, {
      theme: "outline",
      size: "large",
      text: "signin_with"
    });
  };
})();
