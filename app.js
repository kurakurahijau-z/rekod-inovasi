// app.js
const cfg = window.APP_CONFIG;

function qs(sel){ return document.querySelector(sel); }

function setToken(token){ localStorage.setItem("token", token); }
function getToken(){ return localStorage.getItem("token") || ""; }
function clearToken(){
  localStorage.removeItem("token");
  localStorage.removeItem("email");
  localStorage.removeItem("role");
}

// --- Safe JSON fetch helpers ---
async function fetchJson(url, options = {}) {
  const r = await fetch(url, options);
  const txt = await r.text();
  try { return JSON.parse(txt); }
  catch {
    // Kalau Apps Script bagi HTML error page / redirect page
    return { ok:false, error:"Non-JSON response", raw: txt?.slice(0, 200) };
  }
}

function buildUrl(action, params={}) {
  const url = new URL(cfg.API_BASE);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function apiGet(action, params={}) {
  const url = buildUrl(action, params);
  return fetchJson(url, { method:"GET" });
}

async function apiPost(action, params={}, body={}) {
  const url = buildUrl(action, params);
  return fetchJson(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
}

// --- Auth guards ---
function requireAuthOrRedirect() {
  const token = getToken();
  if (!token) location.href = "./index.html";
}

async function loadMe() {
  const token = getToken();
  const r = await apiGet("me", { token });
  if (!r.ok) { clearToken(); location.href="./index.html"; return null; }
  localStorage.setItem("email", r.email);
  localStorage.setItem("role", r.role);
  return r;
}

// ===== Google Sign-In callback =====
async function onGoogleCredentialResponse(resp) {
  try {
    qs("#loginStatus").textContent = "Signing in…";

    // NOTE: action backend = loginGoogle
    const r = await apiPost("loginGoogle", {}, { credential: resp.credential });

    if (!r.ok) throw new Error(r.error || "Login failed");

    setToken(r.token);
    localStorage.setItem("email", r.email);
    localStorage.setItem("role", r.role);

    location.href = "./dashboard.html";
  } catch (e) {
    qs("#loginStatus").textContent = "Login failed: " + (e?.message || String(e));
  }
}

// ===== Dashboard =====
async function dashboardInit() {
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;

  qs("#meEmail").textContent = me.email || "-";
  qs("#meRole").textContent = me.role || "-";

  await refreshMyInnovations();
  await refreshReport("2026");
}

// --- Counts helpers ---
function norm(s){ return String(s||"").trim().toLowerCase(); }

function calcSummaryFromItems(items) {
  const years = new Set(items.map(it => String(it.tahun||"").trim()).filter(Boolean));
  const aktif = items.filter(it => norm(it.status) === "aktif").length;
  const myipoYes = items.filter(it => norm(it.myipoStatus) === "yes").length;
  const myipoNo = items.filter(it => norm(it.myipoStatus) === "no").length;

  return {
    total: items.length,
    yearsCount: years.size,
    aktif,
    myipoYes,
    myipoNo
  };
}

async function refreshMyInnovations() {
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });

  const body = qs("#myListBody");
  body.innerHTML = "";

  const items = (r.ok ? (r.items || []) : []);

  // ✅ betulkan cards atas
  const sum = calcSummaryFromItems(items);
  qs("#countTotal").textContent = sum.total;
  if (qs("#countYears")) qs("#countYears").textContent = sum.yearsCount;     // kalau ada element ni
  if (qs("#countAktif")) qs("#countAktif").textContent = sum.aktif;          // kalau ada element ni
  if (qs("#countMyipoYes")) qs("#countMyipoYes").textContent = sum.myipoYes; // kalau ada element ni

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">Belum ada rekod inovasi.</td></tr>`;
    return;
  }

  for (const it of items) {
    const myipo = `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim();
    body.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk || "")}</td>
        <td>${escapeHtml(it.tahun || "")}</td>
        <td>${escapeHtml(it.kategori || "")}</td>
        <td><span class="pill ${((norm(it.status)==="aktif")?"ok":"warn")}">${escapeHtml(it.status||"")}</span></td>
        <td>${escapeHtml(myipo)}</td>
        <td><code>${escapeHtml(it.innovationId||"")}</code></td>
      </tr>
    `;
  }
}

async function refreshReport(year) {
  const token = getToken();
  const r = await apiGet("generateReport", { token, year });

  if (!r.ok) return;

  const items = r.items || [];

  // ✅ guna summary backend kalau elok, kalau nampak pelik -> fallback kira sendiri
  let summary = r.summary || {};
  const fallback = calcSummaryFromItems(items);

  // kalau backend bagi 0 tapi items ada data, kita override
  const suspicious =
    items.length > 0 &&
    (Number(summary.aktif||0) === 0 && fallback.aktif > 0) &&
    (Number(summary.myipoYes||0) === 0 && fallback.myipoYes > 0);

  if (suspicious) summary = {
    total: fallback.total,
    aktif: fallback.aktif,
    myipoYes: fallback.myipoYes,
    myipoNo: fallback.myipoNo
  };

  qs("#rYear").textContent = r.year || year;
  qs("#rTotal").textContent = summary.total ?? items.length;
  qs("#rAktif").textContent = summary.aktif ?? fallback.aktif;
  qs("#rMyipoYes").textContent = summary.myipoYes ?? fallback.myipoYes;
  qs("#rMyipoNo").textContent = summary.myipoNo ?? fallback.myipoNo;

  const tb = qs("#reportBody");
  tb.innerHTML = "";

  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="4" class="muted">Tiada rekod untuk tahun ${escapeHtml(r.year || year)}.</td></tr>`;
    return;
  }

  for (const it of items) {
    const myipo = `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim();
    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk||"")}</td>
        <td>${escapeHtml(it.kategori||"")}</td>
        <td>${escapeHtml(it.status||"")}</td>
        <td>${escapeHtml(myipo)}</td>
      </tr>
    `;
  }
}

function doPrint() { window.print(); }

function doLogout() {
  clearToken();
  location.href = "./index.html";
}

// ===== Add Innovation =====
async function addInnovationInit() {
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;
  qs("#meEmail").textContent = me.email;
}

async function submitInnovation(e) {
  e.preventDefault();
  const token = getToken();

  const payload = {
    tajuk: qs("#tajuk").value.trim(),
    tahun: qs("#tahun").value.trim(),
    kategori: qs("#kategori").value.trim(),
    status: qs("#status").value.trim(),
    myipoStatus: qs("#myipoStatus").value.trim(),
    myipoNumber: qs("#myipoNumber").value.trim()
  };

  qs("#saveMsg").textContent = "Saving…";
  const r = await apiPost("addInnovation", { token }, payload);

  if (!r.ok) {
    qs("#saveMsg").textContent = "Gagal: " + (r.error || "");
    return;
  }

  qs("#saveMsg").textContent = "Berjaya simpan ✅";
  setTimeout(()=> location.href="./dashboard.html", 600);
}

// ===== util =====
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
