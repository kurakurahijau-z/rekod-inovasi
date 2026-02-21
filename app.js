// app.js
(function () {
  const CFG = window.APP_CONFIG;

  const $ = (sel) => document.querySelector(sel);

  let proxyFrame = null;
  let proxyReady = false;
  const pending = new Map();

  function setStatus(msg, isError) {
    const el = $("#status");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isError ? "#dc2626" : "#334155";
  }

  function createProxyIframe() {
    proxyFrame = document.createElement("iframe");
    proxyFrame.src = CFG.PROXY_URL; // loads Proxy.html from Apps Script
    proxyFrame.style.display = "none";
    proxyFrame.referrerPolicy = "no-referrer";
    document.body.appendChild(proxyFrame);
  }

  window.addEventListener("message", (event) => {
    // only accept from Apps Script domains
    // Apps Script iframe origin usually: https://script.google.com OR https://script.googleusercontent.com
    const okOrigin =
      event.origin.startsWith("https://script.google.com") ||
      event.origin.startsWith("https://script.googleusercontent.com");

    if (!okOrigin) return;

    const data = event.data || {};
    if (data.proxyReady) {
      proxyReady = true;
      return;
    }

    if (!data.rid) return;
    const resolver = pending.get(data.rid);
    if (resolver) {
      pending.delete(data.rid);
      resolver(data);
    }
  });

  function callProxy(action, payload) {
    return new Promise((resolve, reject) => {
      if (!proxyFrame || !proxyFrame.contentWindow) {
        reject(new Error("Proxy iframe not ready"));
        return;
      }
      const rid = "r" + Math.random().toString(16).slice(2) + Date.now();
      pending.set(rid, (res) => resolve(res));

      // We post to "*" because we don't control exact origin (script.google.com vs script.googleusercontent.com),
      // security is enforced inside Proxy.html by checking GitHub origin.
      proxyFrame.contentWindow.postMessage({ rid, action, payload }, "*");

      setTimeout(() => {
        if (pending.has(rid)) {
          pending.delete(rid);
          reject(new Error("Proxy timeout"));
        }
      }, 15000);
    });
  }

  // Google Identity Services callback
  async function onGoogleCredentialResponse(response) {
    try {
      setStatus("Semak akses…", false);

      const idToken = response && response.credential;
      if (!idToken) {
        setStatus("Login gagal: token kosong dari Google", true);
        return;
      }

      const res = await callProxy("login", { idToken });

      if (!res.ok) {
        setStatus("Login gagal: " + (res.error || "Unknown error"), true);
        return;
      }

      // success
      localStorage.setItem("ri_email", res.email || "");
      setStatus("Berjaya login: " + (res.email || ""), false);

      // Optional: redirect
      // window.location.href = "./team.html";
    } catch (err) {
      setStatus("Login gagal: " + (err.message || String(err)), true);
    }
  }

  // boot
  function boot() {
    // basic config sanity
    if (!CFG || !CFG.PROXY_URL || !CFG.GOOGLE_CLIENT_ID) {
      setStatus("Config tak lengkap. Semak PROXY_URL & GOOGLE_CLIENT_ID.", true);
      return;
    }

    createProxyIframe();

    // init GIS button
    /* global google */
    google.accounts.id.initialize({
      client_id: CFG.GOOGLE_CLIENT_ID,
      callback: onGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    google.accounts.id.renderButton($("#googleBtn"), {
      theme: "outline",
      size: "large",
      width: 320,
      text: "continue_with"
    });

    setStatus("", false);
  }

  window.addEventListener("load", boot);
})();
