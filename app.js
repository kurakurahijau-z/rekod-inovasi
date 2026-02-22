(() => {
  const CFG = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const state = {
    token: localStorage.getItem("ri_token") || "",
    email: localStorage.getItem("ri_email") || "",
    role: localStorage.getItem("ri_role") || "",
    selectedInnovationId: localStorage.getItem("ri_selectedInnovationId") || "",
    selectedInnovationTitle: localStorage.getItem("ri_selectedInnovationTitle") || "",
    staffCache: new Map(),
  };

  const ui = {
    loginCard: $("loginCard"),
    loginMsg: $("loginMsg"),
    app: $("app"),
    userBox: $("userBox"),
    userEmail: $("userEmail"),
    userRole: $("userRole"),
    btnLogout: $("btnLogout"),
    selectedInnovationLabel: $("selectedInnovationLabel"),
    topMsg: $("topMsg"),
    yearNow: $("yearNow"),
    yearNow2: $("yearNow2"),

    dashYear: $("dashYear"),
    dashYearSelect: $("dashYearSelect"),
    btnDashRefresh: $("btnDashRefresh"),
    statInnovations: $("statInnovations"),
    statComps: $("statComps"),
    statGold: $("statGold"),
    statSilver: $("statSilver"),
    statBronze: $("statBronze"),
    statPenyertaan: $("statPenyertaan"),
    statPeringkat: $("statPeringkat"),

    btnPdfMine: $("btnPdfMine"),
    btnPdfSingle: $("btnPdfSingle"),
    btnPdfAll: $("btnPdfAll"),

    inovasiList: $("inovasiList"),
    invId: $("invId"),
    invTajuk: $("invTajuk"),
    invTahun: $("invTahun"),
    invKategori: $("invKategori"),
    invStatus: $("invStatus"),
    invMyipoStatus: $("invMyipoStatus"),
    invMyipoNumber: $("invMyipoNumber"),
    btnSaveInv: $("btnSaveInv"),
    btnClearInv: $("btnClearInv"),
    invMsg: $("invMsg"),

    teamList: $("teamList"),
    btnTeamRefresh: $("btnTeamRefresh"),
    teamSearch: $("teamSearch"),
    staffDatalist: $("staffDatalist"),
    teamEmail: $("teamEmail"),
    teamName: $("teamName"),
    teamRole: $("teamRole"),
    btnAddTeam: $("btnAddTeam"),
    teamMsg: $("teamMsg"),

    compList: $("compList"),
    btnCompRefresh: $("btnCompRefresh"),
    compEvent: $("compEvent"),
    compYear: $("compYear"),
    compPeringkat: $("compPeringkat"),
    compPingat: $("compPingat"),
    compAnugerah: $("compAnugerah"),
    compAnugerahName: $("compAnugerahName"),
    btnAddComp: $("btnAddComp"),
    compMsg: $("compMsg"),

    profEmail: $("profEmail"),
    profRole: $("profRole"),
  };

  // ---------------------------
  // Safety check: config
  // ---------------------------
  function assertConfig() {
    if (!CFG.API_BASE || !String(CFG.API_BASE).startsWith("https://script.google.com/macros/s/")) {
      setMsg(ui.loginMsg, "CONFIG salah: API_BASE tak betul. Pastikan guna URL /exec.", false);
      throw new Error("Bad API_BASE");
    }
    if (!CFG.GOOGLE_CLIENT_ID) {
      setMsg(ui.loginMsg, "CONFIG salah: GOOGLE_CLIENT_ID kosong.", false);
      throw new Error("Missing GOOGLE_CLIENT_ID");
    }
  }

  // ---------------------------
  // API helpers
  // ---------------------------
  function apiUrl(action, params = {}) {
    const url = new URL(CFG.API_BASE);
    url.searchParams.set("action", action);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && String(v).length) url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  async function apiGet(action, params = {}) {
    const res = await fetch(apiUrl(action, params), { method: "GET" });
    return res.json();
  }

  async function apiPost(action, params = {}, body = {}) {
    const url = apiUrl(action, params);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body || {})
    });
    return res.json();
  }

  function setMsg(el, msg, ok = true) {
    if (!el) return;
    el.className = "text-sm " + (ok ? "text-emerald-700" : "text-rose-700");
    el.textContent = msg || "";
  }

  function requireInnovation() {
    if (!state.selectedInnovationId) {
      setMsg(ui.topMsg, "Pilih inovasi dulu kat tab Inovasi.", false);
      return false;
    }
    setMsg(ui.topMsg, "");
    return true;
  }

  // ---------------------------
  // Auth / Google Sign-In
  // ---------------------------
  function setupGoogleButton() {
    const onload = $("g_id_onload");
    const signin = $("g_id_signin");
    if (!onload || !signin) return;

    onload.setAttribute("data-client_id", CFG.GOOGLE_CLIENT_ID);
    onload.setAttribute("data-callback", "onGoogleCredential");
    onload.setAttribute("data-auto_prompt", "false");
    if (CFG.ALLOWED_DOMAIN) onload.setAttribute("data-hosted_domain", CFG.ALLOWED_DOMAIN);

    // Render button
    signin.className = "g_id_signin";
    signin.setAttribute("data-type", "standard");
    signin.setAttribute("data-theme", "outline");
    signin.setAttribute("data-size", "large");
    signin.setAttribute("data-text", "signin_with");
    signin.setAttribute("data-shape", "pill");
  }

  window.onGoogleCredential = async (resp) => {
    try {
      setMsg(ui.loginMsg, "Signing in...");
      const credential = resp && resp.credential ? resp.credential : "";
      if (!credential) {
        setMsg(ui.loginMsg, "Google credential kosong. Cuba refresh page.", false);
        return;
      }
      const out = await apiGet("loginGoogle", { credential });
      if (!out.ok) {
        setMsg(ui.loginMsg, out.error || "Login failed", false);
        return;
      }

      state.token = out.token;
      state.email = out.email;
      state.role = out.role || "user";

      localStorage.setItem("ri_token", state.token);
      localStorage.setItem("ri_email", state.email);
      localStorage.setItem("ri_role", state.role);

      await bootApp();
    } catch (e) {
      setMsg(ui.loginMsg, String(e && e.message ? e.message : e), false);
    }
  };

  async function logout() {
    localStorage.removeItem("ri_token");
    localStorage.removeItem("ri_email");
    localStorage.removeItem("ri_role");
    localStorage.removeItem("ri_selectedInnovationId");
    localStorage.removeItem("ri_selectedInnovationTitle");
    location.reload();
  }

  // ---------------------------
  // UI Tabs
  // ---------------------------
  function setTab(tab) {
    document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("bg-slate-900", "text-white"));
    const panel = $("panel-" + tab);
    if (panel) panel.classList.remove("hidden");
    const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
    if (btn) btn.classList.add("bg-slate-900", "text-white");
  }

  // ---------------------------
  // Dashboard
  // ---------------------------
  function initYearSelect() {
    const now = new Date().getFullYear();
    ui.dashYearSelect.innerHTML = "";
    for (let y = now - 2; y <= now + 1; y++) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === now) opt.selected = true;
      ui.dashYearSelect.appendChild(opt);
    }
    ui.dashYear.textContent = String(now);
  }

  async function loadDashboard() {
    const year = ui.dashYearSelect.value;
    ui.dashYear.textContent = year;

    const out = await apiGet("dashboardStats", { token: state.token, year });
    if (!out.ok) return setMsg(ui.topMsg, out.error || "Dashboard error", false);

    const s = out.stats || {};
    ui.statInnovations.textContent = String(s.totalInnovations || 0);
    ui.statComps.textContent = String(s.totalCompetitions || 0);

    const m = s.medalCounts || {};
    ui.statGold.textContent = String(m.GOLD || 0);
    ui.statSilver.textContent = String(m.SILVER || 0);
    ui.statBronze.textContent = String(m.BRONZE || 0);
    ui.statPenyertaan.textContent = String(m.PENYERTAAN || 0);

    ui.statPeringkat.innerHTML = "";
    const pc = s.peringkatCounts || {};
    const keys = Object.keys(pc).sort((a,b)=> (pc[b]-pc[a]));
    if (!keys.length) {
      ui.statPeringkat.innerHTML = `<span class="text-sm text-slate-500">Belum ada rekod pertandingan untuk tahun ini.</span>`;
      return;
    }
    keys.forEach(k => {
      const pill = document.createElement("div");
      pill.className = "px-3 py-1 rounded-full border bg-slate-50 text-sm";
      pill.innerHTML = `<b>${escapeHtml(k)}</b>: ${pc[k]}`;
      ui.statPeringkat.appendChild(pill);
    });
  }

  // ---------------------------
  // Innovations
  // ---------------------------
  function clearInvForm() {
    ui.invId.value = "";
    ui.invTajuk.value = "";
    ui.invTahun.value = "";
    ui.invKategori.value = "";
    ui.invStatus.value = "";
    ui.invMyipoStatus.value = "no";
    ui.invMyipoNumber.value = "";
    ui.invMyipoNumber.disabled = true;
    setMsg(ui.invMsg, "");
  }

  function bindMyipoToggle() {
    ui.invMyipoStatus.addEventListener("change", () => {
      const yes = ui.invMyipoStatus.value === "yes";
      ui.invMyipoNumber.disabled = !yes;
      if (!yes) ui.invMyipoNumber.value = "";
    });
    ui.invMyipoNumber.disabled = true;
  }

  async function loadInnovations() {
    const out = await apiGet("listMyInnovations", { token: state.token });
    if (!out.ok) return setMsg(ui.invMsg, out.error || "Gagal load inovasi", false);

    const items = out.items || [];
    ui.inovasiList.innerHTML = "";
    if (!items.length) {
      ui.inovasiList.innerHTML = `<div class="text-sm text-slate-500">Belum ada inovasi. Tambah kat sebelah kanan.</div>`;
    }

    items.forEach(inv => {
      const id = inv.innovationId || inv.id;
      const selected = (id === state.selectedInnovationId);

      const card = document.createElement("div");
      card.className = `p-4 rounded-xl border cursor-pointer hover:bg-slate-50 ${selected ? "bg-emerald-50 border-emerald-300" : "bg-white"}`;
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold">${escapeHtml(inv.tajuk || "Tanpa Tajuk")}</div>
            <div class="text-sm text-slate-500">Tahun: ${escapeHtml(inv.tahun||"-")} · Kategori: ${escapeHtml(inv.kategori||"-")} · Status: ${escapeHtml(inv.status||"-")}</div>
            <div class="text-xs text-slate-400 mt-1">MYIPO: ${escapeHtml(inv.myipoStatus||"no")} ${inv.myipoStatus==="yes" ? "(" + escapeHtml(inv.myipoNumber||"-") + ")" : ""}</div>
          </div>
          <div class="flex flex-col gap-2">
            <button class="btnSelect px-3 py-2 rounded-lg border bg-white text-sm hover:bg-slate-50">Select</button>
            <button class="btnEdit px-3 py-2 rounded-lg border bg-white text-sm hover:bg-slate-50">Edit</button>
          </div>
        </div>
      `;

      card.querySelector(".btnSelect").addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectInnovation(id, inv.tajuk || "");
      });
      card.addEventListener("click", () => selectInnovation(id, inv.tajuk || ""));

      card.querySelector(".btnEdit").addEventListener("click", (ev) => {
        ev.stopPropagation();
        ui.invId.value = id;
        ui.invTajuk.value = inv.tajuk || "";
        ui.invTahun.value = inv.tahun || "";
        ui.invKategori.value = inv.kategori || "";
        ui.invStatus.value = inv.status || "";
        ui.invMyipoStatus.value = (inv.myipoStatus === "yes" ? "yes" : "no");
        ui.invMyipoNumber.disabled = (ui.invMyipoStatus.value !== "yes");
        ui.invMyipoNumber.value = inv.myipoNumber || "";
        setMsg(ui.invMsg, "Mode edit: bila siap, tekan Simpan.");
      });

      ui.inovasiList.appendChild(card);
    });

    ui.selectedInnovationLabel.textContent = state.selectedInnovationTitle || "-";
  }

  function selectInnovation(id, title) {
    state.selectedInnovationId = id;
    state.selectedInnovationTitle = title;
    localStorage.setItem("ri_selectedInnovationId", id);
    localStorage.setItem("ri_selectedInnovationTitle", title);

    ui.selectedInnovationLabel.textContent = title || "-";
    setMsg(ui.topMsg, "");

    loadTeam().catch(()=>{});
    loadCompetitions().catch(()=>{});
  }

  async function saveInnovation() {
    const id = ui.invId.value.trim();
    const p = {
      tajuk: ui.invTajuk.value.trim(),
      tahun: ui.invTahun.value.trim(),
      kategori: ui.invKategori.value.trim(),
      status: ui.invStatus.value.trim(),
      myipoStatus: ui.invMyipoStatus.value,
      myipoNumber: ui.invMyipoNumber.value.trim()
    };

    if (!p.tajuk) return setMsg(ui.invMsg, "Nama inovasi diperlukan.", false);
    if (!p.tahun) return setMsg(ui.invMsg, "Tahun diperlukan.", false);
    if (p.myipoStatus === "yes" && !p.myipoNumber) return setMsg(ui.invMsg, "MYIPO status = yes → No. MYIPO wajib isi.", false);

    let out;
    if (id) out = await apiPost("updateInnovation", { token: state.token }, { innovationId: id, ...p });
    else out = await apiPost("addInnovation", { token: state.token }, p);

    if (!out.ok) return setMsg(ui.invMsg, out.error || "Gagal simpan", false);

    setMsg(ui.invMsg, "Berjaya simpan.");
    clearInvForm();
    await loadInnovations();
    await loadDashboard();
  }

  // ---------------------------
  // Team
  // ---------------------------
  async function loadTeam() {
    if (!requireInnovation()) return;

    const out = await apiGet("listTeam", { token: state.token, innovationId: state.selectedInnovationId });
    if (!out.ok) return setMsg(ui.teamMsg, out.error || "Gagal load team", false);

    const items = out.items || [];
    ui.teamList.innerHTML = "";

    if (!items.length) {
      ui.teamList.innerHTML = `<div class="text-sm text-slate-500">Belum ada ahli.</div>`;
      return;
    }

    items.forEach(m => {
      const card = document.createElement("div");
      card.className = "p-4 rounded-xl border bg-white flex items-start justify-between gap-3";
      card.innerHTML = `
        <div>
          <div class="font-semibold">${escapeHtml(m.nama||"-")}</div>
          <div class="text-sm text-slate-500">${escapeHtml(m.email||"-")}</div>
          <div class="text-xs text-slate-400 mt-1">Peranan: ${escapeHtml(m.peranan||"-")}</div>
        </div>
        <button class="btnDel px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm">Buang</button>
      `;
      card.querySelector(".btnDel").addEventListener("click", async () => {
        if (!confirm("Buang ahli ini?")) return;
        const del = await apiPost("deleteTeam", { token: state.token }, { teamId: m.teamId, innovationId: state.selectedInnovationId });
        if (!del.ok) return setMsg(ui.teamMsg, del.error || "Gagal buang", false);
        setMsg(ui.teamMsg, "Ahli dibuang.");
        await loadTeam();
      });
      ui.teamList.appendChild(card);
    });
  }

  async function staffSuggest(q) {
    const out = await apiGet("searchStaff", { token: state.token, q });
    if (!out.ok) return [];
    return out.items || [];
  }

  function renderStaffDatalist(items) {
    ui.staffDatalist.innerHTML = "";
    items.forEach(it => {
      const opt = document.createElement("option");
      opt.value = `${it.name} <${it.email}>`;
      ui.staffDatalist.appendChild(opt);
      state.staffCache.set(String(it.email||"").toLowerCase(), it);
    });
  }

  function parseEmailFromPick(text) {
    const m = String(text||"").match(/<([^>]+)>/);
    if (m && m[1]) return m[1].trim().toLowerCase();
    if (String(text||"").includes("@")) return String(text||"").trim().toLowerCase();
    return "";
  }

  async function onTeamPick() {
    const pick = ui.teamSearch.value;
    const email = parseEmailFromPick(pick);
    if (!email) return;

    ui.teamEmail.value = email;

    const cached = state.staffCache.get(email);
    if (cached && cached.name) {
      ui.teamName.value = cached.name;
      setMsg(ui.teamMsg, "Nama auto diisi dari StaffDirectory.");
      return;
    }

    const out = await apiGet("lookupStaff", { token: state.token, email });
    if (out.ok && out.found) {
      ui.teamName.value = out.name || "";
      setMsg(ui.teamMsg, "Nama auto diisi dari StaffDirectory.");
    } else {
      setMsg(ui.teamMsg, "Staf luar whitelist. Isi nama manual.", false);
    }
  }

  async function addTeamMember() {
    if (!requireInnovation()) return;

    const email = ui.teamEmail.value.trim().toLowerCase();
    const nama = ui.teamName.value.trim();
    const peranan = ui.teamRole.value.trim();

    if (!email) return setMsg(ui.teamMsg, "Email diperlukan.", false);
    if (!nama) return setMsg(ui.teamMsg, "Nama diperlukan (auto atau manual).", false);

    const out = await apiPost("addTeam", { token: state.token }, {
      innovationId: state.selectedInnovationId,
      memberEmail: email,
      memberName: nama,
      roleInTeam: peranan
    });

    if (!out.ok) return setMsg(ui.teamMsg, out.error || "Gagal tambah ahli", false);

    setMsg(ui.teamMsg, out.inWhitelist ? "Ahli ditambah (whitelist)." : "Ahli ditambah (manual / luar whitelist).");
    ui.teamSearch.value = "";
    ui.teamEmail.value = "";
    ui.teamName.value = "";
    ui.teamRole.value = "";
    await loadTeam();
  }

  // ---------------------------
  // Competitions
  // ---------------------------
  async function loadCompetitions() {
    if (!requireInnovation()) return;

    const out = await apiGet("listCompetitions", { token: state.token, innovationId: state.selectedInnovationId });
    if (!out.ok) return setMsg(ui.compMsg, out.error || "Gagal load pertandingan", false);

    const items = out.items || [];
    ui.compList.innerHTML = "";

    if (!items.length) {
      ui.compList.innerHTML = `<div class="text-sm text-slate-500">Belum ada rekod pertandingan.</div>`;
      return;
    }

    items.forEach(c => {
      const card = document.createElement("div");
      card.className = "p-4 rounded-xl border bg-white flex items-start justify-between gap-3";
      card.innerHTML = `
        <div>
          <div class="font-semibold">${escapeHtml(c.namaEvent || "-")}</div>
          <div class="text-sm text-slate-500">${escapeHtml(c.tahun||"-")} · ${escapeHtml(c.peringkat||"-")} · <b>${escapeHtml(c.pingat||"-")}</b></div>
          <div class="text-xs text-slate-400 mt-1">Anugerah khas: ${c.anugerahKhas === "yes" ? "Ya" : "Tidak"} ${c.anugerahKhas==="yes" ? "· " + escapeHtml(c.namaAnugerahKhas||"") : ""}</div>
        </div>
        <button class="btnDel px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm">Buang</button>
      `;
      card.querySelector(".btnDel").addEventListener("click", async () => {
        if (!confirm("Buang rekod pertandingan ini?")) return;
        const del = await apiPost("deleteCompetition", { token: state.token }, { compId: c.compId, innovationId: state.selectedInnovationId });
        if (!del.ok) return setMsg(ui.compMsg, del.error || "Gagal buang", false);
        setMsg(ui.compMsg, "Rekod dibuang.");
        await loadCompetitions();
        await loadDashboard();
      });
      ui.compList.appendChild(card);
    });
  }

  async function addCompetition() {
    if (!requireInnovation()) return;

    const p = {
      innovationId: state.selectedInnovationId,
      namaEvent: ui.compEvent.value.trim(),
      tahun: ui.compYear.value.trim(),
      peringkat: ui.compPeringkat.value.trim(),
      pingat: ui.compPingat.value.trim(),
      anugerahKhas: ui.compAnugerah.checked ? "yes" : "no",
      namaAnugerahKhas: ui.compAnugerahName.value.trim()
    };

    if (!p.namaEvent) return setMsg(ui.compMsg, "Nama event diperlukan.", false);
    if (!p.tahun) return setMsg(ui.compMsg, "Tahun diperlukan.", false);
    if (!p.peringkat) return setMsg(ui.compMsg, "Peringkat diperlukan.", false);
    if (p.anugerahKhas === "yes" && !p.namaAnugerahKhas) return setMsg(ui.compMsg, "Tick anugerah khas → isi nama anugerah.", false);

    const out = await apiPost("addCompetition", { token: state.token }, p);
    if (!out.ok) return setMsg(ui.compMsg, out.error || "Gagal simpan", false);

    setMsg(ui.compMsg, "Berjaya simpan pertandingan.");
    ui.compEvent.value = "";
    ui.compYear.value = "";
    ui.compPeringkat.value = "";
    ui.compPingat.value = "PENYERTAAN";
    ui.compAnugerah.checked = false;
    ui.compAnugerahName.value = "";
    ui.compAnugerahName.classList.add("hidden");

    await loadCompetitions();
    await loadDashboard();
  }

  // ---------------------------
  // PDF (ikut tahun dashboard select)
  // ---------------------------
  function selectedYearForPdf() {
    return ui.dashYearSelect ? ui.dashYearSelect.value : String(new Date().getFullYear());
  }

  async function pdfMine() {
    const year = selectedYearForPdf();
    const out = await apiGet("generateReportPdfMine", { token: state.token, year });
    if (!out.ok) return setMsg(ui.topMsg, out.error || "Gagal generate PDF", false);
    window.open(out.pdfUrl, "_blank");
    setMsg(ui.topMsg, "PDF siap dibuka di tab baru.");
  }

  async function pdfSingle() {
    if (!requireInnovation()) return;
    const year = selectedYearForPdf();
    const out = await apiGet("generateReportPdf", { token: state.token, innovationId: state.selectedInnovationId, year });
    if (!out.ok) return setMsg(ui.topMsg, out.error || "Gagal generate PDF", false);
    window.open(out.pdfUrl, "_blank");
    setMsg(ui.topMsg, "PDF inovasi dipilih siap dibuka di tab baru.");
  }

  async function pdfAll() {
    const year = selectedYearForPdf();
    const out = await apiGet("generateReportPdfAll", { token: state.token, year });
    if (!out.ok) return setMsg(ui.topMsg, out.error || "Gagal generate PDF (admin)", false);
    window.open(out.pdfUrl, "_blank");
    setMsg(ui.topMsg, "PDF keseluruhan siap dibuka di tab baru.");
  }

  // ---------------------------
  // Boot
  // ---------------------------
  async function bootApp() {
    ui.loginCard.classList.add("hidden");
    ui.app.classList.remove("hidden");
    ui.userBox.classList.remove("hidden");

    ui.userEmail.textContent = state.email;
    ui.userRole.textContent = state.role;
    ui.profEmail.textContent = state.email;
    ui.profRole.textContent = state.role;

    ui.selectedInnovationLabel.textContent = state.selectedInnovationTitle || "-";
    if (state.role === "admin") ui.btnPdfAll.classList.remove("hidden");

    await loadDashboard();
    await loadInnovations();

    if (state.selectedInnovationId) {
      await loadTeam();
      await loadCompetitions();
    }

    setTab("dashboard");
  }

  async function tryResume() {
    if (!state.token) return;

    const out = await apiGet("me", { token: state.token });
    if (!out.ok) {
      localStorage.removeItem("ri_token");
      return;
    }
    state.email = out.email;
    state.role = out.role || "user";
    localStorage.setItem("ri_email", state.email);
    localStorage.setItem("ri_role", state.role);
    await bootApp();
  }

  // ---------------------------
  // Utils
  // ---------------------------
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  // ---------------------------
  // Events
  // ---------------------------
  function bindEvents() {
    ui.btnLogout.addEventListener("click", logout);

    document.querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => setTab(btn.dataset.tab));
    });

    ui.btnSaveInv.addEventListener("click", saveInnovation);
    ui.btnClearInv.addEventListener("click", clearInvForm);

    ui.btnTeamRefresh.addEventListener("click", () => loadTeam());
    ui.btnAddTeam.addEventListener("click", addTeamMember);

    ui.teamSearch.addEventListener("input", async () => {
      const q = ui.teamSearch.value.trim();
      if (q.length < 2) return;
      const items = await staffSuggest(q);
      renderStaffDatalist(items);
    });

    ui.teamSearch.addEventListener("change", onTeamPick);

    ui.btnCompRefresh.addEventListener("click", () => loadCompetitions());
    ui.btnAddComp.addEventListener("click", addCompetition);

    ui.compAnugerah.addEventListener("change", () => {
      ui.compAnugerahName.classList.toggle("hidden", !ui.compAnugerah.checked);
      if (!ui.compAnugerah.checked) ui.compAnugerahName.value = "";
    });

    ui.btnPdfMine.addEventListener("click", pdfMine);
    ui.btnPdfSingle.addEventListener("click", pdfSingle);
    ui.btnPdfAll.addEventListener("click", pdfAll);

    ui.btnDashRefresh.addEventListener("click", loadDashboard);
    ui.dashYearSelect.addEventListener("change", loadDashboard);
  }

  function init() {
    assertConfig();
    const y = String(new Date().getFullYear());
    if (ui.yearNow) ui.yearNow.textContent = y;

    initYearSelect();
    setupGoogleButton();
    bindMyipoToggle();
    bindEvents();

    clearInvForm();
    tryResume().catch(() => {});
  }

  init();
})();
