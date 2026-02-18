// ---------- Storage helpers ----------
function setSession(email, role, token) {
  localStorage.setItem(window.APP_CONFIG.STORAGE_EMAIL, email);
  localStorage.setItem(window.APP_CONFIG.STORAGE_ROLE, role || "user");
  localStorage.setItem(window.APP_CONFIG.STORAGE_TOKEN, token);
}

function clearSession() {
  localStorage.removeItem(window.APP_CONFIG.STORAGE_EMAIL);
  localStorage.removeItem(window.APP_CONFIG.STORAGE_ROLE);
  localStorage.removeItem(window.APP_CONFIG.STORAGE_TOKEN);
}

function getToken() {
  return localStorage.getItem(window.APP_CONFIG.STORAGE_TOKEN) || "";
}
function getEmail() {
  return localStorage.getItem(window.APP_CONFIG.STORAGE_EMAIL) || "";
}
function getRole() {
  return localStorage.getItem(window.APP_CONFIG.STORAGE_ROLE) || "user";
}

// ---------- API ----------
async function apiGet(params) {
  const url = new URL(window.APP_CONFIG.BASE_URL);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { method: "GET" });
  return r.json();
}

async function apiPost(action, body) {
  const url = new URL(window.APP_CONFIG.BASE_URL);
  url.searchParams.set("action", action);
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return r.json();
}

// ---------- UI utilities ----------
function qs(sel) { return document.querySelector(sel); }

function toast(msg, type="info") {
  const el = qs("#toast");
  if (!el) { alert(msg); return; }
  el.classList.remove("hidden");
  el.dataset.type = type;
  el.querySelector("[data-toast-text]").textContent = msg;

  el.classList.remove("border-red-200","bg-red-50","text-red-800","border-emerald-200","bg-emerald-50","text-emerald-800","border-slate-200","bg-white","text-slate-800");
  if (type === "error") el.classList.add("border-red-200","bg-red-50","text-red-800");
  else if (type === "success") el.classList.add("border-emerald-200","bg-emerald-50","text-emerald-800");
  else el.classList.add("border-slate-200","bg-white","text-slate-800");

  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => el.classList.add("hidden"), 2500);
}

function requireAuthOrRedirect() {
  if (!getToken() || !getEmail()) {
    location.href = "./index.html";
    return false;
  }
  return true;
}

function prettyJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

// ---------- Theme (corporate + soft pastel) ----------
function applyThemeBase() {
  document.documentElement.classList.add("bg-[#fbfbfe]");
}

// ---------- Dashboard rendering ----------
function badgeStatus(status) {
  const s = (status || "").toLowerCase();
  if (s === "aktif") return `<span class="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs">aktif</span>`;
  if (s === "arkib") return `<span class="inline-flex items-center rounded-full bg-slate-50 text-slate-700 border border-slate-200 px-2 py-0.5 text-xs">arkib</span>`;
  return `<span class="inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-xs">${status || "—"}</span>`;
}

function badgeMyipo(myipoStatus, myipoNumber) {
  const v = (myipoStatus || "").toLowerCase();
  if (v === "yes") {
    return `<span class="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-xs">yes / ${escapeHtml_(myipoNumber || "")}</span>`;
  }
  return `<span class="inline-flex items-center rounded-full bg-slate-50 text-slate-700 border border-slate-200 px-2 py-0.5 text-xs">no</span>`;
}

function escapeHtml_(s) {
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function loadInnovationsAndRender() {
  const email = getEmail();
  const role = getRole();
  const token = getToken();

  qs("[data-email]").textContent = email;
  qs("[data-role]").textContent = role;

  // skeleton
  qs("#tableBody").innerHTML = `<tr><td colspan="6" class="py-6 text-sm text-slate-500">Loading…</td></tr>`;
  qs("#debugJson").textContent = "";

  const res = await apiGet({ action: "listMyInnovations", token });
  if (!res.ok) {
    toast(res.error || "Gagal load data", "error");
    return;
  }

  const data = res.data || [];
  renderKpis_(data);
  renderTable_(data);
  qs("#debugJson").textContent = prettyJSON(res);

  toast("Data siap dimuat", "success");
}

function renderKpis_(data) {
  const total = data.length;
  const years = new Set(data.map(x => x.tahun)).size;
  const aktif = data.filter(x => String(x.status || "").toLowerCase() === "aktif").length;
  const myipoYes = data.filter(x => String(x.myipoStatus || "").toLowerCase() === "yes").length;

  qs("[data-kpi-total]").textContent = total;
  qs("[data-kpi-years]").textContent = years;
  qs("[data-kpi-aktif]").textContent = aktif;
  qs("[data-kpi-myipo]").textContent = myipoYes;
}

function renderTable_(data) {
  if (!data.length) {
    qs("#tableBody").innerHTML = `
      <tr>
        <td colspan="6" class="py-10">
          <div class="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
            <div class="text-base font-semibold text-slate-800">Belum ada rekod inovasi</div>
            <div class="mt-1 text-sm text-slate-500">Klik “Tambah Inovasi” untuk mula isi.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  qs("#tableBody").innerHTML = data.map(x => `
    <tr class="hover:bg-indigo-50/30">
      <td class="px-4 py-3 font-medium text-slate-800">${escapeHtml_(x.tajuk)}</td>
      <td class="px-4 py-3 text-slate-700">${x.tahun || ""}</td>
      <td class="px-4 py-3 text-slate-700">${escapeHtml_(x.kategori)}</td>
      <td class="px-4 py-3">${badgeStatus(x.status)}</td>
      <td class="px-4 py-3">${badgeMyipo(x.myipoStatus, x.myipoNumber)}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">${escapeHtml_(x.innovationId.slice(0,10))}…</span>
          <button class="text-xs text-indigo-700 hover:underline" onclick="copyText('${escapeHtml_(x.innovationId)}')">Copy</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast("ID copied", "success")).catch(() => toast("Tak boleh copy", "error"));
}

// ---------- Report / Print ----------
async function generateReport2026() {
  const token = getToken();
  const res = await apiGet({ action: "report2026", token });
  if (!res.ok) return toast(res.error || "Report gagal", "error");

  const el = qs("#reportArea");
  el.classList.remove("hidden");
  el.innerHTML = buildReportHtml_(res);

  // auto open print dialog (user-friendly)
  setTimeout(() => window.print(), 250);
}

function buildReportHtml_(r) {
  const s = r.summary || {};
  const items = r.items || [];
  const now = new Date().toLocaleString("ms-MY");

  const rows = items.length ? items.map(it => `
    <tr>
      <td class="py-2 pr-4">${escapeHtml_(it.tajuk)}</td>
      <td class="py-2 pr-4">${escapeHtml_(it.kategori)}</td>
      <td class="py-2 pr-4">${escapeHtml_(it.status)}</td>
      <td class="py-2 pr-4">${escapeHtml_(it.myipo)}</td>
    </tr>
  `).join("") : `<tr><td class="py-3 text-slate-500" colspan="4">Tiada rekod tahun 2026.</td></tr>`;

  return `
  <div class="mx-auto max-w-[900px] rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <div class="flex items-start justify-between gap-6">
      <div>
        <div class="text-xl font-bold text-slate-900">Pencapaian Inovasi Jabatan ${r.year}</div>
        <div class="mt-1 text-sm text-slate-500">Ringkasan penyertaan & status inovasi (berdasarkan rekod dalam sistem)</div>
      </div>
      <div class="text-right text-xs text-slate-500">
        <div>${escapeHtml_(r.email)}</div>
        <div>Dicetak: ${escapeHtml_(now)}</div>
      </div>
    </div>

    <div class="mt-6 grid grid-cols-4 gap-3">
      ${reportCard_("Jumlah Inovasi (2026)", s.total)}
      ${reportCard_("Status Aktif", s.aktif)}
      ${reportCard_("MyIPO Yes", s.myipoYes)}
      ${reportCard_("MyIPO No", s.myipoNo)}
    </div>

    <div class="mt-7">
      <div class="text-sm font-semibold text-slate-800">Senarai Inovasi (2026)</div>
      <div class="mt-2 overflow-hidden rounded-xl border border-slate-200">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600">
            <tr>
              <th class="py-2 px-4 text-left font-medium">Tajuk</th>
              <th class="py-2 px-4 text-left font-medium">Kategori</th>
              <th class="py-2 px-4 text-left font-medium">Status</th>
              <th class="py-2 px-4 text-left font-medium">MyIPO</th>
            </tr>
          </thead>
          <tbody class="px-4">
            ${rows.replaceAll("<td", "<td class=\"px-4\"")}
          </tbody>
        </table>
      </div>
      <div class="mt-4 text-xs text-slate-500">
        Nota: Report ini memaparkan inovasi tahun 2026 berdasarkan rekod yang didaftarkan oleh ahli kumpulan / ketua kumpulan.
      </div>
    </div>

    <div class="mt-8 text-xs text-slate-400">© 2026 kurakurahijau.com</div>
  </div>
  `;
}

function reportCard_(label, value) {
  return `
    <div class="rounded-2xl border border-slate-200 bg-[#fbfbfe] p-4">
      <div class="text-xs text-slate-500">${escapeHtml_(label)}</div>
      <div class="mt-1 text-2xl font-bold text-slate-900">${Number(value || 0)}</div>
    </div>
  `;
}
