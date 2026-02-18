// ==============================
// app.js (FULL)
// ==============================

// ---- Config ----
const cfg = window.APP_CONFIG || {};

// ---- Helpers ----
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

function setToken(token){ localStorage.setItem("token", token); }
function getToken(){ return localStorage.getItem("token") || ""; }
function clearToken(){
  localStorage.removeItem("token");
  localStorage.removeItem("email");
  localStorage.removeItem("role");
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function setText(idOrEl, text){
  const el = (typeof idOrEl === "string") ? qs(idOrEl) : idOrEl;
  if (el) el.textContent = text;
}

function setHtml(idOrEl, html){
  const el = (typeof idOrEl === "string") ? qs(idOrEl) : idOrEl;
  if (el) el.innerHTML = html;
}

// ==============================
// API (IMPORTANT: CORS-safe POST)
// ==============================

async function apiGet(action, params={}) {
  const url = new URL(cfg.API_BASE);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));

  const r = await fetch(url.toString(), { method:"GET" });

  // Apps Script sometimes returns text/html on errors. So parse safely:
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { return { ok:false, error:"Non-JSON response", raw:text }; }
}

async function apiPost(action, params={}, body={}) {
  const url = new URL(cfg.API_BASE);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));

  // IMPORTANT:
  // Do NOT set Content-Type: application/json
  // That triggers OPTIONS preflight -> Apps Script webapp doesn't handle -> Failed to fetch
  const r = await fetch(url.toString(), {
    method:"POST",
    body: JSON.stringify(body)
  });

  const text = await r.text();
  try { return JSON.parse(text); }
  catch { return { ok:false, error:"Non-JSON response", raw:text }; }
}

// ==============================
// Auth helpers
// ==============================

function requireAuthOrRedirect() {
  const token = getToken();
  if (!token) location.href = "./index.html";
}

async function loadMe() {
  const token = getToken();
  const r = await apiGet("me", { token });
  if (!r || !r.ok) {
    clearToken();
    location.href="./index.html";
    return null;
  }
  localStorage.setItem("email", r.email || "");
  localStorage.setItem("role", r.role || "user");
  return r;
}

// ==============================
// Google Sign-In callback
// ==============================
// IMPORTANT: Google Identity Services calls window.onGoogleCredentialResponse
window.onGoogleCredentialResponse = async function onGoogleCredentialResponse(resp) {
  try {
    setText("#loginStatus", "Signing in…");

    if (!resp || !resp.credential) {
      throw new Error("No credential received");
    }

    const r = await apiPost("loginGoogle", {}, { credential: resp.credential });
    if (!r || !r.ok) throw new Error(r?.error || "Login failed");

    setToken(r.token);
    localStorage.setItem("email", r.email || "");
    localStorage.setItem("role", r.role || "user");

    location.href = "./dashboard.html";
  } catch (e) {
    setText("#loginStatus", "Login failed: " + (e?.message || String(e)));
  }
};

// ==============================
// Dashboard
// ==============================

async function dashboardInit() {
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;

  setText("#meEmail", me.email || "");
  setText("#meRole", me.role || "user");

  await refreshMyInnovations();
  await refreshReport("2026");

  // Wire buttons if exist
  const btnList = qs("#btnListMyInnovations");
  if (btnList) btnList.addEventListener("click", refreshMyInnovations);

  const btnReport = qs("#btnGenerateReport");
  if (btnReport) btnReport.addEventListener("click", () => refreshReport("2026"));

  const btnPrint = qs("#btnPrint");
  if (btnPrint) btnPrint.addEventListener("click", doPrint);

  const btnLogout = qs("#btnLogout");
  if (btnLogout) btnLogout.addEventListener("click", doLogout);

  const btnAdd = qs("#btnAddInnovation");
  if (btnAdd) btnAdd.addEventListener("click", () => location.href="./add-innovation.html");
}

async function refreshMyInnovations() {
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });

  const body = qs("#myListBody");
  if (!body) return;

  body.innerHTML = "";

  const items = (r && r.ok ? (r.items || []) : []);
  setText("#countTotal", items.length);

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">Belum ada rekod inovasi.</td></tr>`;
    return;
  }

  for (const it of items) {
    const myipo = `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim().replace(/^\/\s*|\s*\/$/g,"");
    const isAktif = ((it.status||"").toLowerCase()==="aktif");
    body.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk || "")}</td>
        <td>${escapeHtml(it.tahun || "")}</td>
        <td>${escapeHtml(it.kategori || "")}</td>
        <td><span class="pill ${isAktif ? "ok" : "warn"}">${escapeHtml(it.status||"")}</span></td>
        <td>${escapeHtml(myipo)}</td>
        <td><code>${escapeHtml(it.innovationId||"")}</code></td>
      </tr>
    `;
  }

  // Debug JSON if section exists
  const dbg = qs("#debugJson");
  if (dbg) dbg.textContent = JSON.stringify(r, null, 2);
}

async function refreshReport(year) {
  const token = getToken();
  const r = await apiGet("generateReport", { token, year });
  if (!r || !r.ok) return;

  setText("#rYear", r.year);
  setText("#rTotal", r.summary?.total ?? 0);
  setText("#rAktif", r.summary?.aktif ?? 0);
  setText("#rMyipoYes", r.summary?.myipoYes ?? 0);
  setText("#rMyipoNo", r.summary?.myipoNo ?? 0);

  const tb = qs("#reportBody");
  if (!tb) return;

  tb.innerHTML = "";
  const items = r.items || [];

  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="4" class="muted">Tiada rekod untuk tahun ${escapeHtml(r.year)}.</td></tr>`;
    return;
  }

  for (const it of items) {
    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk||"")}</td>
        <td>${escapeHtml(it.kategori||"")}</td>
        <td>${escapeHtml(it.status||"")}</td>
        <td>${escapeHtml(it.myipo||"")}</td>
      </tr>
    `;
  }
}

function doPrint() {
  window.print();
}

function doLogout() {
  clearToken();
  location.href = "./index.html";
}

// ==============================
// Add Innovation page
// ==============================

async function addInnovationInit() {
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;
  setText("#meEmail", me.email || "");

  const form = qs("#innovationForm");
  if (form) form.addEventListener("submit", submitInnovation);
}

async function submitInnovation(e) {
  e.preventDefault();
  const token = getToken();

  const payload = {
    tajuk: (qs("#tajuk")?.value || "").trim(),
    tahun: (qs("#tahun")?.value || "").trim(),
    kategori: (qs("#kategori")?.value || "").trim(),
    status: (qs("#status")?.value || "").trim(),
    myipoStatus: (qs("#myipoStatus")?.value || "").trim(),
    myipoNumber: (qs("#myipoNumber")?.value || "").trim()
  };

  setText("#saveMsg", "Saving…");
  const r = await apiPost("addInnovation", { token }, payload);

  if (!r || !r.ok) {
    setText("#saveMsg", "Gagal: " + (r?.error || "Unknown error"));
    return;
  }

  setText("#saveMsg", "Berjaya simpan ✅");
  setTimeout(()=> location.href="./dashboard.html", 600);
}

// ==============================
// Auto-init by page
// ==============================

function currentPage() {
  const p = (location.pathname.split("/").pop() || "").toLowerCase();
  return p || "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const p = currentPage();

  // index/login page: nothing mandatory; Google button handled by GIS script
  if (p === "dashboard.html") dashboardInit();
  if (p === "add-innovation.html" || p === "add-innovation.htm") addInnovationInit();
});

// ==============================
// config.js (OPTIONAL inline)
// If you already have separate config.js, you can remove this section.
// ==============================
window.APP_CONFIG = window.APP_CONFIG || {
  API_BASE: "https://script.google.com/macros/s/AKfycbw5B9rmptyZuBJ7nIf1rHZBA7in4emEJF2Ubaep0pFDerua6APFXsoU_XdJpyhuy7KO/exec",
  GOOGLE_CLIENT_ID: "637964120539-4knkg8lrjdaludsn8gncjidse7bpl23m.apps.googleusercontent.com",
  ALLOWED_DOMAIN: "pms.edu.my"
};
