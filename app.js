// app.js
(() => {
  const CFG = window.APP_CONFIG || {};
  const API = (path) => `${CFG.API_BASE}${CFG.API_BASE.includes("?") ? "&" : "?"}${path}`;

  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    token: localStorage.getItem("ri_token") || "",
    email: localStorage.getItem("ri_email") || "",
    role: localStorage.getItem("ri_role") || "",
    selectedInnovationId: localStorage.getItem("ri_selectedInnovationId") || "",
    selectedInnovationTitle: localStorage.getItem("ri_selectedInnovationTitle") || "",
    innovations: [],
    team: [],
    comps: [],
    staffSuggest: []
  };

  function show(el, yes = true) {
    if (!el) return;
    el.classList.toggle("hidden", !yes);
  }

  function setAlert(msg) {
    const box = $("globalAlert");
    if (!msg) { show(box, false); box.textContent = ""; return; }
    box.textContent = msg;
    show(box, true);
  }

  function setMsg(el, msg, ok = true) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    el.classList.toggle("text-emerald-700", ok);
    el.classList.toggle("text-red-600", !ok);
  }

  function clearMsg(el) {
    if (!el) return;
    el.textContent = "";
    el.classList.add("hidden");
  }

  function persistSession() {
    localStorage.setItem("ri_token", state.token || "");
    localStorage.setItem("ri_email", state.email || "");
    localStorage.setItem("ri_role", state.role || "");
  }

  function persistSelectedInnovation() {
    localStorage.setItem("ri_selectedInnovationId", state.selectedInnovationId || "");
    localStorage.setItem("ri_selectedInnovationTitle", state.selectedInnovationTitle || "");
    renderSelectedInnovationLabel();
  }

  function renderSelectedInnovationLabel() {
    const label = $("selectedInnovationLabel");
    if (!state.selectedInnovationId) {
      label.textContent = "-";
      return;
    }
    label.textContent = state.selectedInnovationTitle
      ? state.selectedInnovationTitle
      : state.selectedInnovationId;
  }

  async function apiGet(action, params = {}) {
    const url = new URL(CFG.API_BASE);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { method: "GET" });
    return await res.json();
  }

  async function apiPost(action, token, body = {}) {
    const url = new URL(CFG.API_BASE);
    url.searchParams.set("action", action);
    if (token) url.searchParams.set("token", token);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    return await res.json();
  }

  // ----------------- AUTH -----------------
  function initGSI() {
    const btn = $("gsiBtn");
    if (!btn) return;

    if (!CFG.GOOGLE_CLIENT_ID) {
      show($("loginError"), true);
      $("loginError").textContent = "GOOGLE_CLIENT_ID belum set dalam config.js";
      return;
    }

    window.google.accounts.id.initialize({
      client_id: CFG.GOOGLE_CLIENT_ID,
      callback: async (resp) => {
        try {
          clearMsg($("loginError"));
          setAlert("");

          const credential = resp.credential;
          // loginGoogle is GET (avoid preflight)
          const out = await apiGet("loginGoogle", { credential });

          if (!out.ok) throw new Error(out.error || "Login gagal");

          // domain guard (extra safety)
          if (CFG.ALLOWED_DOMAIN && !String(out.email || "").endsWith("@" + CFG.ALLOWED_DOMAIN)) {
            throw new Error("Akaun bukan domain dibenarkan.");
          }

          state.token = out.token;
          state.email = out.email;
          state.role = out.role || "user";
          persistSession();

          await afterLogin();
        } catch (e) {
          show($("loginError"), true);
          $("loginError").textContent = String(e.message || e);
        }
      }
    });

    window.google.accounts.id.renderButton(btn, {
      theme: "outline",
      size: "large",
      shape: "pill",
      width: 260
    });
  }

  async function afterLogin() {
    show($("loginCard"), false);
    show($("app"), true);
    show($("userBox"), true);
    show($("btnLogout"), true);

    $("userEmail").textContent = state.email || "-";
    $("userRole").textContent = state.role || "-";
    $("p_email").textContent = state.email || "-";
    $("p_role").textContent = state.role || "-";
    $("p_token").textContent = state.token || "-";

    renderSelectedInnovationLabel();

    // load data
    await loadInnovations();
    // if selected exists but not in list, clear
    if (state.selectedInnovationId && !state.innovations.find(x => x.innovationId === state.selectedInnovationId)) {
      state.selectedInnovationId = "";
      state.selectedInnovationTitle = "";
      persistSelectedInnovation();
    }
    renderInnovations();
    await refreshTeamAndCompsIfReady();
  }

  function logout() {
    state.token = "";
    state.email = "";
    state.role = "";
    persistSession();

    // keep selected? better clear
    state.selectedInnovationId = "";
    state.selectedInnovationTitle = "";
    persistSelectedInnovation();

    location.reload();
  }

  // ----------------- DATA LOADERS -----------------
  async function loadInnovations() {
    const out = await apiGet("listMyInnovations", { token: state.token });
    if (!out.ok) throw new Error(out.error || "Gagal load innovations");
    // normalize to {innovationId,tajuk,tahun,...}
    state.innovations = (out.items || []).map(x => ({
      innovationId: String(x.innovationId || x.id || "").trim(),
      tajuk: x.tajuk || "",
      tahun: x.tahun || "",
      kategori: x.kategori || "",
      status: x.status || "",
      myipoStatus: x.myipoStatus || "",
      myipoNumber: x.myipoNumber || "",
      ownerEmail: x.ownerEmail || x.owner || x.ownerEmail || ""
    })).filter(x => x.innovationId);
  }

  async function loadTeam() {
    if (!state.selectedInnovationId) return;
    const out = await apiGet("listTeamMembers", { token: state.token, innovationId: state.selectedInnovationId });
    if (!out.ok) throw new Error(out.error || "Gagal load team");
    state.team = (out.items || []).map(x => ({
      teamId: x.teamId || x.id || "",
      memberEmail: x.memberEmail || x.email || "",
      memberName: x.memberName || x.nama || "",
      role: x.role || x.peranan || "member"
    }));
  }

  async function loadComps() {
    const out = await apiGet("listMyCompetitions", { token: state.token });
    if (!out.ok) throw new Error(out.error || "Gagal load competitions");
    state.comps = (out.items || []).map(x => ({
      competitionId: x.competitionId || x.compId || "",
      innovationId: x.innovationId || "",
      namaEvent: x.namaEvent || "",
      tahun: x.tahun || "",
      peringkat: x.peringkat || "",
      pingat: x.pingat || "",
      anugerahKhas: x.anugerahKhas || "",
      namaAnugerahKhas: x.namaAnugerahKhas || "",
      createdAt: x.createdAt || ""
    }));
  }

  async function refreshTeamAndCompsIfReady() {
    // team depends on selectedInnovationId
    if (state.selectedInnovationId) {
      await loadTeam();
      renderTeam();
    } else {
      renderTeam();
    }
    await loadComps();
    renderComps();
  }

  // ----------------- RENDERERS -----------------
  function renderInnovations() {
    const box = $("innovationsList");
    box.innerHTML = "";

    if (!state.innovations.length) {
      box.innerHTML = `<div class="text-sm text-slate-500">Belum ada inovasi.</div>`;
      return;
    }

    state.innovations.forEach(inv => {
      const selected = inv.innovationId === state.selectedInnovationId;
      const card = document.createElement("div");
      card.className = `rounded-2xl border p-4 bg-white ${selected ? "border-emerald-300 ring-2 ring-emerald-100" : "hover:bg-slate-50"}`;

      card.innerHTML = `
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="text-sm text-slate-500">${inv.tahun || "-" } • ${inv.kategori || "-" } • ${inv.status || "-"}</div>
            <div class="mt-1 text-base font-semibold text-slate-900">${escapeHtml(inv.tajuk || "(Tanpa tajuk)")}</div>
            <div class="mt-2 text-xs text-slate-500">ID: <span class="font-mono">${inv.innovationId}</span></div>
            <div class="mt-1 text-xs text-slate-500">MYIPO: ${escapeHtml(inv.myipoStatus || "-")} ${inv.myipoNumber ? "• " + escapeHtml(inv.myipoNumber) : ""}</div>
          </div>
          <div class="shrink-0 flex flex-col gap-2 items-end">
            <button class="btnSelect px-4 py-2 rounded-xl text-sm ${selected ? "bg-emerald-600 text-white" : "bg-slate-900 text-white hover:bg-slate-800"}">
              ${selected ? "Dipilih" : "Pilih"}
            </button>
          </div>
        </div>
      `;

      card.querySelector(".btnSelect").addEventListener("click", async () => {
        state.selectedInnovationId = inv.innovationId;
        state.selectedInnovationTitle = inv.tajuk || inv.innovationId;
        persistSelectedInnovation();
        setAlert("");
        // refresh dependent panels
        await refreshTeamAndCompsIfReady();
      });

      box.appendChild(card);
    });
  }

  function renderTeam() {
    const box = $("teamList");
    box.innerHTML = "";

    if (!state.selectedInnovationId) {
      box.innerHTML = `<div class="text-sm text-rose-700 border border-rose-200 bg-rose-50 rounded-xl p-3">Pilih inovasi dulu kat tab Inovasi.</div>`;
      return;
    }

    if (!state.team.length) {
      box.innerHTML = `<div class="text-sm text-slate-500">Belum ada team member untuk inovasi ini.</div>`;
      return;
    }

    state.team.forEach(m => {
      const row = document.createElement("div");
      row.className = "rounded-2xl border p-4 bg-white flex items-start justify-between gap-4";

      row.innerHTML = `
        <div>
          <div class="text-base font-semibold text-slate-900">${escapeHtml(m.memberName || "-")}</div>
          <div class="text-sm text-slate-600">${escapeHtml(m.memberEmail || "-")}</div>
          <div class="text-xs text-slate-500 mt-1">Peranan: <span class="font-medium">${escapeHtml(m.role || "member")}</span></div>
        </div>
        <div class="shrink-0">
          <button class="btnRemove px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 text-sm">Buang</button>
        </div>
      `;

      row.querySelector(".btnRemove").addEventListener("click", async () => {
        try {
          setAlert("");
          const out = await apiPost("removeTeamMember", state.token, {
            teamId: m.teamId,
            innovationId: state.selectedInnovationId,
            memberEmail: m.memberEmail
          });
          if (!out.ok) throw new Error(out.error || "Gagal buang ahli");
          await loadTeam();
          renderTeam();
        } catch (e) {
          setAlert(String(e.message || e));
        }
      });

      box.appendChild(row);
    });
  }

  function renderComps() {
    const box = $("compsList");
    box.innerHTML = "";

    if (!state.selectedInnovationId) {
      box.innerHTML = `<div class="text-sm text-rose-700 border border-rose-200 bg-rose-50 rounded-xl p-3">Pilih inovasi dulu kat tab Inovasi.</div>`;
      return;
    }

    const filtered = state.comps.filter(c => c.innovationId === state.selectedInnovationId);

    if (!filtered.length) {
      box.innerHTML = `<div class="text-sm text-slate-500">Belum ada rekod pertandingan untuk inovasi ini.</div>`;
      return;
    }

    filtered.forEach(c => {
      const row = document.createElement("div");
      row.className = "rounded-2xl border p-4 bg-white";

      const medal = c.pingat || "-";
      const ak = (String(c.anugerahKhas || "").toLowerCase() === "yes") ? `• <span class="text-emerald-700 font-medium">Anugerah Khas:</span> ${escapeHtml(c.namaAnugerahKhas || "-")}` : "";

      row.innerHTML = `
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="text-sm text-slate-500">${escapeHtml(c.tahun || "-")} • ${escapeHtml(c.peringkat || "-")} • <span class="font-semibold text-slate-900">${escapeHtml(medal)}</span> ${ak}</div>
            <div class="mt-1 text-base font-semibold text-slate-900">${escapeHtml(c.namaEvent || "-")}</div>
            <div class="mt-2 text-xs text-slate-500">ID: <span class="font-mono">${escapeHtml(c.competitionId || "-")}</span></div>
          </div>
        </div>
      `;

      box.appendChild(row);
    });
  }

  // ----------------- STAFF AUTOCOMPLETE -----------------
  let staffTimer = null;
  async function staffSearch(q) {
    const out = await apiGet("searchStaff", { token: state.token, q: q || "" });
    if (!out.ok) return [];
    return out.items || [];
  }

  function fillStaffDatalist(items) {
    const dl = $("staffDatalist");
    dl.innerHTML = "";
    items.forEach(it => {
      const opt = document.createElement("option");
      // display label
      const label = `${it.name || ""} <${it.email || ""}>`.trim();
      opt.value = label;
      opt.dataset.email = it.email || "";
      opt.dataset.name = it.name || "";
      dl.appendChild(opt);
    });
  }

  function parseSelectedStaff(inputVal) {
    // Expect: "NAME <email>"
    const m = String(inputVal || "").match(/<([^>]+)>/);
    const email = m ? m[1].trim() : "";
    const name = String(inputVal || "").replace(/<[^>]+>/, "").trim();
    return { email, name };
  }

  // ----------------- EVENTS -----------------
  function bindEvents() {
    // tabs
    qsa(".tabBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const tab = btn.getAttribute("data-tab");
        setActiveTab(tab);
        // refresh when entering
        if (tab === "inovasi") {
          await loadInnovations(); renderInnovations();
        }
        if (tab === "team") {
          if (state.selectedInnovationId) { await loadTeam(); }
          renderTeam();
        }
        if (tab === "pertandingan") {
          await loadComps(); renderComps();
        }
        if (tab === "profil") {
          $("p_email").textContent = state.email || "-";
          $("p_role").textContent = state.role || "-";
          $("p_token").textContent = state.token || "-";
        }
      });
    });

    $("btnLogout").addEventListener("click", logout);

    $("btnRefreshInnovations").addEventListener("click", async () => {
      try { setAlert(""); await loadInnovations(); renderInnovations(); }
      catch (e) { setAlert(String(e.message || e)); }
    });

    $("btnAddInnovation").addEventListener("click", async () => {
      const msg = $("inovasiMsg");
      clearMsg(msg);
      try {
        setAlert("");

        const tajuk = $("in_tajuk").value.trim();
        const tahun = $("in_tahun").value.trim();
        const kategori = $("in_kategori").value.trim();
        const status = $("in_status").value.trim();
        const myipoStatus = $("in_myipoStatus").value.trim();
        const myipoNumber = $("in_myipoNumber").value.trim();

        if (!tajuk) throw new Error("Tajuk diperlukan");
        if (!tahun) throw new Error("Tahun diperlukan");

        const out = await apiPost("addInnovation", state.token, {
          tajuk, tahun, kategori, status, myipoStatus, myipoNumber
        });
        if (!out.ok) throw new Error(out.error || "Gagal simpan inovasi");

        setMsg(msg, "Inovasi berjaya disimpan.", true);

        $("in_tajuk").value = "";
        $("in_tahun").value = "";
        $("in_kategori").value = "";
        $("in_myipoStatus").value = "";
        $("in_myipoNumber").value = "";

        await loadInnovations();
        renderInnovations();
      } catch (e) {
        setMsg(msg, String(e.message || e), false);
      }
    });

    // Team refresh
    $("btnRefreshTeam").addEventListener("click", async () => {
      try {
        setAlert("");
        if (!state.selectedInnovationId) { renderTeam(); return; }
        await loadTeam();
        renderTeam();
      } catch (e) {
        setAlert(String(e.message || e));
      }
    });

    // Team add
    $("btnAddTeam").addEventListener("click", async () => {
      const msg = $("teamMsg");
      clearMsg(msg);
      try {
        setAlert("");
        if (!state.selectedInnovationId) throw new Error("Pilih inovasi dulu.");

        const memberEmail = $("tm_email").value.trim().toLowerCase();
        const memberName  = $("tm_name").value.trim();
        const role        = $("tm_role").value.trim() || "member";

        if (!memberEmail) throw new Error("Email ahli diperlukan.");

        const out = await apiPost("addTeamMember", state.token, {
          innovationId: state.selectedInnovationId,
          memberEmail,
          memberName,
          role
        });

        if (!out.ok) throw new Error(out.error || "Gagal tambah ahli");

        setMsg(msg, "Ahli berjaya ditambah.", true);
        $("tm_search").value = "";
        $("tm_email").value = "";
        $("tm_name").value = "";
        $("tm_role").value = "";

        await loadTeam();
        renderTeam();
      } catch (e) {
        setMsg(msg, String(e.message || e), false);
      }
    });

    // Staff search box
    $("tm_search").addEventListener("input", () => {
      const val = $("tm_search").value.trim();
      if (staffTimer) clearTimeout(staffTimer);
      staffTimer = setTimeout(async () => {
        if (val.length < 2) { fillStaffDatalist([]); return; }
        const items = await staffSearch(val);
        state.staffSuggest = items;
        fillStaffDatalist(items);
      }, 250);
    });

    $("tm_search").addEventListener("change", () => {
      const { email, name } = parseSelectedStaff($("tm_search").value);
      if (email) $("tm_email").value = email;
      if (name) $("tm_name").value = name;
    });

    // Competitions
    $("btnRefreshComps").addEventListener("click", async () => {
      try {
        setAlert("");
        await loadComps();
        renderComps();
      } catch (e) {
        setAlert(String(e.message || e));
      }
    });

    $("cp_anugerahKhas").addEventListener("change", () => {
      const on = $("cp_anugerahKhas").checked;
      show($("cp_namaAnugerahKhas"), on);
      if (!on) $("cp_namaAnugerahKhas").value = "";
    });

    $("btnAddComp").addEventListener("click", async () => {
      const msg = $("compMsg");
      clearMsg(msg);
      try {
        setAlert("");
        if (!state.selectedInnovationId) throw new Error("Pilih inovasi dulu.");

        const namaEvent = $("cp_event").value.trim();
        const tahun = $("cp_tahun").value.trim();
        const peringkat = $("cp_peringkat").value.trim();
        const pingat = $("cp_pingat").value.trim();

        const anugerahKhas = $("cp_anugerahKhas").checked ? "yes" : "no";
        const namaAnugerahKhas = $("cp_namaAnugerahKhas").value.trim();

        if (!namaEvent) throw new Error("Nama event diperlukan.");
        if (!tahun) throw new Error("Tahun diperlukan.");
        if (!peringkat) throw new Error("Peringkat diperlukan.");
        if (!pingat) throw new Error("Pingat diperlukan.");

        if (anugerahKhas === "yes" && !namaAnugerahKhas) {
          throw new Error("Nama anugerah khas diperlukan bila tick.");
        }

        const out = await apiPost("addCompetition", state.token, {
          innovationId: state.selectedInnovationId,
          namaEvent,
          tahun,
          peringkat,
          pingat,
          anugerahKhas,
          namaAnugerahKhas
        });

        if (!out.ok) throw new Error(out.error || "Gagal simpan pertandingan");

        setMsg(msg, "Pertandingan berjaya disimpan.", true);

        $("cp_event").value = "";
        $("cp_tahun").value = "";
        $("cp_peringkat").value = "";
        $("cp_pingat").value = "";
        $("cp_anugerahKhas").checked = false;
        $("cp_namaAnugerahKhas").value = "";
        show($("cp_namaAnugerahKhas"), false);

        await loadComps();
        renderComps();
      } catch (e) {
        setMsg(msg, String(e.message || e), false);
      }
    });
  }

  function setActiveTab(tab) {
    // buttons
    qsa(".tabBtn").forEach(b => {
      const is = b.getAttribute("data-tab") === tab;
      b.classList.toggle("bg-slate-900", is);
      b.classList.toggle("text-white", is);
      b.classList.toggle("border", !is);
      b.classList.toggle("bg-white", !is);
    });

    // panels
    qsa(".panel").forEach(p => p.classList.add("hidden"));
    show($(`panel-${tab}`), true);

    // if user masuk team/pertandingan tapi belum pilih inovasi, bagi alert halus
    if ((tab === "team" || tab === "pertandingan") && !state.selectedInnovationId) {
      setAlert("Pilih inovasi dulu kat tab Inovasi.");
    } else {
      setAlert("");
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ----------------- BOOT -----------------
  async function boot() {
    bindEvents();
    renderSelectedInnovationLabel();

    initGSI();

    // if already has token, validate
    if (state.token) {
      try {
        const out = await apiGet("me", { token: state.token });
        if (!out.ok) throw new Error(out.error || "Session invalid");
        state.email = out.email;
        state.role = out.role || "user";
        persistSession();
        await afterLogin();
      } catch (e) {
        // session expired: clear
        state.token = "";
        persistSession();
        // show login
        show($("loginCard"), true);
        show($("app"), false);
      }
    }
  }

  boot();
})();
