/******************************************************
 * Rekod Inovasi Jabatan - Backend (Google Apps Script)
 * - GitHub Pages frontend (CORS-safe)
 * - loginGoogle uses GET (no preflight)
 *
 * UPDATE:
 * - Team Members (owner/leader can manage)
 * - StaffDirectory dropdown support (listStaffDirectory)
 * - listMyInnovations now returns: owner + team member innovations
 * - addCompetition security: allow if user is owner OR team member
 * - TeamMembers supports External members (manual name/email/dept)
 ******************************************************/

const SHEETS = {
  USERS: "Users",
  STAFF: "StaffDirectory",
  SESSIONS: "Sessions",
  INNOVATIONS: "Innovations",
  TEAM: "TeamMembers",
  COMPS: "Competitions",
};

function doGet(e) { return api_(e, "GET"); }
function doPost(e){ return api_(e, "POST"); }

function api_(e, method){
  try{
    const action = (e.parameter.action || "").trim();
    if (!action) return json_({ ok:false, error:"Missing action" });

    // Parse body (POST)
    let body = {};
    if (method === "POST") {
      const raw = e.postData && e.postData.contents ? e.postData.contents : "";
      if (raw) { try { body = JSON.parse(raw); } catch(err){ body = {}; } }
    }

    switch(action){

      case "ping":
        return json_({ ok:true, ts:new Date().toISOString() });

      // ---- Google login (CORS-safe: GET)
      case "loginGoogle": {
        const credential = (e.parameter.credential || "").trim() || (body.credential || "");
        if (!credential) return json_({ ok:false, error:"Missing credential" });

        const payload = verifyGoogleIdToken_(credential);
        if (!payload.ok) return json_({ ok:false, error: payload.error || "Invalid Google token" });

        const email = String(payload.email || "").toLowerCase().trim();
        if (!email) return json_({ ok:false, error:"Email missing in token" });

        // whitelist by StaffDirectory
        if (!existsInSheet_(SHEETS.STAFF, "email", email)) {
          return json_({ ok:false, error:"Email not in StaffDirectory whitelist" });
        }

        const role = getRole_(email); // admin/user
        ensureUserRow_(email, role);

        const token = createSession_(email);
        return json_({ ok:true, token, email, role });
      }

      case "me": {
        const token = (e.parameter.token || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error || "Invalid session" });
        const role = getRole_(sess.email);
        touchSession_(token);
        return json_({ ok:true, email:sess.email, role });
      }

      /**********************
       * STAFF DIRECTORY
       **********************/
      // GET: ?action=listStaffDirectory&token=...
      case "listStaffDirectory": {
        const token = (e.parameter.token || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error });

        touchSession_(token);

        // Expect StaffDirectory headers: email, nama (optional: jabatan/unit)
        const sh = sheet_(SHEETS.STAFF);
        const hs = headers_(sh);
        const lastRow = sh.getLastRow();
        if (lastRow < 2) return json_({ ok:true, items: [] });

        const data = sh.getRange(2,1,lastRow-1,hs.length).getValues();
        const idx = (n)=>hs.indexOf(n);

        const emailIdx = idx("email");
        const namaIdx  = idx("nama");
        const deptIdx  = idx("jabatan"); // optional
        const unitIdx  = idx("unit");    // optional

        const items = data
          .map(r => ({
            email: String(r[emailIdx]||"").toLowerCase().trim(),
            nama: String((namaIdx>=0? r[namaIdx] : "")||"").trim(),
            jabatan: String((deptIdx>=0? r[deptIdx] : "")||"").trim(),
            unit: String((unitIdx>=0? r[unitIdx] : "")||"").trim(),
          }))
          .filter(x => x.email);

        return json_({ ok:true, items });
      }

      /**********************
       * INNOVATIONS (MY)
       **********************/
      // NOTE: now returns innovations where user is owner OR is team member
      case "listMyInnovations": {
        const token = (e.parameter.token || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error });

        touchSession_(token);
        const items = listInnovationsForUser_(sess.email);
        return json_({ ok:true, items });
      }

      case "addInnovation": {
        const token = (e.parameter.token || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error });

        const p = body || {};
        const tajuk = String(p.tajuk||"").trim();
        const tahun = String(p.tahun||"").trim();
        const kategori = String(p.kategori||"").trim();
        const status = String(p.status||"").trim();
        const myipoStatus = String(p.myipoStatus||"").trim();
        const myipoNumber = String(p.myipoNumber||"").trim();

        if (!tajuk || !tahun) return json_({ ok:false, error:"Tajuk & tahun wajib isi" });

        const innovationId = uuid_();
        appendRow_(SHEETS.INNOVATIONS, [
          innovationId,
          tajuk,
          tahun,
          kategori,
          status,
          myipoStatus,
          myipoNumber,
          sess.email,
          new Date().toISOString(),
        ]);

        // Auto add owner to TeamMembers as leader (so leader rule consistent)
        ensureTeamSchema_();
        appendTeamRow_(innovationId, sess.email, "", "", "leader", sess.email);

        touchSession_(token);
        return json_({ ok:true, innovationId });
      }

      // ---- Report (MY) for year
      case "generateReport": {
        const token = (e.parameter.token || "").trim();
        const year  = String(e.parameter.year || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error });
        if (!year) return json_({ ok:false, error:"Missing year" });

        touchSession_(token);

        const all = listInnovationsForUser_(sess.email)
          .filter(x => String(x.tahun||"").trim() === year);

        return json_({
          ok:true,
          year,
          items: all.map(x => ({
            innovationId: x.innovationId || "",
            tajuk: x.tajuk || "",
            kategori: x.kategori || "",
            status: x.status || "",
            myipoStatus: x.myipoStatus || "",
            myipoNumber: x.myipoNumber || "",
          }))
        });
      }

      /**********************
       * TEAM MEMBERS
       **********************/
      case "listMyTeamMembers": {
        const token = (e.parameter.token || "").trim();
        const innovationId = String(e.parameter.innovationId || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error });
        if (!innovationId) return json_({ ok:false, error:"Missing innovationId" });

        ensureTeamSchema_();

        // permission: must be owner OR leader/coLeader of this innovation
        if (!canManageTeam_(innovationId, sess.email)) {
          return json_({ ok:false, error:"Hanya owner/leader boleh lihat urus ahli untuk inovasi ini." });
        }

        touchSession_(token);
        const items = listTeamMembers_(innovationId);
        return json_({ ok:true, items });
      }

      case "addTeamMember": {
        const token = (e.parameter.token || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error });

        ensureTeamSchema_();

        const p = body || {};
        const innovationId = String(p.innovationId || "").trim();
        let memberEmail = String(p.memberEmail || "").toLowerCase().trim();
        const memberName = String(p.memberName || "").trim();
        const memberDept = String(p.memberDept || "").trim();
        let role = String(p.role || "member").trim().toLowerCase();

        if (!innovationId) return json_({ ok:false, error:"innovationId wajib" });
        if (!memberEmail) return json_({ ok:false, error:"Email ahli wajib" });

        // role sanitize
        if (!["member","leader","coleader","co-leader"].includes(role)) role = "member";
        if (role === "co-leader") role = "coleader";

        // permission: owner OR leader/coLeader can add
        if (!canManageTeam_(innovationId, sess.email)) {
          return json_({ ok:false, error:"Hanya owner/leader boleh tambah ahli." });
        }

        // validate innovation exists (at least for someone)
        if (!existsInnovationId_(innovationId)) {
          return json_({ ok:false, error:"innovationId tidak wujud." });
        }

        // StaffDirectory check: allow if exists OR treat as external (must have name + dept)
        const inDir = existsInSheet_(SHEETS.STAFF, "email", memberEmail);
        if (!inDir) {
          // external rules
          if (!memberName) return json_({ ok:false, error:"Nama ahli wajib jika email tiada dalam StaffDirectory." });
          if (!memberDept) return json_({ ok:false, error:"Jabatan/Unit ahli wajib jika external." });
        }

        // prevent duplicate
        if (teamMemberExists_(innovationId, memberEmail)) {
          return json_({ ok:false, error:"Ahli ini sudah ada dalam kumpulan." });
        }

        appendTeamRow_(innovationId, memberEmail, memberName, memberDept, role, sess.email);

        touchSession_(token);
        return json_({ ok:true });
      }

      case "removeTeamMember": {
        const token = (e.parameter.token || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error });

        ensureTeamSchema_();

        const innovationId = String((e.parameter.innovationId || "")).trim() || String((body.innovationId||"")).trim();
        const memberEmail  = String((e.parameter.memberEmail || "")).toLowerCase().trim() || String((body.memberEmail||"")).toLowerCase().trim();

        if (!innovationId || !memberEmail) return json_({ ok:false, error:"innovationId & memberEmail wajib" });

        // permission: owner OR leader/coLeader
        if (!canManageTeam_(innovationId, sess.email)) {
          return json_({ ok:false, error:"Hanya owner/leader boleh buang ahli." });
        }

        // safety: cannot remove last leader (at least keep 1 leader)
        if (isLeaderRole_(innovationId, memberEmail)) {
          const leaders = countLeaders_(innovationId);
          if (leaders <= 1) return json_({ ok:false, error:"Tak boleh buang leader terakhir." });
        }

        const ok = removeTeamMemberRow_(innovationId, memberEmail);
        touchSession_(token);
        return json_({ ok:true, removed: ok });
      }

      /**********************
       * COMPETITIONS (MY)
       **********************/
      case "addCompetition": {
        const token = (e.parameter.token || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error });

        ensureCompetitionsSchema_();

        const p = body || {};
        const innovationId = String(p.innovationId || "").trim();
        const tahun = String(p.tahun || "").trim();
        const peringkat = String(p.peringkat || "").trim();
        const pingat = String(p.pingat || "").trim();
        const anugerahKhas = String(p.anugerahKhas || "").trim();      // yes/no
        const namaAnugerahKhas = String(p.namaAnugerahKhas || "").trim(); // optional
        const namaEvent = String(p.namaEvent || "").trim();            // optional

        if (!innovationId) return json_({ ok:false, error:"innovationId wajib" });
        if (!tahun) return json_({ ok:false, error:"tahun wajib" });
        if (!peringkat) return json_({ ok:false, error:"peringkat wajib" });
        if (!pingat) return json_({ ok:false, error:"pingat wajib" });

        // Security: allow if innovation belongs to them as owner OR team member
        const myInvIds = new Set(listInnovationsForUser_(sess.email).map(x => String(x.innovationId||"").trim()));
        if (!myInvIds.has(innovationId)) {
          return json_({ ok:false, error:"Anda tak dibenarkan tambah penyertaan untuk innovationId ini." });
        }

        const sh = sheet_(SHEETS.COMPS);
        const hs = headers_(sh);

        const rowObj = {
          competitionId: uuid_(),
          innovationId,
          namaEvent,
          tahun,
          peringkat,
          pingat,
          anugerahKhas,         // "yes"/"no"
          namaAnugerahKhas,     // string
          createdByEmail: sess.email,
          createdAt: new Date().toISOString(),
        };

        // build row according to headers
        const row = hs.map(h => rowObj[h] !== undefined ? rowObj[h] : "");
        sh.appendRow(row);

        touchSession_(token);
        return json_({ ok:true, competitionId: rowObj.competitionId });
      }

      case "listMyCompetitions": {
        const token = (e.parameter.token || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error });

        ensureCompetitionsSchema_();

        touchSession_(token);
        const items = listCompetitionsByOwner_(sess.email);
        return json_({ ok:true, items });
      }

      case "generateCompetitionReport": {
        const token = (e.parameter.token || "").trim();
        const year  = String(e.parameter.year || "").trim();
        const sess = getSession_(token);
        if (!sess.ok) return json_({ ok:false, error: sess.error });
        if (!year) return json_({ ok:false, error:"Missing year" });

        ensureCompetitionsSchema_();

        touchSession_(token);

        // get my innovations map (owner + team) for title lookup
        const myInv = listInnovationsForUser_(sess.email);
        const invMap = {};
        myInv.forEach(x => invMap[String(x.innovationId||"").trim()] = x);

        const comps = listCompetitionsByOwner_(sess.email)
          .filter(x => String(x.tahun||"").trim() === year);

        // summary
        const medals = { None:0, Bronze:0, Silver:0, Gold:0, Platinum:0 };
        const levels = { Internal:0, Daerah:0, Negeri:0, Kebangsaan:0, Antarabangsa:0 };
        let anugerah = 0;

        comps.forEach(c => {
          const p = normalizePingat_(c.pingat);
          const r = normalizePeringkat_(c.peringkat);
          medals[p] = (medals[p]||0) + 1;
          levels[r] = (levels[r]||0) + 1;

          const ak = String(c.anugerahKhas||"").trim().toLowerCase();
          if (["yes","ya","y","true","1"].includes(ak)) anugerah++;
        });

        // items with tajuk
        const items = comps.map(c => {
          const inv = invMap[String(c.innovationId||"").trim()] || {};
          const ak = String(c.anugerahKhas||"").trim();
          const nak = String(c.namaAnugerahKhas||"").trim();
          return {
            competitionId: c.competitionId || "",
            innovationId: c.innovationId || "",
            tajuk: inv.tajuk || "",
            tahun: c.tahun || "",
            peringkat: c.peringkat || "",
            pingat: c.pingat || "",
            anugerahKhas: ak || "",
            namaAnugerahKhas: nak || "",
            namaEvent: c.namaEvent || "",
            createdAt: c.createdAt || "",
          };
        });

        return json_({
          ok:true,
          year,
          summary: {
            totalPenyertaan: items.length,
            anugerahKhas: anugerah,
            medals,
            peringkat: levels,
          },
          items
        });
      }

      default:
        return json_({ ok:false, error:`Unknown action: ${action}` });
    }

  } catch(err){
    return json_({ ok:false, error: String(err && err.message ? err.message : err) });
  }
}

/* =========================
   Helpers (Sheets)
========================= */

function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name){
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error(`Missing sheet: ${name}`);
  return sh;
}

function headers_(sh){
  const lastCol = Math.max(1, sh.getLastColumn());
  return sh.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h||"").trim());
}

function colIndex_(sh, colName){
  const hs = headers_(sh);
  const idx = hs.indexOf(colName);
  if (idx === -1) throw new Error(`Missing column "${colName}" in sheet ${sh.getName()}`);
  return idx + 1;
}

function existsInSheet_(sheetName, colName, value){
  const sh = sheet_(sheetName);
  const col = colIndex_(sh, colName);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;
  const vals = sh.getRange(2,col,lastRow-1,1).getValues().flat().map(v => String(v||"").toLowerCase().trim());
  return vals.includes(String(value||"").toLowerCase().trim());
}

function findRowBy_(sheetName, colName, value){
  const sh = sheet_(sheetName);
  const col = colIndex_(sh, colName);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const vals = sh.getRange(2,col,lastRow-1,1).getValues().flat();
  const target = String(value||"").toLowerCase().trim();
  for (let i=0;i<vals.length;i++){
    if (String(vals[i]||"").toLowerCase().trim() === target) return i+2;
  }
  return 0;
}

function appendRow_(sheetName, arr){
  sheet_(sheetName).appendRow(arr);
}

/* =========================
   Users & Roles
========================= */

function getRole_(email){
  const sh = sheet_(SHEETS.USERS);
  const r = findRowBy_(SHEETS.USERS, "email", email);
  if (!r) return "user";
  const roleCol = colIndex_(sh, "role");
  const role = String(sh.getRange(r, roleCol).getValue() || "").trim();
  return role ? role : "user";
}

function ensureUserRow_(email, role){
  const sh = sheet_(SHEETS.USERS);
  const r = findRowBy_(SHEETS.USERS, "email", email);
  const roleCol  = colIndex_(sh, "role");
  const createdCol = colIndex_(sh, "createdAt");

  if (!r){
    sh.appendRow([ email, role || "user", new Date().toISOString() ]);
    return;
  }
  const existingRole = String(sh.getRange(r, roleCol).getValue() || "").trim();
  if (!existingRole && role) sh.getRange(r, roleCol).setValue(role);

  const ca = sh.getRange(r, createdCol).getValue();
  if (!ca) sh.getRange(r, createdCol).setValue(new Date().toISOString());
}

/* =========================
   Sessions
========================= */

function createSession_(email){
  const token = uuid_() + uuid_();
  appendRow_(SHEETS.SESSIONS, [ token, email, new Date().toISOString(), new Date().toISOString() ]);
  return token;
}

function getSession_(token){
  if (!token) return { ok:false, error:"Missing token" };
  const sh = sheet_(SHEETS.SESSIONS);
  const r = findRowBy_(SHEETS.SESSIONS, "token", token);
  if (!r) return { ok:false, error:"Session not found" };
  const emailCol = colIndex_(sh, "email");
  const email = String(sh.getRange(r, emailCol).getValue() || "").toLowerCase().trim();
  return { ok:true, email };
}

function touchSession_(token){
  const sh = sheet_(SHEETS.SESSIONS);
  const r = findRowBy_(SHEETS.SESSIONS, "token", token);
  if (!r) return;
  const lastSeenCol = colIndex_(sh, "lastSeenAt");
  sh.getRange(r, lastSeenCol).setValue(new Date().toISOString());
}

/* =========================
   Innovations
========================= */

function existsInnovationId_(innovationId){
  const sh = sheet_(SHEETS.INNOVATIONS);
  const hs = headers_(sh);
  const idIdx = hs.indexOf("innovationId");
  if (idIdx < 0) return false;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;

  const data = sh.getRange(2,1,lastRow-1,hs.length).getValues();
  const target = String(innovationId||"").trim();
  return data.some(r => String(r[idIdx]||"").trim() === target);
}

function listInnovationsByOwner_(email){
  const sh = sheet_(SHEETS.INNOVATIONS);

  const hs = headers_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const data = sh.getRange(2,1,lastRow-1,hs.length).getValues();
  const idx = (name) => hs.indexOf(name);

  const ownerIdx = idx("ownerEmail");
  return data
    .filter(row => String(row[ownerIdx]||"").toLowerCase().trim() === String(email||"").toLowerCase().trim())
    .map(row => ({
      innovationId: row[idx("innovationId")] || "",
      tajuk: row[idx("tajuk")] || "",
      tahun: row[idx("tahun")] || "",
      kategori: row[idx("kategori")] || "",
      status: row[idx("status")] || "",
      myipoStatus: row[idx("myipoStatus")] || "",
      myipoNumber: row[idx("myipoNumber")] || "",
      ownerEmail: row[ownerIdx] || "",
      createdAt: row[idx("createdAt")] || "",
    }));
}

function listInnovationsForUser_(email){
  // owner innovations
  const owned = listInnovationsByOwner_(email);
  const ownedIds = new Set(owned.map(x => String(x.innovationId||"").trim()));

  // team member innovations
  ensureTeamSchema_();
  const teamIds = new Set(listTeamInnovationIdsForMember_(email));

  // merge ids
  const allIds = new Set([...ownedIds, ...teamIds]);
  if (!allIds.size) return [];

  // fetch innovations by ids
  const sh = sheet_(SHEETS.INNOVATIONS);
  const hs = headers_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const data = sh.getRange(2,1,lastRow-1,hs.length).getValues();
  const idx = (n)=>hs.indexOf(n);

  const idIdx = idx("innovationId");
  const ownerIdx = idx("ownerEmail");

  const items = data
    .filter(r => allIds.has(String(r[idIdx]||"").trim()))
    .map(r => ({
      innovationId: r[idx("innovationId")] || "",
      tajuk: r[idx("tajuk")] || "",
      tahun: r[idx("tahun")] || "",
      kategori: r[idx("kategori")] || "",
      status: r[idx("status")] || "",
      myipoStatus: r[idx("myipoStatus")] || "",
      myipoNumber: r[idx("myipoNumber")] || "",
      ownerEmail: r[ownerIdx] || "",
      createdAt: r[idx("createdAt")] || "",
    }));

  // optional: sort by createdAt desc
  items.sort((a,b)=> String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  return items;
}

/* =========================
   TeamMembers
========================= */

function ensureTeamSchema_(){
  const ss = ss_();
  let sh = ss.getSheetByName(SHEETS.TEAM);
  const required = [
    "teamId",
    "innovationId",
    "memberEmail",
    "memberName",
    "memberDept",
    "role",
    "addedByEmail",
    "addedAt"
  ];

  if (!sh){
    sh = ss.insertSheet(SHEETS.TEAM);
    sh.getRange(1,1,1,required.length).setValues([required]);
    return;
  }

  const hs = headers_(sh);
  const missing = required.filter(h => !hs.includes(h));
  if (missing.length){
    sh.getRange(1, hs.length+1, 1, missing.length).setValues([missing]);
  }
}

function appendTeamRow_(innovationId, memberEmail, memberName, memberDept, role, addedByEmail){
  const sh = sheet_(SHEETS.TEAM);
  const hs = headers_(sh);

  const rowObj = {
    teamId: uuid_(),
    innovationId: String(innovationId||"").trim(),
    memberEmail: String(memberEmail||"").toLowerCase().trim(),
    memberName: String(memberName||"").trim(),
    memberDept: String(memberDept||"").trim(),
    role: String(role||"member").toLowerCase().trim(),
    addedByEmail: String(addedByEmail||"").toLowerCase().trim(),
    addedAt: new Date().toISOString(),
  };

  const row = hs.map(h => rowObj[h] !== undefined ? rowObj[h] : "");
  sh.appendRow(row);
}

function listTeamMembers_(innovationId){
  const sh = sheet_(SHEETS.TEAM);
  const hs = headers_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const data = sh.getRange(2,1,lastRow-1,hs.length).getValues();
  const idx = (n)=>hs.indexOf(n);

  const invIdx = idx("innovationId");
  return data
    .filter(r => String(r[invIdx]||"").trim() === String(innovationId||"").trim())
    .map(r => ({
      teamId: r[idx("teamId")] || "",
      innovationId: r[invIdx] || "",
      memberEmail: r[idx("memberEmail")] || "",
      memberName: r[idx("memberName")] || "",
      memberDept: r[idx("memberDept")] || "",
      role: r[idx("role")] || "member",
      addedByEmail: r[idx("addedByEmail")] || "",
      addedAt: r[idx("addedAt")] || "",
    }));
}

function teamMemberExists_(innovationId, memberEmail){
  const sh = sheet_(SHEETS.TEAM);
  const hs = headers_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;

  const data = sh.getRange(2,1,lastRow-1,hs.length).getValues();
  const idx = (n)=>hs.indexOf(n);

  const inv = String(innovationId||"").trim();
  const me  = String(memberEmail||"").toLowerCase().trim();
  const invIdx = idx("innovationId");
  const emIdx  = idx("memberEmail");

  return data.some(r =>
    String(r[invIdx]||"").trim() === inv &&
    String(r[emIdx]||"").toLowerCase().trim() === me
  );
}

function removeTeamMemberRow_(innovationId, memberEmail){
  const sh = sheet_(SHEETS.TEAM);
  const hs = headers_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;

  const data = sh.getRange(2,1,lastRow-1,hs.length).getValues();
  const idx = (n)=>hs.indexOf(n);

  const invIdx = idx("innovationId");
  const emIdx  = idx("memberEmail");

  const inv = String(innovationId||"").trim();
  const me  = String(memberEmail||"").toLowerCase().trim();

  for (let i=0;i<data.length;i++){
    const r = data[i];
    if (String(r[invIdx]||"").trim() === inv &&
        String(r[emIdx]||"").toLowerCase().trim() === me) {
      sh.deleteRow(i+2);
      return true;
    }
  }
  return false;
}

function listTeamInnovationIdsForMember_(email){
  const sh = sheet_(SHEETS.TEAM);
  const hs = headers_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const data = sh.getRange(2,1,lastRow-1,hs.length).getValues();
  const idx = (n)=>hs.indexOf(n);

  const emIdx = idx("memberEmail");
  const invIdx = idx("innovationId");

  const me = String(email||"").toLowerCase().trim();
  const ids = [];
  for (const r of data){
    if (String(r[emIdx]||"").toLowerCase().trim() === me) {
      const inv = String(r[invIdx]||"").trim();
      if (inv) ids.push(inv);
    }
  }
  return Array.from(new Set(ids));
}

function isLeaderRole_(innovationId, email){
  const members = listTeamMembers_(innovationId);
  const me = String(email||"").toLowerCase().trim();
  const m = members.find(x => String(x.memberEmail||"").toLowerCase().trim() === me);
  if (!m) return false;
  const r = String(m.role||"").toLowerCase().trim();
  return (r === "leader" || r === "coleader" || r === "co-leader");
}

function countLeaders_(innovationId){
  const members = listTeamMembers_(innovationId);
  return members.filter(x => {
    const r = String(x.role||"").toLowerCase().trim();
    return (r === "leader" || r === "coleader" || r === "co-leader");
  }).length;
}

function canManageTeam_(innovationId, email){
  // owner OR leader/coLeader
  const ownedIds = new Set(listInnovationsByOwner_(email).map(x => String(x.innovationId||"").trim()));
  if (ownedIds.has(String(innovationId||"").trim())) return true;
  return isLeaderRole_(innovationId, email);
}

/* =========================
   Competitions
========================= */

function ensureCompetitionsSchema_(){
  const ss = ss_();
  let sh = ss.getSheetByName(SHEETS.COMPS);

  // We support legacy + new columns
  const required = [
    "competitionId",
    "innovationId",
    "namaEvent",
    "tahun",
    "peringkat",
    "pingat",
    "anugerahKhas",
    "namaAnugerahKhas",
    "createdByEmail",
    "createdAt"
  ];

  if (!sh){
    sh = ss.insertSheet(SHEETS.COMPS);
    sh.getRange(1,1,1,required.length).setValues([required]);
    return;
  }

  const hs = headers_(sh);
  const missing = required.filter(h => !hs.includes(h));
  if (missing.length){
    sh.getRange(1, hs.length+1, 1, missing.length).setValues([missing]);
  }
}

function listCompetitionsByOwner_(email){
  const sh = sheet_(SHEETS.COMPS);
  const hs = headers_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const data = sh.getRange(2,1,lastRow-1,hs.length).getValues();
  const idx = (name) => hs.indexOf(name);

  const ownerIdx = idx("createdByEmail");
  return data
    .filter(row => String(row[ownerIdx]||"").toLowerCase().trim() === String(email||"").toLowerCase().trim())
    .map(row => ({
      competitionId: row[idx("competitionId")] || "",
      innovationId: row[idx("innovationId")] || "",
      namaEvent: row[idx("namaEvent")] || "",
      tahun: row[idx("tahun")] || "",
      peringkat: row[idx("peringkat")] || "",
      pingat: row[idx("pingat")] || "",
      anugerahKhas: row[idx("anugerahKhas")] || "",
      namaAnugerahKhas: row[idx("namaAnugerahKhas")] || "",
      createdByEmail: row[ownerIdx] || "",
      createdAt: row[idx("createdAt")] || "",
    }));
}

function normalizePingat_(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || s === 'none' || s === 'tiada' || s === '-') return 'None';
  if (s.includes('bronze') || s.includes('gangsa')) return 'Bronze';
  if (s.includes('silver') || s.includes('perak')) return 'Silver';
  if (s.includes('gold') || s.includes('emas')) return 'Gold';
  if (s.includes('platinum')) return 'Platinum';
  return 'None';
}

function normalizePeringkat_(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s.includes('internal') || s.includes('dalaman')) return 'Internal';
  if (s.includes('daerah')) return 'Daerah';
  if (s.includes('negeri')) return 'Negeri';
  if (s.includes('kebangsaan') || s.includes('national')) return 'Kebangsaan';
  if (s.includes('antarabangsa') || s.includes('international')) return 'Antarabangsa';
  return 'Internal';
}

/* =========================
   Google Token Verify (ID Token)
========================= */
function verifyGoogleIdToken_(idToken){
  try{
    const url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken);
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions:true });
    if (res.getResponseCode() !== 200) return { ok:false, error:"tokeninfo invalid" };
    const j = JSON.parse(res.getContentText());
    return { ok:true, email: j.email || "", hd: j.hd || "", aud: j.aud || "" };
  } catch(err){
    return { ok:false, error:"verify failed" };
  }
}

/* =========================
   Utils
========================= */
function json_(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function uuid_(){
  return Utilities.getUuid().replace(/-/g,"");
}
