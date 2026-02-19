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
 * CORS-safe POST (avoid preflight)
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
// backend loginGoogle is GET (CORS safe)
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

function normalizeYesNo(v){
  const s = String(v || "").trim().toLowerCase();
  if (["yes","ya","y","true","1"].includes(s)) return "yes";
  if (["no","n","tidak","false","0"].includes(s)) return "no";
  return s;
}
function normalizeStatus(v){ return String(v || "").trim().toLowerCase(); }

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
  await refreshCompetitionReport("2026");
}

async function refreshMyInnovations() {
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });

  const body = qs("#myListBody");
  if (body) body.innerHTML = "";

  const items = (r.ok ? (r.items || []) : []);

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

  let aktif = 0;
  let myipoYes = 0;
  let myipoNo = 0;

  for (const it of items) {
    if (normalizeStatus(it.status) === "aktif") aktif++;
    const ms = normalizeYesNo(it.myipoStatus);
    if (ms === "yes") myipoYes++;
    else myipoNo++;
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

/* =========================
   COMPETITIONS (Dashboard)
========================= */

async function refreshCompetitionReport(year){
  const token = getToken();
  const r = await apiGet("generateCompetitionReport", { token, year });
  if (!r.ok) {
    const m = qs("#cMsg");
    if (m) m.textContent = "Report pertandingan gagal: " + (r.error || "");
    return;
  }

  const s = r.summary || {};
  const items = r.items || [];

  // top KPIs
  const elTotal = qs("#cTotal");
  const elAK = qs("#cAK");
  const elGold = qs("#cGold");
  const elIntl = qs("#cIntl");

  if (elTotal) elTotal.textContent = s.totalPenyertaan ?? items.length;
  if (elAK) elAK.textContent = s.anugerahKhas ?? 0;
  if (elGold) elGold.textContent = (s.medals && s.medals.Gold) ? s.medals.Gold : 0;
  if (elIntl) elIntl.textContent = (s.peringkat && s.peringkat.Antarabangsa) ? s.peringkat.Antarabangsa : 0;

  // table
  const tb = qs("#compBody");
  if (!tb) return;

  tb.innerHTML = "";
  if (!items.length){
    tb.innerHTML = `<tr><td colspan="6" class="muted">Belum ada rekod penyertaan untuk tahun ${escapeHtml(String(r.year||year))}.</td></tr>`;
    return;
  }

  for (const it of items){
    const ak = normalizeYesNo(it.anugerahKhas) === "yes" ? "Ya" : "Tidak";
    const nak = String(it.namaAnugerahKhas||"").trim();

    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(it.tajuk||"")}</td>
        <td>${escapeHtml(it.namaEvent||"")}</td>
        <td>${escapeHtml(it.peringkat||"")}</td>
        <td>${escapeHtml(it.pingat||"")}</td>
        <td>${escapeHtml(ak)}${nak ? ` — <span class="muted">${escapeHtml(nak)}</span>` : ""}</td>
        <td><code>${escapeHtml(it.innovationId||"")}</code></td>
      </tr>
    `;
  }

  const m = qs("#cMsg");
  if (m) m.textContent = "";
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

/* =========================
   TEAM PAGE
========================= */

async function teamInit(){
  requireAuthOrRedirect();
  const me = await loadMe();
  if (!me) return;

  const elEmail = qs("#meEmail");
  if (elEmail) elEmail.textContent = me.email;

  await teamLoadMyInnovations_();
  await teamLoadDirectory_();
  await teamRefreshList_();

  // toggle external
  const chk = qs("#isExternal");
  if (chk){
    chk.addEventListener("change", () => teamToggleExternal_(chk.checked));
    teamToggleExternal_(chk.checked);
  }

  // when innovation changes, refresh list
  const selInv = qs("#innovationId");
  if (selInv){
    selInv.addEventListener("change", () => teamRefreshList_());
  }

  // when directory choice changes, auto-fill email/name/dept
  const pick = qs("#staffPick");
  if (pick){
    pick.addEventListener("change", () => teamApplyStaffPick_());
    pick.addEventListener("input", () => teamApplyStaffPick_());
  }
}

let __staffDirectory = []; // cached directory

async function teamLoadDirectory_(){
  const token = getToken();
  const r = await apiGet("listStaffDirectory", { token });
  __staffDirectory = (r.ok ? (r.items||[]) : []);

  const dl = qs("#staffList");
  if (!dl) return;

  dl.innerHTML = "";
  // datalist option value we use: "Nama — email"
  for (const it of __staffDirectory){
    const label = `${it.nama || it.email} — ${it.email}`;
    const opt = document.createElement("option");
    opt.value = label;
    dl.appendChild(opt);
  }
}

function teamApplyStaffPick_(){
  const val = String(qs("#staffPick")?.value || "").trim();
  if (!val) return;

  // parse "... — email"
  const parts = val.split("—");
  const email = parts.length >= 2 ? String(parts[1]||"").trim().toLowerCase() : "";

  const found = email ? __staffDirectory.find(x => String(x.email||"").toLowerCase().trim() === email) : null;

  if (found){
    if (qs("#memberEmail")) qs("#memberEmail").value = found.email;
    if (qs("#memberName")) qs("#memberName").value = found.nama || "";
    const dept = (found.jabatan || found.unit || "").trim();
    if (qs("#memberDept")) qs("#memberDept").value = dept;
  } else {
    // fallback: if user typed email directly
    if (val.includes("@") && qs("#memberEmail")) qs("#memberEmail").value = val.toLowerCase();
  }
}

function teamToggleExternal_(isExternal){
  const boxExternal = qs("#externalBox");
  const boxDirectory = qs("#directoryBox");
  if (boxExternal) boxExternal.style.display = isExternal ? "block" : "none";
  if (boxDirectory) boxDirectory.style.display = isExternal ? "none" : "block";
}

async function teamLoadMyInnovations_(){
  const token = getToken();
  const r = await apiGet("listMyInnovations", { token });
  const items = (r.ok ? (r.items||[]) : []);

  const sel = qs("#innovationId");
  if (!sel) return;

  sel.innerHTML = "";
  for (const it of items){
    const opt = document.createElement("option");
    opt.value = String(it.innovationId||"").trim();
    opt.textContent = `${it.tajuk || "(no title)"} (${it.tahun || ""})`;
    sel.appendChild(opt);
  }
}

async function teamRefreshList_(){
  const token = getToken();
  const innovationId = String(qs("#innovationId")?.value || "").trim();
  const tb = qs("#teamBody");
  const msg = qs("#teamMsg");
  if (msg) msg.textContent = "";

  if (!innovationId){
    if (tb) tb.innerHTML = `<tr><td colspan="5" class="muted">Sila pilih inovasi.</td></tr>`;
    return;
  }

  const r = await apiGet("listMyTeamMembers", { token, innovationId });
  if (!r.ok){
    if (tb) tb.innerHTML = `<tr><td colspan="5" class="muted">Tak boleh load ahli: ${escapeHtml(r.error||"")}</td></tr>`;
    return;
  }

  const items = r.items || [];
  if (tb) tb.innerHTML = "";

  if (!items.length){
    if (tb) tb.innerHTML = `<tr><td colspan="5" class="muted">Belum ada ahli.</td></tr>`;
    return;
  }

  for (const it of items){
    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(it.memberEmail||"")}</td>
        <td>${escapeHtml(it.memberName||"")}</td>
        <td>${escapeHtml(it.memberDept||"")}</td>
        <td>${escapeHtml(it.role||"member")}</td>
        <td><button class="linkDanger" onclick="teamRemoveMember('${escapeHtml(it.innovationId)}','${escapeHtml(it.memberEmail)}')">Buang</button></td>
      </tr>
    `;
  }
}

async function teamAddMember(e){
  e.preventDefault();

  const token = getToken();
  const innovationId = String(qs("#innovationId")?.value || "").trim();
  const isExternal = !!qs("#isExternal")?.checked;

  let memberEmail = String(qs("#memberEmail")?.value || "").trim().toLowerCase();
  let memberName  = String(qs("#memberName")?.value || "").trim();
  let memberDept  = String(qs("#memberDept")?.value || "").trim();
  let role        = String(qs("#memberRole")?.value || "member").trim();

  // If not external, try parse from staffPick
  if (!isExternal){
    teamApplyStaffPick_();
    memberEmail = String(qs("#memberEmail")?.value || "").trim().toLowerCase();
    memberName  = String(qs("#memberName")?.value || "").trim();
    memberDept  = String(qs("#memberDept")?.value || "").trim();
  }

  const msg = qs("#teamMsg");
  if (msg) msg.textContent = "Saving…";

  const r = await apiPost("addTeamMember", { token }, {
    innovationId,
    memberEmail,
    memberName,
    memberDept,
    role
  });

  if (!r.ok){
    if (msg) msg.textContent = "Gagal: " + (r.error || "");
    return;
  }

  if (msg) msg.textContent = "Berjaya tambah ahli ✅";

  // clear fields
  if (qs("#staffPick")) qs("#staffPick").value = "";
  if (qs("#memberEmail")) qs("#memberEmail").value = "";
  if (qs("#memberName")) qs("#memberName").value = "";
  if (qs("#memberDept")) qs("#memberDept").value = "";
  if (qs("#isExternal")) qs("#isExternal").checked = false;
  teamToggleExternal_(false);

  await teamRefreshList_();
}

async function teamRemoveMember(innovationId, memberEmail){
  if (!confirm("Buang ahli ini?")) return;

  const token = getToken();
  const msg = qs("#teamMsg");
  if (msg) msg.textContent = "Deleting…";

  const r = await apiPost("removeTeamMember", { token }, { innovationId, memberEmail });
  if (!r.ok){
    if (msg) msg.textContent = "Gagal buang: " + (r.error || "");
    return;
  }
  if (msg) msg.textContent = "Berjaya buang ✅";
  await teamRefreshList_();
}

/* =========================
   util
========================= */
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
