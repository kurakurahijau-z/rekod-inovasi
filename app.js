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

// POST tanpa application/json header (kurangkan risiko preflight)
async function apiPost(action, params={}, body={}) {
  const url = new URL(cfg.API_BASE);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));

  const r = await fetch(url.toString(), {
    method:"POST",
    // jangan set Content-Type application/json
    body: JSON.stringify(body)
  });
  return r.json();
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
    qs("#loginStatus").textContent = "Signing in…";

    // IMPORTANT: use GET to avoid CORS preflight
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

  qs("#meEmail").textContent = me.email;
  qs("#meRole").textContent = me.role;

  await refreshMyInnovations();
  await refreshReport("2026");
}

async function refreshMyInnovations() {
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });
  const body = qs("#myListBody");
  body.innerHTML = "";

  const items = (r.ok ? r.items : []);
  qs("#countTotal").textContent = items.length;

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
        <td><span class="pill ${((it.status||"").toLowerCase()==="aktif")?"ok":"warn"}">${escapeHtml(it.status||"")}</span></td>
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

  qs("#rYear").textContent = r.year;
  qs("#rTotal").textContent = r.summary.total;
  qs("#rAktif").textContent = r.summary.aktif;
  qs("#rMyipoYes").textContent = r.summary.myipoYes;
  qs("#rMyipoNo").textContent = r.summary.myipoNo;

  const tb = qs("#reportBody");
  tb.innerHTML = "";
  if (!r.items.length) {
    tb.innerHTML = `<tr><td colspan="4" class="muted">Tiada rekod untuk tahun ${escapeHtml(r.year)}.</td></tr>`;
    return;
  }
  for (const it of r.items) {
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

function doPrint() { window.print(); }
function doLogout(){ clearToken(); location.href = "./index.html"; }

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
