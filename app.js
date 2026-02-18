/* app.js - Rekod Inovasi Jabatan (Corporate minimal + soft pastel) */

const C = window.APP_CONFIG;

function $(q, root=document){ return root.querySelector(q); }
function $all(q, root=document){ return [...root.querySelectorAll(q)]; }

function setSession({ email, token, role }) {
  localStorage.setItem(C.STORAGE_EMAIL, email || "");
  localStorage.setItem(C.STORAGE_TOKEN, token || "");
  localStorage.setItem(C.STORAGE_ROLE, role || "user");
}
function clearSession() {
  localStorage.removeItem(C.STORAGE_EMAIL);
  localStorage.removeItem(C.STORAGE_TOKEN);
  localStorage.removeItem(C.STORAGE_ROLE);
}
function getEmail(){ return localStorage.getItem(C.STORAGE_EMAIL) || ""; }
function getToken(){ return localStorage.getItem(C.STORAGE_TOKEN) || ""; }
function getRole(){ return localStorage.getItem(C.STORAGE_ROLE) || "user"; }

function decodeJwt(jwt) {
  try {
    const part = jwt.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent([...json].map(c => "%" + c.charCodeAt(0).toString(16).padStart(2,"0")).join("")));
  } catch (e) { return null; }
}

async function apiGet(params) {
  const url = new URL(C.BASE_URL);
  Object.entries(params || {}).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { method: "GET" });
  return await r.json();
}

async function apiPost(params, bodyObj={}) {
  const url = new URL(C.BASE_URL);
  Object.entries(params || {}).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  return await r.json();
}

// ---------- UI helpers ----------
function toast(msg, type="info") {
  const box = $("#toast");
  if (!box) { alert(msg); return; }
  box.className = "fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm transition opacity-100";
  box.classList.add(type === "error" ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-50 text-slate-700 border border-slate-200");
  box.textContent = msg;
  box.style.opacity = "1";
  setTimeout(() => { box.style.opacity = "0"; }, 2200);
}

function requireAuth() {
  const t = getToken();
  const e = getEmail();
  if (!t || !e) {
    location.href = "./index.html";
    return false;
  }
  return true;
}

function setTopBar() {
  const email = getEmail();
  const role = getRole();
  const elEmail = $("#topEmail");
  const elRole = $("#topRole");
  if (elEmail) elEmail.textContent = email || "-";
  if (elRole) elRole.textContent = role || "user";
}

function safeText(s){ return (s ?? "").toString(); }
function esc(s){ return safeText(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// ---------- Google OAuth (GIS) ----------
function initGoogleLogin() {
  const btn = $("#googleBtn");
  const status = $("#loginStatus");
  if (!btn) return;

  // Load GIS
  if (!window.google || !google.accounts || !google.accounts.id) {
    status && (status.textContent = "Loading Google sign-in...");
    return;
  }

  google.accounts.id.initialize({
    client_id: C.CLIENT_ID,
    callback: async (resp) => {
      try {
        status && (status.textContent = "Signing in...");
        const payload = decodeJwt(resp.credential);
        const email = payload?.email || "";
        if (!email) throw new Error("Tak dapat email dari Google.");

        // domain gate
        if (!email.toLowerCase().endsWith("@" + C.ALLOWED_DOMAIN)) {
          throw new Error(`Akaun mesti @${C.ALLOWED_DOMAIN}`);
        }

        // Call backend login
        // Backend kau sekarang nampak guna action=login dan semak Users sheet.
        // Kita hantar email + idToken (backend boleh ignore / guna kemudian).
        const r = await apiGet({ action: "login", email, idToken: resp.credential });

        if (!r?.ok) throw new Error(r?.error || "Login gagal.");

        setSession({ email, token: r.token, role: r.role || "user" });
        status && (status.textContent = "OK. Redirect...");
        location.href = "./dashboard.html";
      } catch (e) {
        console.error(e);
        status && (status.textContent = "Login failed.");
        toast(e.message || "Login gagal.", "error");
      }
    }
  });

  // Render button (corporate minimal)
  btn.innerHTML = "";
  google.accounts.id.renderButton(btn, {
    theme: "outline",
    size: "large",
    shape: "pill",
    width: 280
  });

  status && (status.textContent = "Sila login guna akaun rasmi.");
}

// ---------- Dashboard ----------
function calcStats(items) {
  const total = items.length;
  const years = new Set(items.map(x => x.tahun).filter(Boolean));
  const aktif = items.filter(x => (x.status || "").toLowerCase() === "aktif").length;
  const myipoYes = items.filter(x => (x.myipoStatus || "").toLowerCase() === "yes").length;
  return { total, years: years.size, aktif, myipoYes };
}

function badgeStatus(status) {
  const s = (status || "").toLowerCase();
  if (s === "aktif") return `<span class="px-2 py-1 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">aktif</span>`;
  if (s === "arkib") return `<span class="px-2 py-1 text-xs rounded-full bg-slate-50 text-slate-700 border border-slate-200">arkib</span>`;
  return `<span class="px-2 py-1 text-xs rounded-full bg-amber-50 text-amber-700 border border-amber-200">${esc(status || "pending")}</span>`;
}

function renderTable(items) {
  const tbody = $("#tblBody");
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-slate-500">
      Belum ada rekod inovasi. Klik <b>+ Tambah Inovasi</b> untuk mula.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(it => {
    const id = esc(it.innovationId || "");
    const tajuk = esc(it.tajuk || "-");
    const tahun = esc(it.tahun || "-");
    const kategori = esc(it.kategori || "-");
    const status = badgeStatus(it.status || "-");
    const myipo = esc((it.myipoStatus || "-") + (it.myipoNumber ? " / " + it.myipoNumber : ""));
    return `
      <tr class="border-t hover:bg-slate-50/60 transition">
        <td class="py-3 px-4 font-medium text-slate-800">${tajuk}</td>
        <td class="py-3 px-4 text-slate-700">${tahun}</td>
        <td class="py-3 px-4 text-slate-700">${kategori}</td>
        <td class="py-3 px-4">${status}</td>
        <td class="py-3 px-4 text-slate-700">${myipo}</td>
        <td class="py-3 px-4">
          <span class="inline-flex items-center gap-2">
            <span class="px-2 py-1 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-700">${id.slice(0,10)}…</span>
            <button class="text-xs text-indigo-600 hover:underline" data-copy="${id}">Copy</button>
          </span>
        </td>
      </tr>
    `;
  }).join("");

  $all("[data-copy]").forEach(b => {
    b.addEventListener("click", async () => {
      const v = b.getAttribute("data-copy") || "";
      await navigator.clipboard.writeText(v);
      toast("ID disalin.", "success");
    });
  });
}

async function loadDashboard() {
  if (!requireAuth()) return;
  setTopBar();

  const out = $("#debugJson");
  const btnList = $("#btnList");
  const btnRefresh = $("#btnRefresh");
  const btnPrint = $("#btnPrint");
  const btnAdd = $("#btnAdd");
  const btnLogout = $("#btnLogout");
  const yearSelect = $("#reportYear");

  btnLogout?.addEventListener("click", () => { clearSession(); location.href="./index.html"; });
  btnAdd?.addEventListener("click", () => location.href="./add-innovation.html");

  const fetchList = async () => {
    $("#loadingBar")?.classList.remove("hidden");
    try {
      const r = await apiGet({ action: "listMyInnovations", appToken: getToken() });
      if (!r?.ok) throw new Error(r?.error || "Tak boleh load inovasi.");

      const items = r.data || [];
      const stats = calcStats(items);

      $("#statTotal").textContent = stats.total;
      $("#statYears").textContent = stats.years;
      $("#statAktif").textContent = stats.aktif;
      $("#statMyipo").textContent = stats.myipoYes;

      renderTable(items);

      if (out) out.textContent = JSON.stringify(r, null, 2);

      // Report
      const year = parseInt(yearSelect?.value || "2026", 10);
      renderReport(items, year);

      return items;
    } finally {
      $("#loadingBar")?.classList.add("hidden");
    }
  };

  let cached = await fetchList();

  btnList?.addEventListener("click", async () => { cached = await fetchList(); toast("Senarai dikemaskini.", "success"); });
  btnRefresh?.addEventListener("click", async () => { cached = await fetchList(); toast("Refresh OK.", "success"); });

  yearSelect?.addEventListener("change", () => {
    const y = parseInt(yearSelect.value || "2026", 10);
    renderReport(cached || [], y);
  });

  btnPrint?.addEventListener("click", () => {
    // print only report section
    window.print();
  });
}

function renderReport(items, year=2026) {
  const el = $("#reportArea");
  if (!el) return;

  const list = (items || []).filter(x => parseInt(x.tahun || 0, 10) === year);

  const total = list.length;
  const aktif = list.filter(x => (x.status || "").toLowerCase() === "aktif").length;
  const myipoYes = list.filter(x => (x.myipoStatus || "").toLowerCase() === "yes").length;
  const myipoNo = total - myipoYes;

  const rows = list.length
    ? list.map(x => `
      <tr class="border-t">
        <td class="py-2 px-3 font-medium">${esc(x.tajuk||"-")}</td>
        <td class="py-2 px-3">${esc(x.kategori||"-")}</td>
        <td class="py-2 px-3">${badgeStatus(x.status||"-")}</td>
        <td class="py-2 px-3">${esc((x.myipoStatus||"-") + (x.myipoNumber ? " / "+x.myipoNumber : ""))}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="p-4 text-slate-500">Tiada rekod untuk tahun ${year}.</td></tr>`;

  const now = new Date();
  const printedAt = now.toLocaleString("ms-MY");

  el.innerHTML = `
    <div class="printable rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-bold text-slate-900">Report Inovasi ${year}</h2>
          <p class="text-sm text-slate-500">Ringkasan berdasarkan rekod yang didaftarkan oleh pengguna ini.</p>
        </div>
        <div class="text-right text-xs text-slate-500">
          Dicetak: ${esc(printedAt)}
        </div>
      </div>

      <div class="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        ${kpiCard("Jumlah Inovasi", total)}
        ${kpiCard("Status Aktif", aktif)}
        ${kpiCard("MyIPO Yes", myipoYes)}
        ${kpiCard("MyIPO No", myipoNo)}
      </div>

      <div class="mt-6 overflow-hidden rounded-xl border border-slate-200">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600">
            <tr>
              <th class="text-left py-2 px-3">Tajuk</th>
              <th class="text-left py-2 px-3">Kategori</th>
              <th class="text-left py-2 px-3">Status</th>
              <th class="text-left py-2 px-3">MyIPO</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <p class="mt-4 text-xs text-slate-500">
        Nota: Report ini memaparkan inovasi tahun ${year} berdasarkan rekod yang didaftarkan oleh ahli kumpulan / ketua kumpulan.
      </p>
    </div>
  `;
}

function kpiCard(label, value) {
  return `
    <div class="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
      <div class="text-xs text-slate-500">${esc(label)}</div>
      <div class="text-2xl font-extrabold text-slate-900 mt-1">${esc(value)}</div>
    </div>
  `;
}

// ---------- Add Innovation ----------
async function initAddInnovation() {
  if (!requireAuth()) return;
  setTopBar();

  $("#btnLogout")?.addEventListener("click", () => { clearSession(); location.href="./index.html"; });
  $("#btnBack")?.addEventListener("click", () => location.href="./dashboard.html");

  const f = $("#formAdd");
  f?.addEventListener("submit", async (ev) => {
    ev.preventDefault();

    const payload = {
      tajuk: $("#tajuk").value.trim(),
      tahun: parseInt($("#tahun").value || "2026", 10),
      kategori: $("#kategori").value,
      status: $("#status").value,
      myipoStatus: $("#myipoStatus").value,
      myipoNumber: $("#myipoNumber").value.trim(),
    };

    if (!payload.tajuk) return toast("Tajuk wajib isi.", "error");

    $("#btnSubmit").disabled = true;
    try {
      // IMPORTANT: action name mungkin backend kau = createInnovation / addInnovation.
      // Aku letak createInnovation. Kalau backend kau guna nama lain,
      // tukar DI SINI sahaja.
      const r = await apiPost({ action: "createInnovation", appToken: getToken() }, payload);
      if (!r?.ok) throw new Error(r?.error || "Gagal simpan.");

      toast("Rekod inovasi disimpan.", "success");
      setTimeout(() => location.href="./dashboard.html", 600);
    } catch (e) {
      console.error(e);
      toast(e.message || "Error simpan.", "error");
    } finally {
      $("#btnSubmit").disabled = false;
    }
  });
}

// ---------- Page bootstrap ----------
window.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  if (page === "login") initGoogleLogin();
  if (page === "dashboard") loadDashboard();
  if (page === "add") initAddInnovation();
});
