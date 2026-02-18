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
  return r.json();
}

/**
 * IMPORTANT: CORS-safe POST for GitHub Pages -> Apps Script
 * - DON'T use application/json (will trigger preflight OPTIONS)
 * - Use text/plain so request stays "simple" (no preflight)
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
async function onGoogleCredentialResponse(resp) {
  try {
    const s = qs("#loginStatus");
    if (s) s.textContent = "Signing in…";

    const r = await apiPost("loginGoogle", {}, { credential: resp.credential });
    if (!r.ok) throw new Error(r.error || "Login failed");

    setToken(r.token);
    localStorage.setItem("email", r.email);
    localStorage.setItem("role", r.role);

    location.href = "./dashboard.html";
  } catch (e) {
    const s = qs("#loginStatus");
    if (s) s.textContent = "Login failed: " + e.message;
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

  await refreshMyInnovations();
  await refreshReport("2026");
}

async function refreshMyInnovations() {
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });

  const body = qs("#myListBody");
  if (body) body.innerHTML = "";

  const items = (r.ok ? (r.items || []) : []);

  // ===== KPI based on listMyInnovations =====
  const years = new Set();
  let aktifCount = 0;
  let myipoYesCount = 0;

  for (const it of items) {
    const y = String(it.tahun || "").trim();
    if (y) years.add(y);

    const st = String(it.status || "").trim().toLowerCase();
    if (st === "aktif") aktifCount++;

    const ms = String(it.myipoStatus || "").trim().toLowerCase();
    if (ms === "yes") myipoYesCount++;
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
    const pillCls = (String(it.status||"").toLowerCase()==="aktif") ? "ok" : "warn";

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

// Helper: detect yes/no from backend item
function isMyipoYes_(it){
  // if backend returns structured fields
  if (it && typeof it.myipoStatus !== "undefined") {
    return String(it.myipoStatus||"").trim().toLowerCase() === "yes";
  }
  // else parse from "myipo" string: "yes / LYCxxxx" or "no /"
  const my = String(it && it.myipo ? it.myipo : "").trim().toLowerCase();
  if (!my) return false;
  const left = my.split("/")[0].trim(); // "yes" or "no"
  return left === "yes";
}

async function refreshReport(year) {
  const token = getToken();
  const r = await apiGet("generateReport", { token, year });
  if (!r.ok) return;

  const items = (r.items || []);

  // ===== SUMMARY (compute safely even if backend only returns myipo string) =====
  let total = items.length;
  let aktif = 0;
  let myipoYes = 0;
  let myipoNo = 0;

  for (const it of items) {
    const st = String(it.status || "").trim().toLowerCase();
    if (st === "aktif") aktif++;

    if (isMyipoYes_(it)) myipoYes++;
    else myipoNo++;
  }

  const y = String(r.year || year);

  const elYear1 = qs("#reportYearLabel");
  const elYear2 = qs("#reportYearSmall");
  const elTotal = qs("#rTotal");
  const elAktif = qs("#rAktif");
  const elYes   = qs("#rMyipoYes");
  const elNo    = qs("#rMyipoNo");

  if (elYear1) elYear1.textContent = y;
  if (elYear2) elYear2.textContent = y;
  if (elTotal) elTotal.textContent = total;
  if (elAktif) elAktif.textContent = aktif;
  if (elYes)   elYes.textContent   = myipoYes;
  if (elNo)    elNo.textContent    = myipoNo;

  const tb = qs("#reportBody");
  if (!tb) return;

  tb.innerHTML = "";
  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="4" class="muted">Tiada rekod untuk tahun ${escapeHtml(y)}.</td></tr>`;
    return;
  }

  for (const it of items) {
    const myipo = it.myipo
      ? String(it.myipo)
      : `${it.myipoStatus || ""} / ${it.myipoNumber || ""}`.trim();

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

function doPrint() {
  window.print();
}

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

  const msg = qs("#saveMsg");
  if (msg) msg.textContent = "Saving…";

  const r = await apiPost("addInnovation", { token }, payload);
  if (!r.ok) {
    if (msg) msg.textContent = "Gagal: " + (r.error || "");
    return;
  }
  if (msg) msg.textContent = "Berjaya simpan ✅";
  setTimeout(()=> location.href="./dashboard.html", 600);
}

// ===== util =====
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
