/* app.js — Rekod Inovasi Jabatan (Login Google + whitelist)
   - Semua fetch guna APP_CONFIG.API_BASE (echo) untuk elak CORS.
   - POST guna Content-Type text/plain supaya tak trigger preflight OPTIONS (selamat untuk Apps Script).
*/

(function () {
  const $ = (sel) => document.querySelector(sel);

  // Tukar ikut ID element HTML kau kalau berbeza
  const elMsg = $("#msg") || document.querySelector('[data-msg]');
  const setMsg = (t, isErr = false) => {
    if (!elMsg) return;
    elMsg.textContent = t || "";
    elMsg.style.color = isErr ? "#b91c1c" : "#334155";
  };

  function getCfg() {
    if (!window.APP_CONFIG || !APP_CONFIG.API_BASE) {
      throw new Error("APP_CONFIG tak wujud / API_BASE kosong. Pastikan config.js load dulu.");
    }
    return window.APP_CONFIG;
  }

  // Helper: POST tanpa preflight
  async function apiPost(payloadObj) {
    const { API_BASE } = getCfg();

    const res = await fetch(API_BASE, {
      method: "POST",
      headers: {
        // text/plain = simple request -> tak trigger preflight
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payloadObj)
    });

    const txt = await res.text();

    // Cuba parse JSON
    let data;
    try { data = JSON.parse(txt); } catch (e) { data = { ok: false, raw: txt }; }

    if (!res.ok) {
      const msg = data?.error || data?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // Optional ping untuk debug (tak wajib)
  async function apiPing() {
    return apiPost({ action: "ping" });
  }

  // Google Identity Services callback
  window.onGoogleCredentialResponse = async function (response) {
    try {
      setMsg("Semak akaun & whitelist…");

      const credential = response && response.credential;
      if (!credential) {
        setMsg("Login gagal: token kosong dari Google", true);
        return;
      }

      // Hantar token ke server untuk verify + whitelist check
      const data = await apiPost({
        action: "loginGoogle",
        credential
      });

      console.log("loginGoogle response:", data);

      // Normalisasi email (sebab kadang payload berbeza)
      const email =
        data?.email ||
        data?.user?.email ||
        data?.profile?.email ||
        "";

      if (!email) {
        setMsg("Login gagal: email kosong dari server", true);
        return;
      }

      if (data.allowed !== true) {
        // Backend patut bagi reason kalau tak allowed
        const reason = data.reason || "email tiada dalam whitelist";
        setMsg(`Akses ditolak: ${reason}`, true);
        return;
      }

      // Success
      setMsg(`Berjaya. (${email})`);

      // Simpan session ringkas (kalau kau nak guna untuk page seterusnya)
      localStorage.setItem("ri_email", email);
      localStorage.setItem("ri_login_ts", new Date().toISOString());

      // Redirect (kalau ada)
      // location.href = "dashboard.html";
    } catch (err) {
      console.error(err);
      setMsg(`Failed to fetch / API error: ${err.message}`, true);
    }
  };

  // Boot: pastikan script load elok
  (async function boot() {
    try {
      getCfg();

      // Ping sekali untuk pastikan endpoint hidup (optional)
      // Kalau kau rasa menyusahkan, kau boleh comment line ini.
      await apiPing();

      // Kalau kau guna elemen custom untuk button google, biar index.html handle.
      // Di sini kita cuma pastikan callback wujud.
    } catch (e) {
      console.error(e);
      setMsg(e.message, true);
    }
  })();
})();
