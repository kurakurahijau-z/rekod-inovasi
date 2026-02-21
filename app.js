/* ======================================================
 * Rekod Inovasi Jabatan — FRONTEND app.js (GitHub Pages)
 * - Calls Google Apps Script API (window.APP_CONFIG.API_BASE)
 * - Stores session token in localStorage
 * ====================================================== */

const API = () => String(window.APP_CONFIG?.API_BASE || "").trim();
const ALLOWED_DOMAIN = () => String(window.APP_CONFIG?.ALLOWED_DOMAIN || "").trim().toLowerCase();

/* ---------------------------
   Token helpers
--------------------------- */
function getToken() { return localStorage.getItem("token") || ""; }
function setToken(t) { if (!t) localStorage.removeItem("token"); else localStorage.setItem("token", t); }
function doLogout() { setToken(""); location.href = "./index.html"; }

/* ---------------------------
   API helpers
--------------------------- */
async function apiGet(action, params = {}) {
  const base = API();
  if (!base) throw new Error("API_BASE kosong dalam config.js");

  const url = new URL(base);
  url.searchParams.set("action", action);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), { method: "GET" });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error("API bukan JSON: " + text.slice(0, 200)); }
  return json;
}

// NOTE: keep as JSON POST for now (we'll harden later if needed)
async function apiPostWithToken(action, token, body) {
  const base = API();
  if (!base) throw new Error("API_BASE kosong dalam config.js");

  const url = new URL(base);
  url.searchParams.set("action", action);
  url.searchParams.set("token", String(token || ""));

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error("API bukan JSON: " + text.slice(0, 200)); }
  return json;
}

/* ---------------------------
   Auth guard
--------------------------- */
async function requireMeOrRedirect() {
  const token = getToken();
  if (!token) { location.href = "./index.html"; return null; }

  const me = await apiGet("me", { token });
  if (!me.ok) { setToken(""); location.href = "./index.html"; return null; }
  return me;
}

/* ---------------------------
   Small utils
--------------------------- */
function val(id) { const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ""; }
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = String(v ?? ""); }

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escAttr(s) { return esc(s).replaceAll("\n", " "); }

// helper: robust email normalize
function normEmail_(s) {
  // sometimes backend might return something unexpected -> we normalize hard
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "")
    .replace(/\s+/g, ""); // remove spaces
}

/* ======================================================
   GOOGLE LOGIN CALLBACK (index.html)
====================================================== */
async function onGoogleCredentialResponse(resp) {
  const statusEl = document.getElementById("loginStatus");
  const setStatus = (msg, isError = true) => {
    if (!statusEl) return;
    statusEl.style.color = isError ? "#b91c1c" : "#166534";
    statusEl.textContent = msg || "";
  };

  try {
    setStatus("Logging in…", false);

    const credential = resp && resp.credential ? resp.credential : "";
    if (!credential) throw new Error("Google credential kosong");

    const out = await apiGet("loginGoogle", { credential });
    if (!out.ok) { setStatus(out.error || "Login gagal", true); return; }

    // robust email handling
    const email = normEmail_(out.email || "");
    const allowed = ALLOWED_DOMAIN();

    if (!email) {
      setStatus("Login gagal: email kosong dari server", true);
      console.error("loginGoogle response:", out);
      return;
    }

    if (allowed) {
      const suffix = "@" + allowed;
      if (!email.endsWith(suffix)) {
        // show debug hint (still user-friendly)
        setStatus(`Email bukan domain ${suffix}. (server email: ${email})`, true);
        console.error("Domain check failed. out=", out);
        return;
      }
    }

    setToken(out.token || "");
    setStatus("Login berjaya. Redirecting…", false);
    location.href = "./dashboard.html";
  } catch (err) {
    setStatus(String(err?.message || err), true);
    console.error(err);
  }
}

/* ======================================================
   DASHBOARD (dashboard.html)
====================================================== */
async function dashboardInit() {
  try {
    const me = await requireMeOrRedirect();
    if (!me) return;

    setText("meEmail", me.email || "-");
    const roleEl = document.getElementById("meRole");
    if (roleEl) roleEl.textContent = me.role || "user";

    await refreshMyInnovations();
  } catch (err) {
    console.error(err);
    alert("Dashboard error: " + String(err?.message || err));
  }
}

async function refreshMyInnovations() {
  const token = getToken();
  const body = document.getElementById("myListBody");
  if (body) body.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;

  const res = await apiGet("listMyInnovations", { token });
  if (!res.ok) throw new Error(res.error || "listMyInnovations fail");

  const items = Array.isArray(res.items) ? res.items : [];

  const years = new Set(items.map(x => String(x.tahun || "").trim()).filter(Boolean));
  const aktif = items.filter(x => String(x.status || "").toLowerCase().includes("aktif")).length;
  const myipoYes = items.filter(x => String(x.myipoStatus || "").toLowerCase().trim() === "yes").length;

  setText("countTotal", items.length);
  setText("countYears", years.size);
  setText("countAktif", aktif);
  setText("countMyipoYes", myipoYes);

  if (!body) return;

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">Tiada inovasi lagi. Klik “Tambah Inovasi”.</td></tr>`;
    return;
  }

  body.innerHTML = items.map(x => `
    <tr>
      <td>${esc(x.tajuk)}</td>
      <td>${esc(x.tahun)}</td>
      <td>${esc(x.kategori)}</td>
      <td>${esc(x.status)}</td>
      <td>${esc(x.myipoStatus)} ${x.myipoNumber ? `<div class="muted">${esc(x.myipoNumber)}</div>` : ""}</td>
      <td><code>${esc(x.innovationId)}</code></td>
    </tr>
  `).join("");
}

async function refreshReport(year) {
  const token = getToken();
  setText("rYear", year);

  const res = await apiGet("generateReport", { token, year });
  if (!res.ok) throw new Error(res.error || "generateReport fail");

  const items = Array.isArray(res.items) ? res.items : [];

  const aktif = items.filter(x => String(x.status || "").toLowerCase().includes("aktif")).length;
  const myipoYes = items.filter(x => String(x.myipoStatus || "").toLowerCase().trim() === "yes").length;
  const myipoNo = items.filter(x => String(x.myipoStatus || "").toLowerCase().trim() === "no").length;

  setText("rTotal", items.length);
  setText("rAktif", aktif);
  setText("rMyipoYes", myipoYes);
  setText("rMyipoNo", myipoNo);

  const tbody = document.getElementById("reportBody");
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Tiada data untuk ${esc(year)}.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(x => `
    <tr>
      <td>${esc(x.tajuk)}</td>
      <td>${esc(x.kategori)}</td>
      <td>${esc(x.status)}</td>
      <td>${esc(x.myipoStatus)} ${x.myipoNumber ? `<div class="muted">${esc(x.myipoNumber)}</div>` : ""}</td>
    </tr>
  `).join("");
}

async function refreshCompetitionReport(year) {
  const token = getToken();
  const msg = document.getElementById("cMsg");
  if (msg) msg.textContent = "Loading…";

  const res = await apiGet("generateCompetitionReport", { token, year });
  if (!res.ok) throw new Error(res.error || "generateCompetitionReport fail");

  const summary = res.summary || {};
  const items = Array.isArray(res.items) ? res.items : [];

  setText("cTotal", summary.totalPenyertaan ?? items.length ?? 0);
  setText("cAK", summary.anugerahKhas ?? 0);
  setText("cGold", (summary.medals && summary.medals.Gold) ? summary.medals.Gold : 0);
  setText("cIntl", (summary.peringkat && summary.peringkat.Antarabangsa) ? summary.peringkat.Antarabangsa : 0);

  if (msg) msg.textContent = items.length ? `Jumpa ${items.length} rekod untuk ${year}.` : `Tiada rekod untuk ${year}.`;

  const tbody = document.getElementById("compBody");
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Tiada data untuk ${esc(year)}.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(x => `
    <tr>
      <td>${esc(x.tajuk)}</td>
      <td>${esc(x.namaEvent)}</td>
      <td>${esc(x.peringkat)}</td>
      <td>${esc(x.pingat)}</td>
      <td>${esc(x.anugerahKhas)} ${x.namaAnugerahKhas ? `<div class="muted">${esc(x.namaAnugerahKhas)}</div>` : ""}</td>
      <td><code>${esc(x.innovationId)}</code></td>
    </tr>
  `).join("");
}

function doPrint(){ window.print(); }

/* ======================================================
   ADD INNOVATION (add-innovation.html)
====================================================== */
async function addInnovationInit() {
  const me = await requireMeOrRedirect();
  if (!me) return;
  setText("meEmail", me.email || "-");
}

async function submitInnovation(ev) {
  ev.preventDefault();
  const token = getToken();

  const payload = {
    tajuk: val("tajuk"),
    tahun: val("tahun"),
    kategori: val("kategori"),
    status: val("status"),
    myipoStatus: val("myipoStatus"),
    myipoNumber: val("myipoNumber"),
  };

  const msg = document.getElementById("saveMsg");
  if (msg) msg.textContent = "Saving…";

  const res = await apiPostWithToken("addInnovation", token, payload);
  if (!res.ok) {
    if (msg) msg.textContent = res.error || "Gagal simpan inovasi";
    return;
  }

  if (msg) msg.textContent = "Berjaya simpan. Redirect ke dashboard…";
  setTimeout(() => location.href = "./dashboard.html", 600);
}

/* ======================================================
   TEAM (team.html)
====================================================== */
let STAFF_CACHE = [];

async function teamInit() {
  const me = await requireMeOrRedirect();
  if (!me) return;
  setText("meEmail", me.email || "-");

  const token = getToken();
  const invRes = await apiGet("listMyInnovations", { token });
  if (!invRes.ok) throw new Error(invRes.error || "listMyInnovations fail");
  const items = Array.isArray(invRes.items) ? invRes.items : [];

  const sel = document.getElementById("innovationId");
  if (sel) {
    sel.innerHTML = items.length
      ? items.map(x => `<option value="${escAttr(x.innovationId)}">${esc(x.tajuk)} (${esc(x.tahun)})</option>`).join("")
      : `<option value="">Tiada inovasi</option>`;
  }

  const chk = document.getElementById("isExternal");
  if (chk) chk.addEventListener("change", toggleExternalMode);

  await loadStaffDirectory();

  const pick = document.getElementById("staffPick");
  if (pick) {
    pick.addEventListener("input", () => {
      const v = String(pick.value || "");
      const parts = v.split("|").map(s => s.trim());
      if (parts.length >= 2) {
        setVal("memberName", parts[0]);
        setVal("memberEmail", parts[1]);
        if (parts[2]) setVal("memberDept", parts[2]);
      }
    });
  }

  await teamRefresh();
  if (sel) sel.addEventListener("change", teamRefresh);
}

function toggleExternalMode() {
  const isExt = !!document.getElementById("isExternal")?.checked;
  const d = document.getElementById("directoryBox");
  const e = document.getElementById("externalBox");
  if (d) d.style.display = isExt ? "none" : "";
  if (e) e.style.display = isExt ? "" : "none";
}

async function loadStaffDirectory() {
  const token = getToken();
  const res = await apiGet("listStaffDirectory", { token });
  if (!res.ok) throw new Error(res.error || "listStaffDirectory fail");

  STAFF_CACHE = Array.isArray(res.items) ? res.items : [];
  const dl = document.getElementById("staffList");
  if (!dl) return;

  dl.innerHTML = STAFF_CACHE.map(x => {
    const dept = (x.jabatan || x.unit || "").trim();
    const label = dept ? `${x.nama} | ${x.email} | ${dept}` : `${x.nama} | ${x.email}`;
    return `<option value="${escAttr(label)}"></option>`;
  }).join("");
}

async function teamRefresh() {
  const token = getToken();
  const invId = val("innovationId");
  const tbody = document.getElementById("teamBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="muted">Loading…</td></tr>`;

  const res = await apiGet("listMyTeamMembers", { token, innovationId: invId });
  if (!res.ok) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="muted">${esc(res.error || "Tak boleh load team")}</td></tr>`;
    return;
  }

  const items = Array.isArray(res.items) ? res.items : [];
  if (!items.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="muted">Tiada ahli lagi.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = items.map(x => `
      <tr>
        <td>${esc(x.memberEmail)}</td>
        <td>${esc(x.memberName)}</td>
        <td>${esc(x.memberDept)}</td>
        <td>${esc(x.role)}</td>
        <td><button class="linkDanger" onclick="teamRemove('${escAttr(invId)}','${escAttr(x.memberEmail)}')">Buang</button></td>
      </tr>
    `).join("");
  }
}

async function teamAddMember(ev) {
  if (ev) ev.preventDefault();
  const token = getToken();

  const payload = {
    innovationId: val("innovationId"),
    memberEmail: val("memberEmail"),
    memberName: val("memberName"),
    memberDept: val("memberDept"),
    role: val("memberRole"),
  };

  const msg = document.getElementById("teamMsg");
  if (msg) msg.textContent = "Saving…";

  const res = await apiPostWithToken("addTeamMember", token, payload);
  if (!res.ok) {
    if (msg) msg.textContent = res.error || "Gagal tambah ahli";
    return;
  }

  if (msg) msg.textContent = "Berjaya tambah ahli.";
  setVal("staffPick", "");
  await teamRefresh();
}

async function teamRemove(innovationId, memberEmail) {
  if (!confirm("Buang ahli ini?")) return;
  const token = getToken();

  const res = await apiGet("removeTeamMember", { token, innovationId, memberEmail });
  if (!res.ok) { alert(res.error || "Gagal buang ahli"); return; }
  await teamRefresh();
}

/* ======================================================
   ADD COMPETITION (add-competition.html)
====================================================== */
async function addCompetitionInit() {
  const me = await requireMeOrRedirect();
  if (!me) return;
  setText("meEmail", me.email || "-");

  const token = getToken();
  const invRes = await apiGet("listMyInnovations", { token });
  if (!invRes.ok) throw new Error(invRes.error || "listMyInnovations fail");
  const items = Array.isArray(invRes.items) ? invRes.items : [];

  const sel = document.getElementById("innovationId");
  if (sel) {
    sel.innerHTML = items.length
      ? `<option value="">-- pilih --</option>` + items.map(x => `<option value="${escAttr(x.innovationId)}">${esc(x.tajuk)} (${esc(x.tahun)})</option>`).join("")
      : `<option value="">Tiada inovasi</option>`;
  }

  const ak = document.getElementById("anugerahKhas");
  if (ak) ak.addEventListener("change", () => {
    const box = document.getElementById("anugerahKhasBox");
    if (!box) return;
    box.style.display = (String(ak.value) === "yes") ? "" : "none";
  });
}

async function submitCompetition(ev) {
  ev.preventDefault();
  const token = getToken();

  const payload = {
    innovationId: val("innovationId"),
    namaEvent: val("namaEvent"),
    tahun: val("tahun"),
    peringkat: val("peringkat"),
    pingat: val("pingat"),
    anugerahKhas: val("anugerahKhas"),
    namaAnugerahKhas: val("namaAnugerahKhas"),
  };

  const msg = document.getElementById("saveMsg");
  if (msg) msg.textContent = "Saving…";

  const res = await apiPostWithToken("addCompetition", token, payload);
  if (!res.ok) {
    if (msg) msg.textContent = res.error || "Gagal simpan penyertaan";
    return;
  }

  if (msg) msg.textContent = "Berjaya simpan.";
}
