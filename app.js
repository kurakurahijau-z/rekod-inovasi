<!doctype html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tambah Inovasi</title>
  <script src="config.js"></script>
  <script src="app.js"></script>
  <style>
    :root{ --line:#e5e7eb; --muted:#64748b; --bg:#f8fafc; --text:#0f172a; }
    body{ margin:0; font-family: ui-sans-serif,system-ui,-apple-system; background:var(--bg); color:var(--text); }
    .wrap{ max-width:720px; margin:24px auto; padding:0 18px; }
    .card{ background:white; border:1px solid var(--line); border-radius:18px; padding:18px; }
    label{ font-size:13px; color:#334155; font-weight:700; display:block; margin-top:10px; }
    input,select{
      width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:12px; margin-top:6px;
      font-size:14px; background:white;
    }
    .row{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .btn{ margin-top:14px; padding:10px 14px; border-radius:12px; border:1px solid var(--line); background:#0f172a; color:white; font-weight:800; cursor:pointer; }
    .muted{ color:var(--muted); font-size:13px; }
    .top{ display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;}
  </style>
</head>
<body onload="addInnovationInit()">
  <div class="wrap">
    <div class="top">
      <div class="muted">Login: <b id="meEmail">-</b></div>
      <button class="btn" style="background:white;color:#0f172a;" onclick="location.href='./dashboard.html'">← Dashboard</button>
    </div>

    <div class="card">
      <h2 style="margin:0 0 4px;">Tambah Inovasi</h2>
      <div class="muted">Isi asas dulu. Nanti kita polish kosmetik lepas siap.</div>

      <form onsubmit="submitInnovation(event)">
        <label>Tajuk</label>
        <input id="tajuk" required />

        <div class="row">
          <div>
            <label>Tahun</label>
            <input id="tahun" value="2026" required />
          </div>
          <div>
            <label>Kategori</label>
            <select id="kategori" required>
              <option value="">-- pilih --</option>
              <option>PRODUK</option>
              <option>PROSES</option>
              <option>SISTEM</option>
              <option>MODUL</option>
              <option>LAIN-LAIN</option>
            </select>
          </div>
        </div>

        <div class="row">
          <div>
            <label>Status</label>
            <select id="status" required>
              <option>aktif</option>
              <option>tidak aktif</option>
            </select>
          </div>
          <div>
            <label>MyIPO Status</label>
            <select id="myipoStatus" required>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </div>
        </div>

        <label>MyIPO Number (jika ada)</label>
        <input id="myipoNumber" placeholder="contoh: LYC223456789" />

        <button class="btn" type="submit">Simpan</button>
        <div id="saveMsg" class="muted" style="margin-top:10px;"></div>
      </form>
    </div>
  </div>
</body>
</html>
