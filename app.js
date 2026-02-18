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

async function apiGet(action, params={}) {
  const url = new URL(cfg.API_BASE);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { method:"GET" });
  const t = await r.text();
  try { return JSON.parse(t); }
  catch { return { ok:false, error:"Invalid JSON from server", raw:t }; }
}

/**
 * CORS-safe POST for GitHub Pages -> Apps Script
 * - Use text/plain to avoid preflight
 */
async function apiPost(action, params={}, body={}) {
  const url = new URL(cfg.API_BASE);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));

  const r = await fetch(url.toString(), {
    method:"POST",
    headers:{ "Content-Type":"text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });

  const t = await r.text();
  try { return JSON.parse(t); }
  catch { return { ok:false, error:"Invalid JSON from server", raw:t }; }
}

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
// IMPORTANT: backend loginGoogle is GET CORS-safe.
// We'll call GET to avoid any surprise.
async function onGoogleCredentialResponse(resp) {
  try {
    qs("#loginStatus").textContent = "Signing in…";
    const r = await apiGet("loginGoogle", { credential: resp.credential });
    if (!r.ok) throw new Error(r.error || "Login failed");

    setToken(r.token);
    localStorage.setItem("email", r.email);
    localStorage.setItem("role", r.role);

    location.href = "./dashboard.html";
  } catch (e) {
    qs("#loginStatus").textContent = "Login failed: " + e.message;
  }
}

// ===== Dashboard =====
async function dashboardInit() {
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;

  const elEmail = qs("#meEmail");
  const elRole  = qs("#meRole");
  if (elEmail) elEmail.textContent = me.email;
  if (elRole)  elRole.textContent  = me.role;

  // admin-only section
  const adminWrap = qs("#adminSection");
  if (adminWrap) adminWrap.style.display = (me.role === "admin") ? "block" : "none";

  await refreshMyInnovations();
  await refreshReport("2026");

  if (me.role === "admin") {
    await refreshDeptReport("2026");
  }
}

function normalizeYesNo(v){
  const s = String(v || "").trim().toLowerCase();
  if (s === "yes" || s === "y" || s === "ya") return "yes";
  if (s === "no" || s === "n" || s === "tidak") return "no";
  return s; // fallback
}

function normalizeStatus(v){
  return String(v || "").trim().toLowerCase();
}

async function refreshMyInnovations() {
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });

  const body = qs("#myListBody");
  if (body) body.innerHTML = "";

  const items = (r.ok ? (r.items || []) : []);

  // KPI (MY)
  const years = new Set();
  let aktifCount = 0;
  let myipoYesCount = 0;

  for (const it of items) {
    const y = String(it.tahun || "").trim();
    if (y) years.add(y);

    if (normalizeStatus(it.status) === "aktif") aktifCount++;

    if (normalizeYesNo(it.myipoStatus) === "yes") myipoYesCount++;
  }

  const elTotal = qs("#countTotal");
  const elYears = qs("#countYears");
  const elAktif = qs("#countAktif");
  const elMyipo = qs("#countMyipoYes");

  if (elTotal) elTotal.textContent = items.length;
  if (elYears) elYears.textContent = years.size;
  if (elAktif) elAktif.textContent = aktifCount;
  if (elMyipo) elMyipo.textContent = myipoYesCount;

  if (!body) return;

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">Belum ada rekod inovasi.</td></tr>`;
    return;
  }

  for (const it of items) {
    const myipo = `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim();
    const pillCls = (normalizeStatus(it.status)==="aktif") ? "ok" : "warn";

    body.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk || "")}</td>
        <td>${escapeHtml(it.tahun || "")}</td>
        <td>${escapeHtml(it.kategori || "")}</td>
        <td><span class="pill ${pillCls}">${escapeHtml(it.status||"")}</span></td>
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

  const items = (r.items || []);

  // SUMMARY (MY) - kira dari items (robust)
  let aktif = 0;
  let myipoYes = 0;
  let myipoNo = 0;

  for (const it of items) {
    if (normalizeStatus(it.status) === "aktif") aktif++;

    const ms = normalizeYesNo(it.myipoStatus);
    if (ms === "yes") myipoYes++;
    else if (ms === "no") myipoNo++;
    else {
      // fallback: kalau kosong, anggap No (ikut logic lama)
      myipoNo++;
    }
  }

  const elYear = qs("#rYear");
  const elTotal = qs("#rTotal");
  const elAktif = qs("#rAktif");
  const elYes = qs("#rMyipoYes");
  const elNo = qs("#rMyipoNo");

  if (elYear)  elYear.textContent  = String(r.year || year);
  if (elTotal) elTotal.textContent = items.length;
  if (elAktif) elAktif.textContent = aktif;
  if (elYes)   elYes.textContent   = myipoYes;
  if (elNo)    elNo.textContent    = myipoNo;

  const tb = qs("#reportBody");
  if (!tb) return;

  tb.innerHTML = "";
  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="4" class="muted">Tiada rekod untuk tahun ${escapeHtml(String(r.year || year))}.</td></tr>`;
    return;
  }

  for (const it of items) {
    const myipo = `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim();

    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk||"")}</td>
        <td>${escapeHtml(it.kategori||"")}</td>
        <td>${escapeHtml(it.status||"")}</td>
        <td>${escapeHtml(myipo||"")}</td>
      </tr>
    `;
  }
}

// ===== ADMIN: Dept Report =====
async function refreshDeptReport(year){
  const token = getToken();
  const r = await apiGet("generateDeptReport", { token, year });
  if (!r.ok) {
    const msg = qs("#deptMsg");
    if (msg) msg.textContent = "Admin report gagal: " + (r.error || "");
    return;
  }

  const items = (r.items || []);

  let aktif = 0, myYes = 0, myNo = 0;
  for (const it of items){
    if (normalizeStatus(it.status) === "aktif") aktif++;
    const ms = normalizeYesNo(it.myipoStatus);
    if (ms === "yes") myYes++;
    else if (ms === "no") myNo++;
    else myNo++;
  }

  const elTotal = qs("#dTotal");
  const elAktif = qs("#dAktif");
  const elYes = qs("#dMyipoYes");
  const elNo = qs("#dMyipoNo");
  const elYear = qs("#dYear");

  if (elYear) elYear.textContent = String(r.year || year);
  if (elTotal) elTotal.textContent = items.length;
  if (elAktif) elAktif.textContent = aktif;
  if (elYes) elYes.textContent = myYes;
  if (elNo) elNo.textContent = myNo;

  const tb = qs("#deptBody");
  if (!tb) return;

  tb.innerHTML = "";
  if (!items.length){
    tb.innerHTML = `<tr><td colspan="5" class="muted">Tiada rekod jabatan untuk tahun ${escapeHtml(String(r.year||year))}.</td></tr>`;
    return;
  }

  for (const it of items){
    const myipo = `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim();
    const pillCls = (normalizeStatus(it.status)==="aktif") ? "ok" : "warn";
    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(it.ownerEmail||"")}</td>
        <td>${escapeHtml(it.tajuk||"")}</td>
        <td>${escapeHtml(it.kategori||"")}</td>
        <td><span class="pill ${pillCls}">${escapeHtml(it.status||"")}</span></td>
        <td>${escapeHtml(myipo||"")}</td>
      </tr>
    `;
  }

  const msg = qs("#deptMsg");
  if (msg) msg.textContent = "";
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
  const elEmail = qs("#meEmail");
  if (elEmail) elEmail.textContent = me.email;
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
