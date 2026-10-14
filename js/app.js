'use strict';
/**
 * ============================================================
 * SITH-One — Frontend (SPA murni, tanpa ?page=, tanpa window.location)
 * Semua navigasi lewat navigateTo(); data lewat fetch() ke GAS REST API.
 * ============================================================
 */

// ── State aplikasi (memori JS; token TIDAK pernah masuk URL) ──
const App = { token: null, user: null, config: {}, page: null, params: {}, history: [], data: null, charts: {}, chartSpecs: [], cleanup: null, ui: { pg: {}, rr: {}, group: 'siswa' }, seq: 0 };
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const fmtRp = n => 'Rp ' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtTgl = d => { if (!d) return ''; const p = String(d).split('-'); return +p[2] + ' ' + BULAN[+p[1] - 1].slice(0, 3) + ' ' + p[0]; };
const bulanLabel = b => { const p = String(b).split('-'); return BULAN[+p[1] - 1] + ' ' + p[0]; };
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const greet = () => { const h = +new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }); return h < 11 ? 'Pagi' : h < 15 ? 'Siang' : h < 18 ? 'Sore' : 'Malam'; };
const ROLE_LABEL = { siswa: 'Siswa / Wali Murid', guru: 'Guru Mapel', walikelas: 'Wali Kelas', piket: 'Petugas Piket', bendahara: 'Bendahara', bk: 'Guru BK / Kesiswaan', admin: 'Admin / Kepala Sekolah' };

// ── Navigasi per peran: [label, ikon, label pendek] ──
const NV = { home: ['Beranda', 'house', 'Beranda'], absensi: ['Absensi', 'calendar-check', 'Absen'], nilai: ['Nilai & Raport', 'mortarboard', 'Nilai'], inputnilai: ['Input Nilai', 'pencil-square', 'Input'],
  poin: ['Kedisiplinan & Poin', 'award', 'Poin'], keuangan: ['Keuangan & Tabungan', 'wallet2', 'Keuangan'], kelas: ['Tata Kelola Kelas', 'people', 'Kelas'], gate: ['Gate Scan', 'qr-code-scan', 'Scan'],
  master: ['Master Data', 'database', 'Data'], pengaturan: ['Pengaturan', 'gear', 'Atur'], info: ['Portal Informasi', 'megaphone', 'Info'], profil: ['Profil Saya', 'person', 'Profil'] };
const ROLE_NAV = {
  siswa: ['home', 'nilai', 'absensi', 'keuangan', 'poin', 'info', 'profil'], guru: ['home', 'inputnilai', 'absensi', 'info', 'profil'],
  walikelas: ['home', 'kelas', 'absensi', 'nilai', 'inputnilai', 'poin', 'info', 'profil'], piket: ['home', 'gate', 'absensi', 'info', 'profil'],
  bendahara: ['home', 'keuangan', 'info', 'profil'], bk: ['home', 'poin', 'info', 'profil'],
  admin: ['home', 'gate', 'absensi', 'nilai', 'poin', 'keuangan', 'kelas', 'master', 'pengaturan', 'info', 'profil']
};

// ── Pemanggil server via fetch (GAS-PRO-API) ──
async function callAPI(action, args) {
  args = args || [];
  try {
    const res = await fetch(window.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, args: args })
    });
    const result = await res.json();
    if (result && result.success) return result.data;
    if (result && result.code === 'SESSION' && App.token) forceLogout(result.message);
    throw new Error((result && result.message) || 'Terjadi kesalahan.');
  } catch (err) {
    if (err.message && err.message.indexOf('Failed to fetch') >= 0) throw new Error('Koneksi ke server gagal. Periksa koneksi internet Anda.');
    throw err;
  }
}
function api(fn) {
  const args = Array.prototype.slice.call(arguments, 1);
  return callAPI(fn, args);
}
const rpc = function (fn) { return callAPI(fn, [App.token].concat(Array.prototype.slice.call(arguments, 1))); };

// ── Tema ──
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t); document.documentElement.setAttribute('data-bs-theme', t);
  try { localStorage.setItem('sith_theme', t); } catch (e) {}
  document.querySelectorAll('.theme-fab i, .icon-btn.d-lg-none i, .sb-foot .bi-moon-stars, .sb-foot .bi-sun').forEach(i => { i.className = 'bi bi-' + (t === 'dark' ? 'sun' : 'moon-stars'); });
  const sl = document.querySelector('.sb-foot .sb-link span'); if (sl) sl.textContent = t === 'dark' ? 'Mode Terang' : 'Mode Gelap';
}
function toggleTheme() { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); App.chartSpecs.forEach(drawChart); }

// ── Komponen UI kecil ──
const tone = { Hadir: 'success', 'Tepat Waktu': 'success', Terlambat: 'warning', Izin: 'info', Sakit: 'info', Alpha: 'danger', Belum: 'muted', Lunas: 'success', 'Belum Lunas': 'danger', 'Menunggu Verifikasi': 'warning', Pelanggaran: 'danger', Prestasi: 'info' };
const icon = n => '<i class="bi bi-' + n + '" aria-hidden="true"></i>';
const chip = (t, k) => '<span class="chip chip-' + (k || tone[t] || 'muted') + '">' + esc(t === 'Belum' ? 'Belum Hadir' : t) + '</span>';
const avatar = (nama, foto, cls) => '<div class="avatar ' + (cls || '') + '" aria-hidden="true">' + (foto ? '<img src="' + esc(foto) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + esc(initials(nama)) + '</div>';
const empty = (ic, txt) => '<div class="empty">' + icon(ic) + '<div>' + esc(txt) + '</div></div>';
const pageHead = (t, s, right) => '<div class="page-head d-flex justify-content-between align-items-start gap-2"><div><h2>' + esc(t) + '</h2>' + (s ? '<p>' + esc(s) + '</p>' : '') + '</div>' + (right || '') + '</div>';
const waHref = w => 'https://wa.me/' + w.no + '?text=' + encodeURIComponent(w.msg);
const waBtn = (w, label, cls) => w && w.no ? '<a class="btn-x btn-success-x ' + (cls || '') + '" href="' + esc(waHref(w)) + '" target="_blank" rel="noopener">' + icon('whatsapp') + ' ' + esc(label || 'Kirim WA ke Orang Tua') + '</a>' : '<button class="btn-x btn-ghost ' + (cls || '') + '" disabled>' + icon('whatsapp') + ' Nomor WA kosong</button>';
function kpiHtml(k) {
  const inner = '<div class="kpi-top"><span>' + esc(k.label) + '</span><span class="kpi-icon tone-' + k.tone + '">' + icon(k.icon) + '</span></div><div class="kpi-val">' + esc(k.value) + '</div><div class="kpi-sub">' + esc(k.sub || '') + '</div>';
  return k.page ? '<button class="kpi" onclick="navigateTo(\'' + k.page + '\')">' + inner + '</button>' : '<div class="kpi">' + inner + '</div>';
}
const kpiGrid = list => '<div class="grid-kpi ' + ({ 2: 'k2', 3: 'k3', 5: 'k5' }[list.length] || '') + '">' + list.map(kpiHtml).join('') + '</div>';
const rekapCells = r => '<div class="rekap-grid"><div class="rekap-cell"><b>' + r.hadir + '</b>Hadir</div><div class="rekap-cell"><b>' + r.izin + '</b>Izin</div><div class="rekap-cell"><b>' + r.sakit + '</b>Sakit</div><div class="rekap-cell"><b>' + r.alpha + '</b>Belum/Alpha</div></div>';
const rekapBar = r => { const t = r.total || 1, p = x => (x / t * 100).toFixed(1) + '%'; return '<div class="rekap-bar" role="img" aria-label="Rekap kehadiran"><span class="rb-hadir" style="width:' + p(r.hadir) + '"></span><span class="rb-izin" style="width:' + p(r.izin) + '"></span><span class="rb-sakit" style="width:' + p(r.sakit) + '"></span><span class="rb-alpha" style="width:' + p(r.alpha) + '"></span></div>'; };
const selectHtml = (id, opts, val, onch, label) => '<select class="form-select" id="' + id + '" aria-label="' + esc(label) + '" onchange="' + onch + '">' + opts.map(o => { const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o; return '<option value="' + esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';

// ── Toast, modal, konfirmasi, tombol loading ──
function toast(title, msg, type) {
  const el = document.createElement('div'); el.className = 'toast border-0'; el.setAttribute('role', type === 'danger' ? 'alert' : 'status');
  el.innerHTML = '<div class="d-flex tone-' + ({ success: 'success', danger: 'danger', warning: 'warning' }[type] || 'primary') + '" style="border-radius:8px"><div class="toast-body"><b>' + esc(title) + '</b><br>' + esc(msg) + '</div><button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Tutup"></button></div>';
  $('toastBox').appendChild(el); el.addEventListener('hidden.bs.toast', () => el.remove());
  new bootstrap.Toast(el, { delay: 4500 }).show();
}
const modal = id => bootstrap.Modal.getOrCreateInstance($(id));
function showView(title, body, foot) { $('viewTitle').textContent = title; $('viewBody').innerHTML = body; $('viewFoot').innerHTML = foot || '<button type="button" class="btn-x btn-ghost" data-bs-dismiss="modal">Tutup</button>'; modal('viewModal').show(); }
function confirmBox(msg, fn, label) { $('confirmMsg').textContent = msg; $('confirmYes').textContent = label || 'Ya, lanjutkan'; $('confirmYes').onclick = () => { modal('confirmModal').hide(); fn(); }; modal('confirmModal').show(); }
function btnLoading(btn, on) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Memproses…'; btn.disabled = true; }
  else { if (btn.dataset.html) btn.innerHTML = btn.dataset.html; btn.disabled = false; }
}
function closeSheets() { const o = bootstrap.Offcanvas.getInstance($('moreMenu')); if (o) o.hide(); }

// ── Formulir generik (dipakai di banyak halaman) ──
function fieldHtml(f, v) {
  const id = 'f_' + f.name, req = f.req ? ' required' : '', val = v === undefined || v === null ? (f.value !== undefined ? f.value : '') : v;
  let inp;
  if (f.type === 'select') {
    const opts = f.options || [], groups = opts.some(o => o && o.g);
    const one = o => { const ov = typeof o === 'object' ? o.v : o, ol = typeof o === 'object' ? o.l : (o === '' ? '— Pilih —' : o); return '<option value="' + esc(ov) + '"' + (String(ov) === String(val) ? ' selected' : '') + '>' + esc(ol) + '</option>'; };
    let body = '<option value="">— Pilih —</option>';
    if (groups) { const g = {}; opts.forEach(o => { (g[o.g] = g[o.g] || []).push(o); }); body += Object.keys(g).map(k => '<optgroup label="' + esc(k) + '">' + g[k].map(one).join('') + '</optgroup>').join(''); } else body += opts.filter(o => o !== '').map(one).join('');
    inp = '<select class="form-select" id="' + id + '"' + req + '>' + body + '</select>';
  } else if (f.type === 'textarea') inp = '<textarea class="form-control" id="' + id + '" rows="3"' + req + ' maxlength="' + (f.max || 500) + '">' + esc(val) + '</textarea>';
  else if (f.type === 'file') inp = '<input type="file" class="form-control" id="' + id + '" accept="' + (f.accept || 'image/*,application/pdf') + '"' + req + '>';
  else inp = '<input type="' + (f.type || 'text') + '" class="form-control" id="' + id + '" value="' + esc(val) + '"' + req + (f.min !== undefined ? ' min="' + f.min + '"' : '') + (f.max !== undefined && f.type === 'number' ? ' max="' + f.max + '"' : '') + (f.type === 'number' ? ' step="' + (f.step || 'any') + '" inputmode="decimal"' : '') + (f.type === 'tel' ? ' inputmode="tel"' : '') + ' autocomplete="off">';
  return '<div class="mb-3"><label class="form-label fw-600" for="' + id + '">' + esc(f.label) + (f.req ? ' <span class="text-danger-x" aria-hidden="true">*</span>' : '') + '</label>' + inp + (f.help ? '<div class="form-text">' + esc(f.help) + '</div>' : '') + '</div>';
}
function openForm(o) {
  App.form = o;
  $('formTitle').textContent = o.title;
  $('formBody').innerHTML = (o.intro ? '<p class="muted">' + esc(o.intro) + '</p>' : '') + o.fields.map(f => fieldHtml(f, (o.values || {})[f.name])).join('');
  const b = $('formSubmit'); b.textContent = o.submitText || 'Simpan'; b.className = 'btn-x ' + (o.danger ? 'btn-danger-x' : 'btn-primary-x'); b.disabled = false;
  modal('formModal').show();
}
async function submitForm(ev) {
  ev.preventDefault();
  const o = App.form, form = $('formEl');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const btn = $('formSubmit'), vals = {};
  btnLoading(btn, true);
  try {
    for (const f of o.fields) {
      const el = $('f_' + f.name);
      vals[f.name] = f.type === 'file' ? (el.files[0] ? await filePayload(el.files[0]) : null) : el.value;
    }
    await o.onSubmit(vals);
    modal('formModal').hide();
  } catch (e) { toast('Gagal', e.message, 'danger'); }
  finally { btnLoading(btn, false); }
}
function filePayload(file) {
  return new Promise((res, rej) => {
    if (file.size > 8 * 1024 * 1024) return rej(new Error('Ukuran berkas maksimal 8 MB.'));
    const r = new FileReader();
    if (file.type.indexOf('image/') === 0) {
      r.onload = () => { const img = new Image(); img.onload = () => { const k = Math.min(1, 1280 / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); res({ data: cv.toDataURL('image/jpeg', .82).split(',')[1], name: file.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg' }); }; img.onerror = () => rej(new Error('Gambar tidak dapat dibaca.')); img.src = r.result; };
    } else if (file.type === 'application/pdf') {
      if (file.size > 4.5 * 1024 * 1024) return rej(new Error('PDF maksimal 4,5 MB.'));
      r.onload = () => res({ data: r.result.split(',')[1], name: file.name, type: file.type });
    } else return rej(new Error('Hanya gambar atau PDF yang diperbolehkan.'));
    r.readAsDataURL(file);
  });
}

// ── Berkas: pratinjau & unduh (modal, tidak pernah membuka tab/mengubah URL) ──
function b64Url(b64, mime) { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([u8], { type: mime })); }
function downloadB64(name, mime, b64) { const a = document.createElement('a'); a.href = b64Url(b64, mime); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
async function previewFile(id) {
  try {
    const f = await rpc('getFilePreview', id), url = b64Url(f.data, f.mime);
    const body = f.mime.indexOf('image/') === 0 ? '<img src="' + url + '" class="img-fluid rounded" alt="Pratinjau berkas">' : '<iframe src="' + url + '" style="width:100%;height:65vh;border:0" title="Pratinjau berkas"></iframe>';
    showView(f.name, body, '<a class="btn-x btn-soft" href="' + url + '" download="' + esc(f.name) + '">' + icon('download') + ' Unduh</a><button type="button" class="btn-x btn-ghost" data-bs-dismiss="modal">Tutup</button>');
  } catch (e) { toast('Gagal', e.message, 'danger'); }
}
async function unduhPdf(kind, params, btn) {
  btnLoading(btn, true);
  try { const f = await rpc('exportPdf', kind, params); downloadB64(f.name, f.mime, f.data); toast('Berhasil', 'Dokumen PDF diunduh.', 'success'); }
  catch (e) { toast('Gagal', e.message, 'danger'); } finally { btnLoading(btn, false); }
}
function printHtml(html) { $('printArea').innerHTML = html; setTimeout(() => window.print(), 80); }
function copyText(t) { try { navigator.clipboard.writeText(t).then(() => toast('Disalin', t, 'success')); } catch (e) { toast('Salin manual', t, 'warning'); } }

// ── Grafik (Chart.js) mengikuti tema ──
function drawChart(s) {
  const cv = $(s.id); if (!cv || !window.Chart) return;
  if (App.charts[s.id]) App.charts[s.id].destroy();
  const dark = document.documentElement.getAttribute('data-theme') === 'dark', txt = dark ? '#B6C2D9' : '#475569', grid = dark ? '#26324D' : '#E2E8F0';
  const cols = ['#2563EB', '#F59E0B', '#16A34A', '#EF4444', '#8FA7FE', '#4059AA'], dn = s.type === 'doughnut';
  const short = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace('.0', '') + ' jt' : v >= 1e3 ? Math.round(v / 1e3) + ' rb' : v;
  App.charts[s.id] = new Chart(cv, { type: s.type, data: { labels: s.labels, datasets: s.datasets.map((d, i) => ({ label: d.label, data: d.data, backgroundColor: dn ? cols : s.type === 'line' ? 'rgba(37,99,235,.12)' : cols[i % cols.length], borderColor: s.type === 'line' ? cols[i] : dark ? '#111A2E' : '#fff', borderWidth: dn ? 2 : s.type === 'line' ? 2.5 : 0, tension: .35, fill: s.type === 'line', borderRadius: 6, pointRadius: 3 })) },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: dn || s.datasets.length > 1, position: 'bottom', labels: { color: txt, usePointStyle: true } }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + (s.money ? fmtRp(c.parsed.y !== undefined ? c.parsed.y : c.parsed) : c.formattedValue) } } },
      scales: dn ? {} : { x: { ticks: { color: txt }, grid: { display: false } }, y: { beginAtZero: true, max: s.max, ticks: { color: txt, callback: v => s.money ? short(v) : v }, grid: { color: grid } } } } });
}
function drawCharts(list) { App.chartSpecs = list || []; App.chartSpecs.forEach(drawChart); }
const chartCard = s => '<div class="card-x"><div class="card-title"><h3>' + esc(s.title) + '</h3></div><div class="chart-box"><canvas id="' + s.id + '" role="img" aria-label="' + esc(s.title) + '"></canvas></div></div>';

// ── Paginasi sisi klien ──
function pager(key, total, size, rerender) {
  App.ui.rr[key] = rerender; const pg = App.ui.pg[key] || 1, pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return '';
  return '<div class="pager"><button class="btn-x btn-ghost btn-sm-x" ' + (pg <= 1 ? 'disabled' : '') + ' onclick="goPg(\'' + key + '\',' + (pg - 1) + ')">Sebelumnya</button><span>' + pg + ' dari ' + pages + ' halaman</span><button class="btn-x btn-primary-x btn-sm-x" ' + (pg >= pages ? 'disabled' : '') + ' onclick="goPg(\'' + key + '\',' + (pg + 1) + ')">Selanjutnya</button></div>';
}
function goPg(k, n) { App.ui.pg[k] = n; if (App.ui.rr[k]) App.ui.rr[k](); }
const slicePg = (key, arr, size) => { const pg = Math.min(App.ui.pg[key] || 1, Math.max(1, Math.ceil(arr.length / size))); App.ui.pg[key] = pg; return arr.slice((pg - 1) * size, pg * size); };

// ============================================================
// SESI, LOGIN, KERANGKA
// ============================================================
function hideBoot() { const b = $('boot'); if (b) { b.classList.add('hide'); setTimeout(() => { b.style.display = 'none'; }, 300); } }
function applyConfig(c) {
  App.config = c || {};
  const name = c.appName || 'SITH-One'; $('sbName').textContent = name; $('tbName').textContent = name; document.title = name;
  ['sbLogo', 'tbLogo'].forEach(id => { $(id).innerHTML = c.logoUrl ? '<img src="' + esc(c.logoUrl) + '" alt="" onerror="this.remove()">' : 'S1'; });
}
function showLogin() {
  document.body.classList.add('auth'); App.token = null; App.page = null; App.history = [];
  if (App.cleanup) { try { App.cleanup(); } catch (e) {} App.cleanup = null; }
  $('app-container').innerHTML = loginHtml(); hideBoot(); applyTheme(document.documentElement.getAttribute('data-theme'));
}
const LOGIN_HINT = { siswa: 'Masuk dengan NIS dan kata sandi Anda.', ortu: 'Wali murid masuk dengan NIS anak dan kata sandi yang diberikan sekolah.', guru: 'Guru, wali kelas, piket, bendahara, dan BK masuk dengan username staf.', admin: 'Khusus admin dan kepala sekolah.' };
function loginHtml() {
  const g = App.ui.group;
  return '<div class="login-wrap"><div class="login-card"><div class="text-center mb-3"><div class="brand-mark">' + (App.config.logoUrl ? '<img src="' + esc(App.config.logoUrl) + '" alt="">' : icon('mortarboard')) + '</div><h1 class="h3 mb-1">' + esc(App.config.appName || 'SITH-One') + '</h1><p class="muted mb-0">Sistem Informasi Terpadu Sekolah</p></div>' +
    '<div class="seg" role="tablist" aria-label="Jenis pengguna">' + [['siswa', 'Siswa'], ['ortu', 'Orang Tua'], ['guru', 'Guru'], ['admin', 'Admin']].map(t => '<button type="button" role="tab" class="seg-btn ' + (g === t[0] ? 'active' : '') + '" onclick="setGroup(\'' + t[0] + '\')">' + t[1] + '</button>').join('') + '</div>' +
    '<form onsubmit="submitLogin(event)" novalidate><div id="loginErr" role="alert"></div>' +
    '<label class="form-label fw-600" for="lgUser">NIS / Email / Username</label><div class="field-icon mb-3"><i class="bi bi-person" aria-hidden="true"></i><input class="form-control" id="lgUser" autocomplete="username" autocapitalize="none" placeholder="Masukkan NIS atau username" required></div>' +
    '<div class="d-flex justify-content-between"><label class="form-label fw-600" for="lgPass">Kata Sandi</label><button type="button" class="link-btn p-0" style="min-height:0" onclick="toast(\'Lupa kata sandi?\',\'Hubungi admin sekolah untuk mereset kata sandi Anda.\')">Lupa password?</button></div>' +
    '<div class="field-icon mb-3"><i class="bi bi-lock" aria-hidden="true"></i><input class="form-control" type="password" id="lgPass" autocomplete="current-password" placeholder="••••••••" required><button type="button" class="eye" aria-label="Tampilkan kata sandi" onclick="togglePass()"><i class="bi bi-eye"></i></button></div>' +
    '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="lgRem"><label class="form-check-label" for="lgRem">Ingat perangkat ini selama 30 hari</label></div>' +
    '<button class="btn-x btn-primary-x btn-block" id="lgBtn" type="submit">Masuk ke Portal ' + icon('arrow-right') + '</button></form>' +
    '<p class="small-x muted text-center mt-3 mb-1" id="lgHint">' + LOGIN_HINT[g] + '</p><p class="text-center mb-0">Mengalami kendala saat akses?<br><button type="button" class="link-btn" onclick="toast(\'Hubungi Admin\',\'Silakan temui admin atau tata usaha sekolah.\')">Hubungi Admin Sekolah</button></p></div></div>';
}
function setGroup(g) { App.ui.group = g; const u = $('lgUser') ? $('lgUser').value : ''; $('app-container').innerHTML = loginHtml(); if (u) $('lgUser').value = u; }
function togglePass() { const i = $('lgPass'); i.type = i.type === 'password' ? 'text' : 'password'; }
async function submitLogin(ev) {
  ev.preventDefault();
  const u = $('lgUser').value.trim(), p = $('lgPass').value, btn = $('lgBtn'), err = $('loginErr'); err.innerHTML = '';
  if (!u || !p) { err.innerHTML = '<div class="err-box">' + icon('exclamation-circle') + '<span>Isi NIS/username dan kata sandi.</span></div>'; return; }
  btnLoading(btn, true);
  try {
    const d = await api('doLogin', u, p, App.ui.group, $('lgRem').checked);
    App.token = d.token;
    try { if ($('lgRem').checked) localStorage.setItem('sith_token', d.token); else localStorage.removeItem('sith_token'); } catch (e) {}
    startSession(d);
  } catch (e) { btnLoading(btn, false); err.innerHTML = '<div class="err-box">' + icon('exclamation-circle') + '<span>' + esc(e.message) + '</span></div>'; }
}
function startSession(d) {
  App.user = d.user; applyConfig(d.config || {});
  document.body.classList.remove('auth');
  $('tbAvatar').textContent = initials(d.user.nama); $('sbRole').textContent = ROLE_LABEL[d.user.role] || '';
  renderChrome(); applyTheme(document.documentElement.getAttribute('data-theme'));
  navigateTo('home', {}, { noHistory: true }); hideBoot();
}
function forceLogout(msg) { try { localStorage.removeItem('sith_token'); } catch (e) {} showLogin(); toast('Sesi berakhir', msg || 'Silakan masuk kembali.', 'warning'); }
function doLogout() {
  try { localStorage.removeItem('sith_token'); } catch (e) {}
  Object.keys(App.charts).forEach(k => { try { App.charts[k].destroy(); } catch (e) {} }); App.charts = {};
  App.user = null; showLogin(); toast('Sampai jumpa', 'Anda telah keluar.', 'success');
}
function renderChrome() {
  const items = ROLE_NAV[App.user.role] || ['home', 'profil'];
  $('sideNav').innerHTML = items.map(k => '<button class="sb-link" data-page="' + k + '" onclick="navigateTo(\'' + k + '\')">' + icon(NV[k][1]) + '<span>' + NV[k][0] + '</span></button>').join('');
  const bn = (k) => '<button class="bn-item" data-page="' + k + '" onclick="navigateTo(\'' + k + '\')" aria-label="' + NV[k][0] + '">' + icon(NV[k][1]) + '<span>' + NV[k][2] + '</span></button>';
  if (items.length <= 5) { $('bottomNav').innerHTML = items.map(bn).join(''); }
  else {
    $('bottomNav').innerHTML = items.slice(0, 4).map(bn).join('') + '<button class="bn-item" id="bnMore" aria-label="Menu lainnya" onclick="bootstrap.Offcanvas.getOrCreateInstance($(\'moreMenu\')).show()">' + icon('grid') + '<span>Lainnya</span></button>';
    $('moreList').innerHTML = items.slice(4).map(k => '<button class="more-item" onclick="navigateTo(\'' + k + '\')">' + icon(NV[k][1]) + '<span>' + NV[k][0] + '</span></button>').join('') + '<button class="more-item" onclick="closeSheets();doLogout()">' + icon('box-arrow-left') + '<span>Keluar</span></button>';
  }
}
function updateActiveNav(page) {
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  const items = ROLE_NAV[App.user ? App.user.role : 'siswa'] || [], m = $('bnMore');
  if (m) m.classList.toggle('active', items.indexOf(page) >= 4);
}

// ============================================================
// ROUTER SPA — satu-satunya cara berpindah halaman
// ============================================================
const PAGES = {}, INIT = {};
function navigateTo(page, params, opts) {
  opts = opts || {}; params = params || {};
  if (!App.token) { showLogin(); return; }
  if (App.cleanup) { try { App.cleanup(); } catch (e) {} App.cleanup = null; }
  if (App.page && !opts.noHistory && (App.page !== page)) App.history.push({ page: App.page, params: App.params });
  if (App.history.length > 30) App.history.shift();
  App.page = page; App.params = params; updateActiveNav(page); closeSheets();
  $('pageTitle').textContent = NV[page] ? NV[page][0] : '';
  const my = ++App.seq;
  $('app-container').innerHTML = '<div class="skeleton" style="height:120px;margin:8px 0 16px"></div><div class="grid-kpi"><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div></div><div class="skeleton" style="height:220px"></div>';
  rpc('getPageData', page, params).then(d => {
    if (my !== App.seq) return;
    App.data = d; $('app-container').innerHTML = PAGES[page](d);
    if (INIT[page]) INIT[page](d);
    window.scrollTo(0, 0);
  }).catch(e => {
    if (my !== App.seq) return;
    $('app-container').innerHTML = '<div class="card-x">' + empty('exclamation-triangle', e.message) + '<div class="text-center"><button class="btn-x btn-primary-x" onclick="reload()">Coba Lagi</button></div></div>';
  });
}
const reload = () => navigateTo(App.page, App.params, { noHistory: true });
const setParam = (k, v) => { const p = Object.assign({}, App.params); p[k] = v; if (k === 'kelas' || k === 'mapel' || k === 'kategori') { if (k !== 'judul') delete p.judul; } navigateTo(App.page, p, { noHistory: true }); };
function goBack() { const h = App.history.pop(); if (h) navigateTo(h.page, h.params, { noHistory: true }); else navigateTo('home', {}, { noHistory: true }); }

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  let th = 'light'; try { th = localStorage.getItem('sith_theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
  applyTheme(th);
  let t = null; try { t = localStorage.getItem('sith_token'); } catch (e) {}
  if (!t) { showLogin(); return; }
  api('resumeSession', t).then(d => { App.token = t; startSession(d); }).catch(() => { try { localStorage.removeItem('sith_token'); } catch (e) {} showLogin(); });
});

// ============================================================
// HALAMAN: BERANDA
// ============================================================
const annIcon = { Pengumuman: ['megaphone', 'info'], Agenda: ['calendar-event', 'warning'], Ujian: ['journal-text', 'primary'], Persetujuan: ['clipboard-check', 'success'], Galeri: ['images', 'info'] };
const tagTone = { Absen: 'danger', Disiplin: 'danger', Akademik: 'warning', SPP: 'warning' };
function annRow(a) {
  const ai = annIcon[a.kategori] || ['megaphone', 'info'], txt = String(a.isi || '');
  return '<div class="ann-row"><span class="kpi-icon tone-' + ai[1] + '">' + icon(ai[0]) + '</span><div class="row-main"><div class="d-flex justify-content-between gap-2"><div class="row-title">' + esc(a.judul) + '</div><span class="small-x muted flex-none">' + fmtTgl(a.tanggal) + '</span></div><div class="row-sub" style="font-size:13px">' + esc(txt.slice(0, 110)) + (txt.length > 110 ? '…' : '') + '</div><button class="link-btn p-0" style="min-height:32px" onclick="showAnn(\'' + a.id + '\')">Detail ' + esc(a.kategori) + ' →</button></div></div>';
}
function showAnn(id) {
  const d = App.data, a = [].concat(d.announcements || [], d.pengumuman || [], d.agenda || [], d.galeri || []).find(x => x.id === id); if (!a) return;
  showView(a.judul, '<div class="mb-2">' + chip(a.kategori, 'primary') + ' <span class="muted small-x">' + fmtTgl(a.tanggal) + ' • ' + esc(a.pembuat) + '</span></div>' + (a.foto ? '<img class="img-fluid rounded mb-3" src="' + esc(a.foto) + '" alt="" loading="lazy">' : '') + '<p style="white-space:pre-wrap">' + esc(a.isi) + '</p>');
}
function timelineHtml(list) {
  return '<div class="timeline">' + list.map(s => '<div class="tl-item ' + s.state + '"><span class="tl-dot">' + icon(s.state === 'selesai' ? 'check' : s.state === 'berlangsung' ? 'record-circle' : 'clock') + '</span><div class="tl-body"><div class="small-x muted">' + esc(s.mulai) + ' - ' + esc(s.selesai) + ' WIB' + (s.state === 'berlangsung' ? ' • Berlangsung' : '') + '</div><div class="row-title">' + esc(s.mapel) + '</div><div class="row-sub">' + esc(s.guru) + ' • ' + esc(s.ruang) + '</div></div>' + (s.state !== 'berlangsung' ? chip(s.state === 'selesai' ? 'Selesai' : 'Akan Datang', 'muted') : chip('Berlangsung', 'primary')) + '</div>').join('') + '</div>';
}
const SUB = { walikelas: 'Ringkasan aktivitas kelas dan laporan kehadiran hari ini.', guru: 'Jadwal mengajar dan ringkasan nilai mata pelajaran Anda.', piket: 'Pantau aktivitas gerbang dan presensi siswa hari ini.', bendahara: 'Ringkasan tagihan SPP, pembayaran, dan tabungan siswa.', bk: 'Pantau kedisiplinan, prestasi, dan siswa yang perlu perhatian.', admin: 'Statistik terpadu seluruh modul sekolah.' };
PAGES.home = d => {
  let h = '';
  if (d.role === 'siswa') {
    const s = d.siswa, st = d.hero.status;
    h += '<div class="card-x profile-card mt-2">' + avatar(s.nama, s.foto, 'lg') + '<div class="row-main"><div class="d-flex justify-content-between align-items-start gap-2"><div class="row-title h5 mb-0">' + esc(s.nama) + '</div>' + chip('Aktif', 'primary') + '</div><div class="row-sub">' + esc(s.kelas) + ' • NISN: ' + esc(s.nisn) + '</div><div class="small-x fw-600" style="color:var(--link)">' + icon('patch-check') + ' ' + esc(d.sekolah) + '</div></div></div>' +
      '<div class="hero"><div class="hero-top"><span>KEHADIRAN HARI INI</span>' + chip(st + (d.hero.jam !== '-' ? ' (' + d.hero.jam + ')' : ''), st === 'Hadir' ? 'success' : st === 'Terlambat' ? 'warning' : 'muted') + '</div><div class="hero-date">' + esc(d.hari) + ', ' + fmtTgl(d.tanggal) + '</div><div class="hero-meta"><span>' + icon('clock') + ' Jam Masuk: ' + esc(d.hero.jamMasuk) + ' WIB</span><span>' + icon('geo-alt') + ' ' + esc(d.hero.lokasi) + '</span></div></div>';
  } else {
    h += '<div class="page-head"><div class="small-x fw-600" style="color:var(--link);letter-spacing:.04em">SEMESTER ' + esc(d.semester.toUpperCase()) + '</div><h2>Selamat ' + greet() + ', ' + esc(d.nama) + '</h2><p>' + esc(SUB[d.role] || '') + (d.kelas ? ' <span class="chip chip-primary ms-1">' + esc(d.kelas) + '</span>' : '') + '</p></div>';
  }
  if (d.kpis && d.kpis.length) h += kpiGrid(d.kpis);
  if (d.rekap) h += '<div class="card-x"><div class="card-title"><h3>Rekap Absensi Hari Ini</h3><button class="link-btn" onclick="navigateTo(\'absensi\')">Detail</button></div>' + rekapBar(d.rekap) + rekapCells(d.rekap) + '</div>';
  if (d.quick && d.quick.length) h += '<h3 class="h6 fw-600 mb-2">Aksi Cepat</h3><div class="quick-grid">' + d.quick.map(q => '<button class="quick-item ' + (q.wide ? 'wide' : '') + '" onclick="navigateTo(\'' + q.page + '\')"><span class="kpi-icon tone-primary">' + icon(q.icon) + '</span>' + esc(q.label) + '</button>').join('') + '</div>';
  if (d.insights && d.insights.length) h += '<div class="insight"><h3>' + icon('stars') + ' Analisis Otomatis</h3><ul>' + d.insights.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul></div>';
  if (d.charts && d.charts.length) h += '<div class="grid-2">' + d.charts.map(chartCard).join('') + '</div>';
  if (d.attention && d.attention.length) h += '<div class="card-title mt-2"><h3 class="h6 fw-600 mb-0">Perhatian Khusus</h3>' + chip(d.attention.length + ' Siswa', 'danger') + '</div><div class="grid-2">' + d.attention.map(a => '<div class="card-x att-card mb-0"><div class="att-top">' + avatar(a.nama, '', 'sm') + '<div class="row-main"><div class="row-title">' + esc(a.nama) + ' <span class="small-x muted">' + esc(a.kelas) + '</span></div><div class="small-x fw-600" style="color:var(--c-danger-fg)">' + esc(a.judul) + '</div></div>' + chip(a.tag, tagTone[a.tag] || 'muted') + '</div><p>' + esc(a.isi) + '</p>' + waBtn(a.wa, 'Kirim Pesan Orang Tua', 'btn-block') + '</div>').join('') + '</div><div class="mb-3"></div>';
  if (d.recent) h += '<div class="card-x flush"><div class="card-title" style="padding:16px 16px 0"><h3>Aktivitas Gerbang Terbaru</h3></div>' + recentList(d.recent) + '</div>';
  h += '<div class="grid-2">';
  h += '<div class="card-x"><div class="card-title"><h3>' + (d.role === 'walikelas' ? 'Pengumuman & Persetujuan' : 'Pengumuman Terbaru') + '</h3><button class="link-btn" onclick="navigateTo(\'info\')">Semua</button></div>' + (d.announcements.length ? d.announcements.map(annRow).join('') : empty('megaphone', 'Belum ada pengumuman.')) + '</div>';
  if (d.schedule) h += '<div class="card-x"><div class="card-title"><h3>Jadwal Pelajaran Hari Ini</h3><span class="small-x muted">' + d.schedule.filter(s => s.state === 'selesai').length + ' dari ' + d.schedule.length + ' selesai</span></div>' + (d.schedule.length ? timelineHtml(d.schedule) : empty('cup-hot', 'Tidak ada jadwal hari ini.')) + '</div>';
  return h + '</div>';
};
INIT.home = d => drawCharts(d.charts);

// ============================================================
// HALAMAN: GATE SCAN (piket & admin)
// ============================================================
const ICON_J = { Masuk: 'box-arrow-in-right', Dhuha: 'brightness-high', Dzuhur: 'sun', Pulang: 'box-arrow-right' };
function recentList(arr) {
  if (!arr.length) return empty('clock-history', 'Belum ada aktivitas hari ini.');
  return arr.map(r => '<div class="list-row">' + avatar(r.nama, '', 'sm') + '<div class="row-main"><div class="row-title">' + esc(r.nama) + '</div><div class="row-sub">' + esc(r.kelas) + ' • ' + esc(r.jenis) + '</div></div><div class="row-end">' + chip(r.status) + '<div class="small-x muted">' + esc(r.waktu) + '</div></div></div>').join('');
}
PAGES.gate = d => '<div class="gate-hero mt-2"><span class="chip">' + icon('upc-scan') + ' SITH-ONE GATE TERMINAL</span><div class="clock" id="gClock" role="timer">--:--:--</div><div class="tgl" id="gDate"></div></div>' +
  '<div class="seg seg-grid" role="tablist" aria-label="Jenis presensi">' + ['Masuk', 'Dhuha', 'Dzuhur', 'Pulang'].map(j => '<button type="button" role="tab" class="seg-btn ' + (j === d.defaultJenis ? 'active' : '') + '" data-j="' + j + '" onclick="setGateJenis(\'' + j + '\')">' + icon(ICON_J[j]) + ' ' + j + '</button>').join('') + '</div>' +
  (d.modeUji ? '<div class="note-box warn">' + icon('info-circle') + '<div><b>Mode Uji aktif</b>Jam operasional diabaikan. Nonaktifkan di Pengaturan saat penggunaan resmi.</div></div>' : '') +
  '<div class="scanner" id="scanBox"><div class="scan-idle" id="scanIdle"><i class="bi bi-qr-code-scan" aria-hidden="true"></i><p class="mb-3">Arahkan kartu QR ke kamera<br><span class="small-x" style="opacity:.8">Sistem siap memindai otomatis</span></p><button class="btn-x btn-primary-x" onclick="startScanner()">' + icon('camera') + ' Aktifkan Kamera</button></div><div id="qrReader"></div></div>' +
  '<form class="card-x" onsubmit="manualScan(event)"><label class="form-label fw-600" for="gManual">Input manual / pemindai barcode</label><div class="d-flex gap-2"><input class="form-control" id="gManual" placeholder="Ketik NIS atau kode kartu lalu Enter" autocomplete="off" inputmode="text"><button class="btn-x btn-primary-x" type="submit">Catat</button></div></form>' +
  '<div id="gateResult" aria-live="polite"></div><div class="card-x flush"><div class="card-title" style="padding:16px 16px 0"><h3>Aktivitas Terbaru Hari Ini</h3></div><div id="gRecent">' + recentList(d.recent) + '</div></div>';
INIT.gate = d => {
  const G = App.gate = { jenis: d.defaultJenis, last: '', lastAt: 0, busy: false, sc: null, timer: null, recent: d.recent.slice() };
  const tick = () => { const n = new Date(); if ($('gClock')) { $('gClock').textContent = n.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }).replace(/\./g, ':') + ' WIB'; $('gDate').textContent = n.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } };
  tick(); G.timer = setInterval(tick, 1000);
  App.cleanup = () => { clearInterval(G.timer); stopScanner(); };
  setTimeout(() => { if ($('gManual')) $('gManual').focus(); }, 150);
};
function setGateJenis(j) { App.gate.jenis = j; document.querySelectorAll('.seg-btn[data-j]').forEach(b => b.classList.toggle('active', b.dataset.j === j)); }
function stopScanner() { const G = App.gate; if (G && G.sc) { const sc = G.sc; G.sc = null; sc.stop().then(() => sc.clear()).catch(() => {}); } }
async function startScanner() {
  const G = App.gate;
  if (!window.Html5Qrcode) { toast('Pemindai tidak tersedia', 'Pustaka pemindai gagal dimuat. Gunakan input manual.', 'warning'); return; }
  $('scanIdle').style.display = 'none';
  try {
    G.sc = new Html5Qrcode('qrReader');
    await G.sc.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, txt => { if (txt === G.last && Date.now() - G.lastAt < 4000) return; G.last = txt; G.lastAt = Date.now(); doScan(txt); }, () => {});
  } catch (e) { G.sc = null; $('scanIdle').style.display = ''; toast('Kamera tidak dapat dibuka', 'Izinkan akses kamera di browser, atau pakai input manual. Jika tampil di iframe, pastikan iframe memiliki allow="camera".', 'warning'); }
}
function manualScan(ev) { ev.preventDefault(); const i = $('gManual'), v = i.value.trim(); if (!v) return; i.value = ''; doScan(v); i.focus(); }
async function doScan(code) {
  const G = App.gate; if (!G || G.busy) return; G.busy = true;
  try {
    const r = await rpc('scanPresensi', code, G.jenis), s = r.siswa;
    $('gateResult').innerHTML = '<div class="result-card ok"><div class="d-flex gap-3 align-items-center">' + avatar(s.nama, s.foto, 'lg') + '<div class="row-main"><div class="row-title h5 mb-1">' + esc(s.nama) + '</div><div class="row-sub">NISN: ' + esc(s.nisn) + '</div>' + chip(s.kelas, 'primary') + '</div>' + chip(r.status) + '</div>' +
      '<dl class="kv"><dt>Jenis</dt><dd>' + esc(r.jenis) + '</dd><dt>Waktu Scan</dt><dd>' + esc(r.waktu.slice(0, 5)) + ' WIB</dd><dt>Lokasi Gerbang</dt><dd>' + esc(r.lokasi) + '</dd></dl>' + waBtn(r.wa, 'Kirim WA ke Orang Tua', 'btn-block') + '<button class="btn-x btn-ghost btn-block mt-2" onclick="$(\'gateResult\').innerHTML=\'\';$(\'gManual\').focus()">' + icon('arrow-repeat') + ' Scan Siswa Berikutnya</button></div>';
    if (navigator.vibrate) navigator.vibrate(60);
    G.recent.unshift({ nama: s.nama, kelas: s.kelas, jenis: r.jenis, waktu: r.waktu.slice(0, 5), status: r.status }); G.recent = G.recent.slice(0, 8);
    $('gRecent').innerHTML = recentList(G.recent);
  } catch (e) {
    $('gateResult').innerHTML = '<div class="result-card bad" role="alert"><div class="d-flex gap-2">' + icon('x-octagon') + '<div><b>Scan ditolak</b><div>' + esc(e.message) + '</div></div></div></div>';
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
  } finally { G.busy = false; }
}

// ============================================================
// HALAMAN: ABSENSI
// ============================================================
const shiftBulan = (b, n) => { const p = b.split('-').map(Number), dt = new Date(p[0], p[1] - 1 + n, 1); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'); };
PAGES.absensi = d => {
  if (d.mode === 'siswa') {
    const cur = todayStr().slice(0, 7), r = d.rekap;
    return pageHead('Absensi Saya', d.siswa.nama + ' • ' + d.siswa.kelas) +
      '<div class="card-x"><div class="d-flex justify-content-between align-items-center mb-3"><button class="icon-btn" aria-label="Bulan sebelumnya" onclick="setParam(\'bulan\',\'' + shiftBulan(d.bulan, -1) + '\')">' + icon('chevron-left') + '</button><h3 class="mb-0">' + esc(d.bulanLabel) + '</h3><button class="icon-btn" aria-label="Bulan berikutnya" ' + (d.bulan >= cur ? 'disabled' : '') + ' onclick="setParam(\'bulan\',\'' + shiftBulan(d.bulan, 1) + '\')">' + icon('chevron-right') + '</button></div>' + rekapCells({ hadir: r.hadir, izin: r.izin, sakit: r.sakit, alpha: r.alpha }) + (r.terlambat ? '<p class="small-x muted mt-2 mb-0">Termasuk ' + r.terlambat + ' hari terlambat.</p>' : '') + '</div>' +
      '<div class="card-x flush">' + (d.days.length ? d.days.map(x => '<div class="list-row"><div class="row-main"><div class="row-title">' + esc(x.hari) + ', ' + fmtTgl(x.tanggal) + '</div><div class="row-sub">' + [['Masuk', x.masuk], ['Dhuha', x.dhuha], ['Dzuhur', x.dzuhur], ['Pulang', x.pulang]].filter(a => a[1]).map(a => a[0] + ' ' + a[1]).join(' • ') + (x.ket ? ' • Ket: ' + esc(x.ket) : '') + '</div></div><div class="row-end">' + chip(x.status) + '</div></div>').join('') : empty('calendar-x', 'Belum ada catatan kehadiran pada bulan ini.')) + '</div>';
  }
  const kls = d.kelasList.length > 1 ? selectHtml('absKelas', d.kelasList, d.kelas, 'setParam(\'kelas\',this.value)', 'Pilih kelas') : '';
  return pageHead('Rekap Absensi ' + d.kelas, fmtTgl(d.tanggal)) +
    '<div class="toolbar">' + kls + '<input type="date" class="form-control" id="absTgl" value="' + d.tanggal + '" max="' + todayStr() + '" aria-label="Tanggal" onchange="setParam(\'tanggal\',this.value)"></div>' +
    '<div class="card-x">' + rekapBar(d.rekap) + rekapCells(d.rekap) + '</div><div class="card-x flush">' +
    (d.rows.length ? d.rows.map(r => '<div class="list-row">' + avatar(r.nama, r.foto, 'sm') + '<div class="row-main"><div class="row-title">' + esc(r.nama) + '</div><div class="row-sub">' + [['Masuk', r.masuk], ['Dhuha', r.dhuha], ['Dzuhur', r.dzuhur], ['Pulang', r.pulang]].filter(a => a[1]).map(a => a[0] + ' ' + a[1]).join(' • ') + (r.ket ? ' • ' + esc(r.ket) : '') + '</div></div><div class="row-end d-flex flex-column align-items-end gap-1">' + chip(r.status) + '<div class="btn-row">' + (d.bolehCatat ? '<button class="btn-x btn-soft btn-sm-x" onclick="openManual(\'' + r.id + '\')" aria-label="Catat kehadiran ' + esc(r.nama) + '">' + icon('pencil') + '</button>' : '') + (['Hadir', 'Terlambat'].indexOf(r.status) < 0 ? '<a class="btn-x btn-success-x btn-sm-x" href="' + esc(waHref(r.wa)) + '" target="_blank" rel="noopener" aria-label="WA orang tua ' + esc(r.nama) + '">' + icon('whatsapp') + '</a>' : '') + '</div></div></div>').join('') : empty('people', 'Tidak ada siswa pada kelas ini.')) + '</div>';
};
function openManual(id) {
  const d = App.data, r = d.rows.find(x => x.id === id);
  openForm({ title: 'Catat Kehadiran — ' + r.nama, submitText: 'Simpan', values: { status: r.status === 'Belum' ? 'Izin' : r.status, tanggal: d.tanggal },
    fields: [{ name: 'status', label: 'Status', type: 'select', options: ['Hadir', 'Izin', 'Sakit', 'Alpha'], req: 1 }, { name: 'tanggal', label: 'Tanggal', type: 'date', req: 1 }, { name: 'ket', label: 'Keterangan / surat izin', type: 'textarea', max: 200 }],
    onSubmit: async v => { await rpc('catatManual', { siswaId: id, status: v.status, tanggal: v.tanggal, ket: v.ket }); toast('Tersimpan', 'Kehadiran dicatat.', 'success'); reload(); } });
}

// ============================================================
// HALAMAN: NILAI & TRANSKRIP
// ============================================================
PAGES.nilai = d => {
  if (d.mode === 'rekap') {
    const kls = d.kelasList.length > 1 ? '<div class="toolbar">' + selectHtml('nlKelas', d.kelasList, d.kelas, 'setParam(\'kelas\',this.value)', 'Pilih kelas') + '</div>' : '';
    return pageHead('Rekap Nilai ' + d.kelas, 'Semester ' + d.sem) + kls + '<div class="card-x flush">' + (d.rows.length ? d.rows.map(r => '<button class="list-row" onclick="navigateTo(\'nilai\',{siswaId:\'' + r.id + '\'})">' + avatar(r.nama, r.foto, 'sm') + '<div class="row-main"><div class="row-title">' + esc(r.nama) + '</div><div class="row-sub">NIS ' + esc(r.nis) + '</div></div><div class="row-end"><div class="fw-600">' + (r.avg === null ? '-' : r.avg) + '</div>' + (r.belum ? chip(r.belum + ' di bawah KKM', 'warning') : chip('Tuntas', 'success')) + '</div></button>').join('') : empty('people', 'Tidak ada siswa.')) + '</div>';
  }
  App.ui.nilaiTab = 'harian'; App.ui.nilaiQ = '';
  const isSiswa = App.user.role === 'siswa', sid = d.siswa.id;
  return (isSiswa ? '' : '<button class="link-btn mb-1" onclick="goBack()">' + icon('arrow-left') + ' Kembali ke rekap kelas</button>') + pageHead('Nilai & Transkrip Akademik', 'Semester ' + d.sem + ' • ' + d.siswa.kelas + (isSiswa ? '' : ' • ' + d.siswa.nama)) +
    '<div class="btn-row mb-3"><button class="btn-x btn-ghost" onclick="cetakTranskrip()">' + icon('printer') + ' Cetak Transkrip</button><button class="btn-x btn-primary-x" onclick="unduhPdf(\'raport\',{siswaId:\'' + sid + '\'},this)">' + icon('download') + ' Unduh PDF</button></div>' +
    '<div class="seg" role="tablist" id="nilaiTabs">' + [['harian', 'Nilai Harian'], ['pts', 'PTS'], ['pas', 'PAS'], ['raport', 'Raport Semester']].map(t => '<button type="button" role="tab" class="seg-btn ' + (t[0] === 'harian' ? 'active' : '') + '" data-t="' + t[0] + '" onclick="setNilaiTab(\'' + t[0] + '\')">' + t[1] + '</button>').join('') + '</div>' +
    '<div class="search-box mb-3"><i class="bi bi-search" aria-hidden="true"></i><input class="form-control" placeholder="Cari mata pelajaran atau guru…" aria-label="Cari mata pelajaran" oninput="App.ui.nilaiQ=this.value;renderNilai()"></div>' +
    '<div class="card-x avg-card"><span class="kpi-icon tone-warning" style="width:48px;height:48px;font-size:22px">' + icon('trophy') + '</span><div class="row-main"><div class="small-x muted fw-600">RATA-RATA SEMESTER</div><div class="d-flex align-items-center gap-2 flex-wrap"><span class="kpi-val">' + (d.avg === null ? '-' : d.avg) + '</span>' + chip(d.label, 'warning') + '</div>' + (d.rank ? '<div class="small-x fw-600" style="color:var(--link)">' + icon('award') + ' Peringkat Kelas ' + d.rank + ' dari ' + d.total + ' Siswa</div>' : '') + '</div></div>' +
    '<div class="card-x flush"><div class="table-wrap" id="nilaiTable">' + nilaiTable(d, 'harian', '') + '</div></div>' +
    (d.catatan ? '<div class="note-box info">' + icon('lightbulb') + '<div><b>Catatan Wali Kelas</b>"' + esc(d.catatan.isi) + '"<div class="small-x mt-1">— ' + esc(d.catatan.penulis) + ', ' + fmtTgl(d.catatan.tanggal) + '</div></div></div>' : '');
};
function nilaiTable(d, tab, q) {
  q = (q || '').toLowerCase();
  const items = d.items.filter(i => !q || (i.mapel + ' ' + i.guru).toLowerCase().indexOf(q) >= 0);
  const head = { harian: ['Mata Pelajaran', 'KKM', 'Nilai Harian', 'Rata-rata'], pts: ['Mata Pelajaran', 'KKM', 'Nilai PTS'], pas: ['Mata Pelajaran', 'KKM', 'Nilai PAS'], raport: ['Mata Pelajaran', 'KKM', 'Nilai Akhir', 'Predikat', 'Keterangan'] }[tab];
  const nv = (v, k) => v === null ? '<span class="muted">-</span>' : '<span class="' + (v < k ? 'low' : 'fw-600') + '">' + v + '</span>';
  const rows = items.map(i => {
    const c = '<td><div class="fw-600">' + esc(i.mapel) + '</div><div class="small-x muted">' + esc(i.guru) + '</div></td><td class="c">' + i.kkm + '</td>';
    if (tab === 'harian') return '<tr>' + c + '<td class="c small-x">' + (i.harian.length ? i.harian.map(h => esc(h.j) + ': <b class="' + (h.n < i.kkm ? 'low' : '') + '">' + h.n + '</b>').join('<br>') : '-') + '</td><td class="c">' + nv(i.harianAvg, i.kkm) + '</td></tr>';
    if (tab === 'pts') return '<tr>' + c + '<td class="c">' + nv(i.pts, i.kkm) + '</td></tr>';
    if (tab === 'pas') return '<tr>' + c + '<td class="c">' + nv(i.pas, i.kkm) + '</td></tr>';
    return '<tr>' + c + '<td class="c">' + nv(i.akhir, i.kkm) + '</td><td class="c">' + esc(i.predikat) + '</td><td class="c">' + (i.tuntas === null ? '-' : i.tuntas ? chip('Tuntas', 'success') : chip('Remedial', 'danger')) + '</td></tr>';
  }).join('');
  return '<table class="table-x"><thead><tr>' + head.map((h, i) => '<th class="' + (i ? 'c' : '') + '">' + h + '</th>').join('') + '</tr></thead><tbody>' + (rows || '<tr><td colspan="' + head.length + '">' + empty('journal-x', 'Tidak ada mata pelajaran yang cocok.') + '</td></tr>') + '</tbody></table>';
}
function renderNilai() { $('nilaiTable').innerHTML = nilaiTable(App.data, App.ui.nilaiTab, App.ui.nilaiQ); }
function setNilaiTab(t) { App.ui.nilaiTab = t; document.querySelectorAll('#nilaiTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.t === t)); renderNilai(); }
function cetakTranskrip() {
  const d = App.data;
  printHtml('<h2>' + esc(App.config.appName || 'SITH-One') + ' — Transkrip Nilai</h2><p>' + esc(d.siswa.nama) + ' • ' + esc(d.siswa.kelas) + ' • Semester ' + esc(d.sem) + '</p><table><tr><th>Mata Pelajaran</th><th>KKM</th><th>Harian</th><th>PTS</th><th>PAS</th><th>Akhir</th><th>Pred.</th></tr>' +
    d.items.map(i => '<tr><td>' + esc(i.mapel) + '</td><td>' + i.kkm + '</td><td>' + (i.harianAvg === null ? '-' : i.harianAvg) + '</td><td>' + (i.pts === null ? '-' : i.pts) + '</td><td>' + (i.pas === null ? '-' : i.pas) + '</td><td>' + (i.akhir === null ? '-' : i.akhir) + '</td><td>' + i.predikat + '</td></tr>').join('') + '</table><p>Rata-rata: <b>' + (d.avg === null ? '-' : d.avg) + '</b> (' + esc(d.label) + ')' + (d.rank ? ' • Peringkat ' + d.rank + ' dari ' + d.total : '') + '</p>');
}

// ============================================================
// HALAMAN: INPUT NILAI (guru, wali kelas, admin)
// ============================================================
PAGES.inputnilai = d => {
  if (!d.mapelList.length) return pageHead('Input Nilai Siswa', 'Semester ' + d.sem) + '<div class="card-x">' + empty('journal-x', 'Anda belum ditetapkan sebagai pengampu mata pelajaran. Hubungi admin untuk pengaturan di Master Data → Mata Pelajaran.') + '</div>';
  const harian = d.kategori === 'Harian';
  return pageHead('Input Nilai Siswa', 'Semester ' + d.sem + ' • ' + d.mapel + ' • ' + d.kelas) +
    '<div class="toolbar">' + selectHtml('inKelas', d.kelasList, d.kelas, 'chgInput(\'kelas\',this.value)', 'Kelas') + selectHtml('inMapel', d.mapelList.map(m => ({ v: m.nama, l: m.nama })), d.mapel, 'chgInput(\'mapel\',this.value)', 'Mata pelajaran') +
    selectHtml('inKat', ['Harian', 'PTS', 'PAS'], d.kategori, 'chgInput(\'kategori\',this.value)', 'Kategori nilai') +
    (harian ? '<input class="form-control" id="inJudul" list="judulList" value="' + esc(d.judul) + '" maxlength="30" aria-label="Judul penilaian harian" placeholder="Mis. UH 1" onchange="chgInput(\'judul\',this.value)"><datalist id="judulList">' + d.judulList.map(j => '<option value="' + esc(j) + '">').join('') + '</datalist>' : '') + '</div>' +
    '<div class="note-box info">' + icon('info-circle') + '<div>Standar Ketuntasan Minimal (KKM) mata pelajaran ini adalah <b style="display:inline">' + d.kkm + '</b>. Nilai di bawah KKM ditandai merah.</div></div>' +
    '<div class="card-x flush">' + (d.rows.length ? d.rows.map(r => '<div class="grade-row" data-sid="' + r.id + '"><div class="who">' + avatar(r.nama, '', 'sm') + '<div class="row-main"><div class="row-title">' + esc(r.nama) + '</div><div class="row-sub">NIS: ' + esc(r.nis) + '</div></div>' + (r.draft ? chip('Draft', 'warning') : '') + chip(r.status) + '</div><div><label for="c_' + r.id + '">Catatan siswa</label><input class="form-control cat" id="c_' + r.id + '" value="' + esc(r.catatan) + '" maxlength="200" placeholder="Opsional"></div><div><label for="n_' + r.id + '">Nilai (0-100)</label><input class="form-control nilai ' + (r.nilai !== '' && r.nilai < d.kkm ? 'is-low' : '') + '" id="n_' + r.id + '" type="number" min="0" max="100" step="0.1" inputmode="decimal" value="' + r.nilai + '" oninput="chkNilai(this)"></div></div>').join('') : empty('people', 'Tidak ada siswa di kelas ini.')) + '</div>' +
    '<div class="sticky-foot"><button class="btn-x btn-ghost" onclick="submitNilai(false,this)">Simpan Draft</button><button class="btn-x btn-primary-x" onclick="submitNilai(true,this)">Submit Nilai</button></div>';
};
function chgInput(k, v) {
  const d = App.data, p = { kelas: d.kelas, mapel: d.mapel, kategori: d.kategori, judul: d.judul }; p[k] = v;
  if (k === 'mapel' || k === 'kategori') p.judul = '';
  navigateTo('inputnilai', p, { noHistory: true });
}
function chkNilai(el) { const v = el.value; el.classList.toggle('is-low', v !== '' && Number(v) < App.data.kkm); }
async function submitNilai(final, btn) {
  const d = App.data, rows = Array.prototype.map.call(document.querySelectorAll('[data-sid]'), r => ({ siswaId: r.dataset.sid, nilai: r.querySelector('.nilai').value, catatan: r.querySelector('.cat').value }));
  if (!rows.some(r => r.nilai !== '')) { toast('Belum ada nilai', 'Isi minimal satu nilai.', 'warning'); return; }
  const judul = $('inJudul') ? $('inJudul').value : d.judul;
  const go = async () => {
    btnLoading(btn, true);
    try { const r = await rpc('simpanNilai', { mapel: d.mapel, kategori: d.kategori, judul: judul, final: final, rows: rows }); toast(final ? 'Nilai disubmit' : 'Draft tersimpan', r.jumlah + ' nilai tersimpan.', 'success'); reload(); }
    catch (e) { toast('Gagal', e.message, 'danger'); } finally { btnLoading(btn, false); }
  };
  if (final) confirmBox('Submit nilai sebagai final? Nilai akan tampil di portal siswa dan orang tua.', go, 'Submit Nilai'); else go();
}

// ============================================================
// HALAMAN: KEDISIPLINAN & POIN SIKAP
// ============================================================
PAGES.poin = d => {
  App.ui.poinQ = ''; App.ui.poinJ = ''; App.ui.pg.poin = 1;
  let h = pageHead('Manajemen Disiplin & Poin Sikap', d.role === 'siswa' ? 'Riwayat pelanggaran dan penghargaan Anda' : 'Pencatatan pelanggaran & penghargaan siswa');
  if (d.bisaCatat) h += '<div class="btn-row mb-3"><button class="btn-x btn-danger-x" style="flex:1" onclick="openKes(\'Pelanggaran\')">' + icon('plus-circle') + ' Catat Pelanggaran</button><button class="btn-x btn-ghost" style="flex:1" onclick="openKes(\'Prestasi\')">' + icon('trophy') + ' Catat Prestasi</button></div>';
  if (d.role === 'siswa') h += '<div class="card-x d-flex align-items-center gap-3"><span class="kpi-icon tone-info" style="width:48px;height:48px;font-size:22px">' + icon('emoji-smile') + '</span><div><div class="muted small-x fw-600">SKOR SIKAP SAAT INI</div><div class="kpi-val">' + d.skor + ' <span class="chip chip-info align-middle">' + esc(d.predikat) + '</span></div><div class="small-x muted">Skor dasar 100, dikurangi pelanggaran dan ditambah prestasi.</div></div></div>';
  h += kpiGrid([{ label: 'Perlu Perhatian', value: d.stats.perhatian + ' siswa', icon: 'exclamation-triangle', tone: 'danger', sub: 'Skor sikap < 75' }, { label: 'Pelanggaran Bulan Ini', value: d.stats.pelanggaran + ' kasus', icon: 'clipboard-x', tone: 'warning', sub: '' }, { label: 'Prestasi Bulan Ini', value: d.stats.prestasi + ' prestasi', icon: 'trophy', tone: 'info', sub: '' }]);
  h += '<div class="toolbar"><div class="search-box"><i class="bi bi-search" aria-hidden="true"></i><input class="form-control" placeholder="Cari nama siswa atau NIS…" aria-label="Cari siswa" oninput="App.ui.poinQ=this.value;App.ui.pg.poin=1;renderPoin()"></div>' + selectHtml('poinJ', [{ v: '', l: 'Semua Kategori' }, { v: 'Pelanggaran', l: 'Pelanggaran' }, { v: 'Prestasi', l: 'Prestasi' }], '', 'App.ui.poinJ=this.value;App.ui.pg.poin=1;renderPoin()', 'Filter kategori') + '</div>';
  return h + '<div id="poinList"></div><div id="poinPager"></div>';
};
INIT.poin = () => renderPoin();
function recCard(r, bisa) {
  return '<div class="card-x rec-card"><div class="rec-top">' + avatar(r.nama, r.foto, 'sm') + '<div class="row-main"><div class="row-title">' + esc(r.nama) + '</div><div class="row-sub">' + esc(r.kelas) + ' • NIS: ' + esc(r.nis) + '</div></div>' + chip(r.jenis) + '</div><div class="rec-box"><div class="meta"><span>' + fmtTgl(r.tanggal) + ' • ' + esc(r.kategori) + '</span><span class="' + (r.poin < 0 ? 'pts-neg' : 'pts-pos') + '">' + (r.poin > 0 ? '+' : '') + r.poin + ' pts</span></div><div>' + esc(r.deskripsi) + '</div></div><div class="btn-row justify-content-end"><button class="btn-x btn-ghost btn-sm-x" onclick="detailKes(\'' + r.id + '\')">Detail</button>' + (bisa ? '<button class="btn-x btn-soft btn-sm-x" onclick="openKes(null,\'' + r.id + '\')">Edit</button>' : '') + '</div></div>';
}
function renderPoin() {
  const d = App.data, q = (App.ui.poinQ || '').toLowerCase(), j = App.ui.poinJ;
  const list = d.records.filter(r => (!j || r.jenis === j) && (!q || (r.nama + ' ' + r.nis + ' ' + r.deskripsi).toLowerCase().indexOf(q) >= 0));
  $('poinList').innerHTML = list.length ? slicePg('poin', list, 5).map(r => recCard(r, d.bisaCatat)).join('') : '<div class="card-x">' + empty('clipboard-check', 'Belum ada catatan yang sesuai.') + '</div>';
  $('poinPager').innerHTML = pager('poin', list.length, 5, renderPoin);
}
function detailKes(id) {
  const d = App.data, r = d.records.find(x => x.id === id);
  showView('Detail ' + r.jenis, '<div class="d-flex gap-3 align-items-center mb-3">' + avatar(r.nama, r.foto) + '<div><div class="row-title">' + esc(r.nama) + '</div><div class="row-sub">' + esc(r.kelas) + ' • NIS ' + esc(r.nis) + '</div></div></div><dl class="kv"><dt>Tanggal</dt><dd>' + fmtTgl(r.tanggal) + '</dd><dt>Jenis</dt><dd>' + chip(r.jenis) + '</dd><dt>Kategori</dt><dd>' + esc(r.kategori) + '</dd><dt>Bobot Poin</dt><dd class="' + (r.poin < 0 ? 'pts-neg' : 'pts-pos') + '">' + (r.poin > 0 ? '+' : '') + r.poin + '</dd><dt>Deskripsi</dt><dd>' + esc(r.deskripsi) + '</dd><dt>' + (r.jenis === 'Pelanggaran' ? 'Sanksi' : 'Apresiasi') + '</dt><dd>' + (esc(r.sanksi) || '-') + '</dd><dt>Dicatat oleh</dt><dd>' + esc(r.pencatat) + '</dd></dl>',
    (r.bukti ? '<button class="btn-x btn-soft" onclick="previewFile(\'' + r.bukti + '\')">' + icon('paperclip') + ' Lihat Dokumen</button>' : '') + (d.bisaCatat ? '<button class="btn-x btn-danger-x" onclick="hapusKes(\'' + r.id + '\')">' + icon('trash') + ' Hapus</button>' : '') + '<button type="button" class="btn-x btn-ghost" data-bs-dismiss="modal">Tutup</button>');
}
function hapusKes(id) { modal('viewModal').hide(); confirmBox('Hapus catatan ini? Skor sikap siswa akan dihitung ulang.', async () => { try { await rpc('hapusKesiswaan', id); toast('Dihapus', 'Catatan telah dihapus.', 'success'); reload(); } catch (e) { toast('Gagal', e.message, 'danger'); } }, 'Hapus'); }
function openKes(jenis, id) {
  const d = App.data, r = id ? d.records.find(x => x.id === id) : null; jenis = r ? r.jenis : jenis;
  openForm({ title: (r ? 'Ubah ' : 'Catat ') + jenis, submitText: 'Simpan', danger: false,
    values: r ? { siswaId: r.siswaId, tanggal: r.tanggal, kategori: r.kategori, deskripsi: r.deskripsi, poin: Math.abs(r.poin), sanksi: r.sanksi } : { tanggal: todayStr() },
    fields: [{ name: 'siswaId', label: 'Siswa', type: 'select', options: d.siswaOpsi, req: 1 }, { name: 'tanggal', label: 'Tanggal', type: 'date', req: 1 }, { name: 'kategori', label: 'Kategori', type: 'select', options: d.kategori[jenis], req: 1 },
      { name: 'deskripsi', label: 'Deskripsi kejadian', type: 'textarea', req: 1 }, { name: 'poin', label: jenis === 'Pelanggaran' ? 'Bobot poin (mengurangi skor sikap)' : 'Bobot poin (menambah skor sikap)', type: 'number', min: 1, max: 100, req: 1 },
      { name: 'sanksi', label: jenis === 'Pelanggaran' ? 'Sanksi / tindak lanjut' : 'Apresiasi / penghargaan' }, { name: 'file', label: 'Dokumen pendukung (foto/PDF)', type: 'file', help: r && r.bukti ? 'Kosongkan jika tidak mengganti dokumen.' : '' }],
    onSubmit: async v => { await rpc('simpanKesiswaan', { ID: id || '', jenis: jenis, siswaId: v.siswaId, tanggal: v.tanggal, kategori: v.kategori, deskripsi: v.deskripsi, poin: v.poin, sanksi: v.sanksi, file: v.file }); toast('Tersimpan', 'Catatan ' + jenis.toLowerCase() + ' disimpan.', 'success'); reload(); } });
}

// ============================================================
// HALAMAN: KEUANGAN, SPP & TABUNGAN
// ============================================================
PAGES.keuangan = d => d.mode === 'siswa' ? keuSiswa(d) : keuStaf(d);
function keuAksiSiswa(i) {
  if (i.status === 'Lunas') return (i.bukti ? '<button class="link-btn" onclick="previewFile(\'' + i.bukti + '\')">' + icon('eye') + ' Lihat Bukti</button>' : '') + '<button class="link-btn" onclick="unduhPdf(\'kuitansi\',{id:\'' + i.id + '\'},this)">' + icon('receipt') + ' Kuitansi</button>';
  if (i.status === 'Menunggu Verifikasi') return '<button class="link-btn" onclick="previewFile(\'' + i.bukti + '\')">' + icon('eye') + ' Lihat Bukti</button>';
  return '<button class="btn-x btn-primary-x btn-sm-x" onclick="bukaUnggah(\'' + i.id + '\')">' + icon('upload') + ' Unggah Bukti</button>';
}
function keuSiswa(d) {
  return pageHead('Keuangan & SPP', 'Tahun Ajaran ' + d.ta + ' • ' + d.nama) +
    '<div class="card-x d-flex justify-content-between align-items-start"><div><div class="muted">Total Tagihan</div><div class="kpi-val">' + fmtRp(d.total) + '</div><div class="muted small-x">Total kewajiban 1 tahun ajaran</div></div><span class="kpi-icon tone-primary">' + icon('receipt') + '</span></div>' +
    '<div class="grid-kpi k2"><div class="kpi" style="border-left:4px solid #16A34A"><div class="kpi-top"><span>Sudah Dibayar</span><span class="kpi-icon tone-success">' + icon('check2-circle') + '</span></div><div class="kpi-val">' + fmtRp(d.bayar) + '</div>' + chip(d.sisa ? 'Lunas Sebagian' : 'Lunas Semua', 'success') + '</div>' +
    '<div class="kpi" style="border-left:4px solid #EF4444"><div class="kpi-top"><span>Sisa Kewajiban</span><span class="kpi-icon tone-danger">' + icon('exclamation-circle') + '</span></div><div class="kpi-val">' + fmtRp(d.sisa) + '</div>' + (d.sisa ? chip('Segera diselesaikan', 'danger') : chip('Tidak ada tunggakan', 'success')) + '</div></div>' +
    '<div class="card-x"><div class="card-title"><h3>Rekening Pembayaran</h3></div>' + d.banks.map(b => '<div class="rec-box d-flex justify-content-between align-items-center gap-2"><div><div class="fw-600">' + esc(b.bank) + '</div><div style="font-family:monospace;font-size:16px;letter-spacing:.04em">' + esc(b.rek) + '</div><div class="small-x muted">a.n. ' + esc(b.an) + '</div></div><button class="icon-btn" aria-label="Salin nomor rekening ' + esc(b.bank) + '" onclick="copyText(\'' + esc(b.rek) + '\')">' + icon('copy') + '</button></div>').join('') + '<p class="small-x muted mb-0">Transfer sesuai nominal tagihan, lalu unggah bukti transfer pada bulan terkait. Bendahara akan memverifikasi.</p></div>' +
    '<div class="card-x flush"><div class="card-title" style="padding:16px 16px 0"><h3>Riwayat & Tagihan SPP Bulanan</h3><span class="small-x muted">' + d.items.length + ' Bulan</span></div>' + (d.items.length ? d.items.map(i => '<div class="list-row"><div class="row-main"><div class="row-title">' + esc(i.label) + '</div><div class="row-sub">' + fmtRp(i.nominal) + (i.catatan && i.status === 'Belum Lunas' ? ' • <span class="text-danger-x">Ditolak: ' + esc(i.catatan) + '</span>' : '') + '</div></div><div class="row-end d-flex flex-column align-items-end gap-1">' + chip(i.status) + '<div class="btn-row justify-content-end">' + keuAksiSiswa(i) + '</div></div></div>').join('') : empty('receipt', 'Belum ada tagihan.')) + '</div>' +
    '<div class="card-x"><div class="card-title"><h3>Tabungan Siswa</h3><span class="kpi-icon tone-warning">' + icon('piggy-bank') + '</span></div><div class="kpi-val mb-2">' + fmtRp(d.saldo) + '</div>' + (d.mutasi.length ? d.mutasi.map(m => '<div class="list-row px-0"><div class="row-main"><div class="row-title">' + esc(m.jenis) + ' ' + fmtRp(m.nominal) + '</div><div class="row-sub">' + fmtTgl(m.tanggal) + ' • ' + esc(m.ket) + '</div></div><div class="row-end small-x muted">Saldo ' + fmtRp(m.saldo) + '</div></div>').join('') : '<p class="muted mb-0">Belum ada mutasi tabungan.</p>') + '</div>' +
    '<div class="note-box warn">' + icon('headset') + '<div><b>Kendala Pembayaran?</b>Hubungi loket keuangan sekolah jika melakukan pembayaran manual atau konfirmasi transfer.<div class="mt-2">' + waBtn(d.kontak, 'Hubungi Loket Keuangan') + '</div></div></div>';
}
function bukaUnggah(id) {
  openForm({ title: 'Unggah Bukti Pembayaran', intro: 'Unggah foto/PDF bukti transfer. Status tagihan menjadi "Menunggu Verifikasi" sampai bendahara mengonfirmasi.', fields: [{ name: 'file', label: 'Bukti transfer (gambar atau PDF)', type: 'file', req: 1 }], submitText: 'Kirim Bukti',
    onSubmit: async v => { await rpc('unggahBukti', id, v.file); toast('Terkirim', 'Bukti pembayaran menunggu verifikasi.', 'success'); reload(); } });
}
function keuStaf(d) {
  const s = d.summary; App.ui.keuQ = ''; App.ui.pg.keu = 1; App.ui.keuTab = App.ui.keuTab || 'tagihan';
  const kls = selectHtml('keuKelas', [{ v: '', l: 'Semua Kelas' }].concat(d.kelasList), d.kelas, 'setParam(\'kelas\',this.value)', 'Filter kelas');
  return pageHead('Keuangan & Tabungan', 'Kelola tagihan SPP, verifikasi pembayaran, dan tabungan siswa') +
    kpiGrid([{ label: 'Tagihan Terbuka', value: fmtRp(s.terbuka), icon: 'receipt', tone: 'danger', sub: '' }, { label: 'Terbayar', value: fmtRp(s.terbayar), icon: 'cash-stack', tone: 'success', sub: 'Seluruh periode' }, { label: 'Menunggu Verifikasi', value: s.menunggu, icon: 'hourglass-split', tone: 'warning', sub: 'Bukti transfer' }, { label: 'Total Tabungan', value: fmtRp(s.tabungan), icon: 'piggy-bank', tone: 'primary', sub: '' }]) +
    '<div class="seg" role="tablist" id="keuTabs"><button type="button" role="tab" class="seg-btn ' + (App.ui.keuTab === 'tagihan' ? 'active' : '') + '" data-t="tagihan" onclick="setKeuTab(\'tagihan\')">' + icon('receipt') + ' Tagihan SPP</button><button type="button" role="tab" class="seg-btn ' + (App.ui.keuTab === 'tabungan' ? 'active' : '') + '" data-t="tabungan" onclick="setKeuTab(\'tabungan\')">' + icon('piggy-bank') + ' Tabungan</button></div>' +
    '<section id="keuTagihan" ' + (App.ui.keuTab === 'tagihan' ? '' : 'hidden') + '><div class="toolbar">' + selectHtml('keuStatus', [{ v: 'terbuka', l: 'Belum lunas' }, { v: 'Lunas', l: 'Lunas' }, { v: 'semua', l: 'Semua' }], d.status, 'setParam(\'status\',this.value)', 'Filter status') + kls + '<div class="search-box"><i class="bi bi-search" aria-hidden="true"></i><input class="form-control" placeholder="Cari nama siswa…" aria-label="Cari siswa" oninput="App.ui.keuQ=this.value;App.ui.pg.keu=1;renderKeu()"></div><button class="btn-x btn-primary-x" style="flex:0 0 auto" onclick="bukaTagihan()">' + icon('plus-lg') + ' Buat Tagihan</button></div><div class="card-x flush" id="keuList"></div><div id="keuPager"></div></section>' +
    '<section id="keuTabungan" ' + (App.ui.keuTab === 'tabungan' ? '' : 'hidden') + '><div class="toolbar"><div class="search-box"><i class="bi bi-search" aria-hidden="true"></i><input class="form-control" placeholder="Cari penabung…" aria-label="Cari penabung" oninput="App.ui.tabQ=this.value;App.ui.pg.tab=1;renderTab()"></div>' + kls + '</div><div class="card-x flush" id="tabList"></div><div id="tabPager"></div>' +
    '<div class="card-x flush mt-3"><div class="card-title" style="padding:16px 16px 0"><h3>Mutasi Terbaru</h3></div>' + (d.mutasi.length ? d.mutasi.map(m => '<div class="list-row"><div class="row-main"><div class="row-title">' + esc(m.nama) + '</div><div class="row-sub">' + fmtTgl(m.tanggal) + ' • ' + esc(m.ket) + '</div></div><div class="row-end"><div class="' + (m.jenis === 'Setor' ? 'pts-pos' : 'pts-neg') + '">' + (m.jenis === 'Setor' ? '+' : '-') + fmtRp(m.nominal) + '</div><div class="small-x muted">Saldo ' + fmtRp(m.saldo) + '</div></div></div>').join('') : empty('clock-history', 'Belum ada mutasi.')) + '</div></section>';
}
INIT.keuangan = d => { if (d.mode === 'staf') { App.ui.tabQ = ''; renderKeu(); renderTab(); } };
function setKeuTab(t) { App.ui.keuTab = t; $('keuTagihan').hidden = t !== 'tagihan'; $('keuTabungan').hidden = t !== 'tabungan'; document.querySelectorAll('#keuTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.t === t)); }
function renderKeu() {
  const d = App.data, q = (App.ui.keuQ || '').toLowerCase(), list = d.items.filter(i => !q || i.nama.toLowerCase().indexOf(q) >= 0);
  $('keuList').innerHTML = list.length ? slicePg('keu', list, 8).map(i => '<div class="list-row">' + avatar(i.nama, '', 'sm') + '<div class="row-main"><div class="row-title">' + esc(i.nama) + ' <span class="small-x muted">' + esc(i.kelas) + '</span></div><div class="row-sub">SPP ' + esc(i.label) + ' • ' + fmtRp(i.nominal) + (i.tglBayar ? ' • Bayar ' + fmtTgl(i.tglBayar) : '') + '</div></div><div class="row-end d-flex flex-column align-items-end gap-1">' + chip(i.status) + '<div class="btn-row justify-content-end">' +
    (i.status === 'Menunggu Verifikasi' ? '<button class="btn-x btn-ghost btn-sm-x" onclick="previewFile(\'' + i.bukti + '\')">' + icon('eye') + ' Bukti</button><button class="btn-x btn-success-x btn-sm-x" onclick="verif(\'' + i.id + '\',\'lunas\')">Terima</button><button class="btn-x btn-danger-x btn-sm-x" onclick="verif(\'' + i.id + '\',\'tolak\')">Tolak</button>' : i.status === 'Lunas' ? '<button class="btn-x btn-soft btn-sm-x" onclick="unduhPdf(\'kuitansi\',{id:\'' + i.id + '\'},this)">' + icon('receipt') + ' Kuitansi</button>' : '<button class="btn-x btn-primary-x btn-sm-x" onclick="verif(\'' + i.id + '\',\'lunas\')">' + icon('cash') + ' Tandai Lunas</button>') + '</div></div></div>').join('') : empty('receipt', 'Tidak ada tagihan yang sesuai filter.');
  $('keuPager').innerHTML = pager('keu', list.length, 8, renderKeu);
}
function verif(id, aksi) {
  const run = async ket => { try { await rpc('verifikasiTagihan', id, aksi, ket || ''); toast('Berhasil', aksi === 'lunas' ? 'Tagihan ditandai lunas. Kuitansi tersedia.' : 'Bukti ditolak.', 'success'); reload(); } catch (e) { toast('Gagal', e.message, 'danger'); } };
  if (aksi === 'lunas') confirmBox('Tandai tagihan ini sebagai lunas (diterima)?', () => run(''), 'Ya, lunas');
  else openForm({ title: 'Tolak Bukti Pembayaran', fields: [{ name: 'ket', label: 'Alasan penolakan', type: 'textarea', req: 1, max: 150 }], submitText: 'Tolak Bukti', danger: true, onSubmit: async v => { await run(v.ket); } });
}
function bukaTagihan() {
  const d = App.data, now = todayStr().slice(0, 7);
  openForm({ title: 'Buat Tagihan SPP Bulanan', intro: 'Tagihan dibuat untuk semua siswa aktif yang belum memiliki tagihan pada bulan tersebut.', values: { bulan: now, nominal: d.nominalSpp },
    fields: [{ name: 'bulan', label: 'Bulan tagihan', type: 'month', req: 1, help: 'Format: 2026-11' }, { name: 'nominal', label: 'Nominal (Rp)', type: 'number', min: 1, req: 1 }, { name: 'kelas', label: 'Khusus kelas (kosongkan = semua kelas)', type: 'select', options: d.kelasList }],
    onSubmit: async v => { const r = await rpc('buatTagihan', { bulan: v.bulan, nominal: v.nominal, kelas: v.kelas }); toast('Tagihan dibuat', r.dibuat + ' tagihan baru dibuat.', 'success'); reload(); } });
}
function renderTab() {
  const d = App.data, q = (App.ui.tabQ || '').toLowerCase(), list = d.penabung.filter(p => !q || p.nama.toLowerCase().indexOf(q) >= 0);
  $('tabList').innerHTML = list.length ? slicePg('tab', list, 8).map(p => '<div class="list-row">' + avatar(p.nama, '', 'sm') + '<div class="row-main"><div class="row-title">' + esc(p.nama) + '</div><div class="row-sub">' + esc(p.kelas) + ' • Saldo <b>' + fmtRp(p.saldo) + '</b></div></div><div class="btn-row"><button class="btn-x btn-success-x btn-sm-x" onclick="bukaTab(\'' + p.id + '\',\'Setor\')">Setor</button><button class="btn-x btn-ghost btn-sm-x" onclick="bukaTab(\'' + p.id + '\',\'Tarik\')">Tarik</button></div></div>').join('') : empty('piggy-bank', 'Tidak ada penabung.');
  $('tabPager').innerHTML = pager('tab', list.length, 8, renderTab);
}
function bukaTab(id, jenis) {
  const p = App.data.penabung.find(x => x.id === id);
  openForm({ title: (jenis === 'Setor' ? 'Setoran' : 'Penarikan') + ' — ' + p.nama, intro: 'Saldo saat ini ' + fmtRp(p.saldo), fields: [{ name: 'nominal', label: 'Nominal (Rp)', type: 'number', min: 1, req: 1 }, { name: 'ket', label: 'Keterangan', max: 150 }], submitText: jenis === 'Setor' ? 'Catat Setoran' : 'Catat Penarikan',
    onSubmit: async v => { const r = await rpc('catatTabungan', { siswaId: id, jenis: jenis, nominal: v.nominal, ket: v.ket }); toast('Tercatat', 'Saldo baru ' + fmtRp(r.saldo), 'success'); reload(); } });
}

// ============================================================
// HALAMAN: TATA KELOLA KELAS (wali kelas & admin)
// ============================================================
PAGES.kelas = d => {
  const kls = d.kelasList.length > 1 ? '<div class="toolbar">' + selectHtml('klsSel', d.kelasList, d.kelas, 'setParam(\'kelas\',this.value)', 'Pilih kelas') + '</div>' : '';
  return pageHead('Tata Kelola Kelas ' + d.kelas, 'Semester ' + d.sem) + kls +
    kpiGrid([{ label: 'Total Siswa', value: d.siswa.length, icon: 'people', tone: 'primary', sub: '' }, { label: 'Hadir Hari Ini', value: d.rekap.hadir, icon: 'calendar-check', tone: 'success', sub: d.rekap.total ? Math.round(d.rekap.hadir / d.rekap.total * 100) + '%' : '' }, { label: 'Rata-rata Kelas', value: d.rata, icon: 'graph-up-arrow', tone: 'warning', sub: '' }]) +
    '<div class="grid-2"><div class="card-x"><div class="card-title"><h3>Rekap Absensi Hari Ini</h3></div>' + rekapBar(d.rekap) + rekapCells(d.rekap) + '</div>' + chartCard(d.chart) + '</div>' +
    '<div class="card-x flush"><div class="card-title" style="padding:16px 16px 0"><h3>Daftar Siswa</h3><button class="btn-x btn-ghost btn-sm-x" onclick="cetakKelas()">' + icon('printer') + ' Cetak Daftar</button></div>' + d.siswa.map(s => '<div class="list-row">' + avatar(s.nama, s.foto, 'sm') + '<div class="row-main"><div class="row-title">' + esc(s.nama) + '</div><div class="row-sub">Nilai ' + (s.avg === null ? '-' : s.avg) + (s.belum ? ' • <span class="text-danger-x">' + s.belum + ' di bawah KKM</span>' : '') + ' • Sikap ' + s.skor + ' (' + esc(s.predikat) + ')</div></div><div class="row-end d-flex flex-column align-items-end gap-1">' + chip(s.status) + '<div class="btn-row"><button class="btn-x btn-soft btn-sm-x" onclick="unduhPdf(\'raport\',{siswaId:\'' + s.id + '\'},this)" aria-label="Raport ' + esc(s.nama) + '">' + icon('file-earmark-pdf') + ' Raport</button><button class="btn-x btn-ghost btn-sm-x" onclick="bukaCatatan(\'' + s.id + '\')" aria-label="Catatan ' + esc(s.nama) + '">' + icon('journal-plus') + '</button></div></div></div>').join('') + '</div>' +
    '<div class="card-x flush"><div class="card-title" style="padding:16px 16px 0"><h3>Buku Laporan Perkembangan</h3><button class="btn-x btn-primary-x btn-sm-x" onclick="bukaCatatan()">' + icon('plus-lg') + ' Tulis Catatan</button></div>' + (d.catatan.length ? d.catatan.map(c => '<div class="list-row" style="align-items:flex-start"><div class="row-main"><div class="row-title">' + esc(c.nama) + ' ' + chip(c.jenis, c.jenis === 'BK Internal' ? 'danger' : c.jenis === 'Komunikasi' ? 'info' : 'primary') + '</div><div style="font-size:13px">' + esc(c.isi) + '</div><div class="row-sub">' + fmtTgl(c.tanggal) + ' • ' + esc(c.penulis) + '</div></div></div>').join('') : empty('journal-text', 'Belum ada catatan.')) + '</div>';
};
INIT.kelas = d => drawCharts([d.chart]);
function bukaCatatan(sid) {
  const d = App.data;
  openForm({ title: 'Catatan Perkembangan', values: { siswaId: sid || '', jenis: 'Karakter' }, intro: 'Catatan "BK Internal" tidak terlihat oleh siswa/orang tua.',
    fields: [{ name: 'siswaId', label: 'Siswa', type: 'select', options: d.siswa.map(s => ({ v: s.id, l: s.nama })), req: 1 }, { name: 'jenis', label: 'Jenis catatan', type: 'select', options: ['Karakter', 'Komunikasi', 'BK Internal'], req: 1 }, { name: 'isi', label: 'Isi catatan', type: 'textarea', req: 1, max: 800 }],
    onSubmit: async v => { await rpc('simpanCatatanWali', v); toast('Tersimpan', 'Catatan ditambahkan.', 'success'); reload(); } });
}
function cetakKelas() {
  const d = App.data;
  printHtml('<h2>Daftar & Rekap Kelas ' + esc(d.kelas) + '</h2><p>' + esc(d.sekolah) + ' • Semester ' + esc(d.sem) + '</p><table><tr><th>No</th><th>Nama</th><th>NIS</th><th>Status Hari Ini</th><th>Rata-rata Nilai</th><th>Mapel &lt; KKM</th><th>Skor Sikap</th></tr>' + d.siswa.map((s, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(s.nama) + '</td><td>' + esc(s.nis) + '</td><td>' + esc(s.status) + '</td><td>' + (s.avg === null ? '-' : s.avg) + '</td><td>' + s.belum + '</td><td>' + s.skor + '</td></tr>').join('') + '</table>');
}

// ============================================================
// HALAMAN: PORTAL INFORMASI
// ============================================================
PAGES.info = d => {
  App.ui.infoTab = 'pengumuman';
  const adm = a => d.bisaKelola ? '<div class="btn-row mt-1"><button class="btn-x btn-ghost btn-sm-x" onclick="bukaAnn(\'' + a.id + '\')">' + icon('pencil') + ' Ubah</button><button class="btn-x btn-ghost btn-sm-x text-danger-x" onclick="hapusAnn(\'' + a.id + '\')">' + icon('trash') + ' Hapus</button></div>' : '';
  return pageHead('Portal Informasi', 'Pengumuman, agenda kegiatan, dan galeri sekolah', d.bisaKelola ? '<button class="btn-x btn-primary-x" onclick="bukaAnn()">' + icon('plus-lg') + ' Tambah</button>' : '') +
    '<div class="seg" role="tablist" id="infoTabs">' + [['pengumuman', 'Pengumuman'], ['agenda', 'Agenda & Ujian'], ['galeri', 'Galeri']].map((t, i) => '<button type="button" role="tab" class="seg-btn ' + (i ? '' : 'active') + '" data-t="' + t[0] + '" onclick="setInfoTab(\'' + t[0] + '\')">' + t[1] + '</button>').join('') + '</div>' +
    '<section id="inf_pengumuman" class="card-x">' + (d.pengumuman.length ? d.pengumuman.map(a => annRow(a) + (d.bisaKelola ? '<div class="mb-2">' + adm(a) + '</div>' : '')).join('') : empty('megaphone', 'Belum ada pengumuman.')) + '</section>' +
    '<section id="inf_agenda" class="card-x" hidden>' + (d.agenda.length ? d.agenda.map(a => '<div class="ann-row"><span class="kpi-icon tone-warning flex-none" style="flex-direction:column;width:52px;height:52px;line-height:1.1"><b>' + (+a.tanggal.split('-')[2]) + '</b><span class="small-x">' + BULAN[+a.tanggal.split('-')[1] - 1].slice(0, 3) + '</span></span><div class="row-main"><div class="d-flex gap-2 align-items-center flex-wrap"><div class="row-title">' + esc(a.judul) + '</div>' + chip(a.kategori, a.kategori === 'Ujian' ? 'primary' : 'warning') + '</div><div class="row-sub" style="font-size:13px">' + esc(a.isi) + '</div>' + adm(a) + '</div></div>').join('') : empty('calendar-event', 'Tidak ada agenda mendatang.')) + '</section>' +
    '<section id="inf_galeri" hidden>' + (d.galeri.length ? '<div class="gallery">' + d.galeri.map(a => '<button class="p-0 border-0 bg-transparent text-start" onclick="showAnn(\'' + a.id + '\')" aria-label="' + esc(a.judul) + '">' + (a.foto ? '<img src="' + esc(a.foto) + '" alt="' + esc(a.judul) + '" loading="lazy">' : '<div class="skeleton" style="aspect-ratio:4/3"></div>') + '<div class="row-title mt-1">' + esc(a.judul) + '</div><div class="row-sub">' + fmtTgl(a.tanggal) + '</div></button>').join('') + '</div>' : '<div class="card-x">' + empty('images', 'Belum ada dokumentasi kegiatan.') + '</div>') + '</section>';
};
function setInfoTab(t) { ['pengumuman', 'agenda', 'galeri'].forEach(k => { $('inf_' + k).hidden = k !== t; }); document.querySelectorAll('#infoTabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.t === t)); }
function bukaAnn(id) {
  const d = App.data, a = id ? [].concat(d.pengumuman, d.agenda, d.galeri).find(x => x.id === id) : null;
  openForm({ title: a ? 'Ubah Informasi' : 'Tambah Informasi', values: a ? { Judul: a.judul, Isi: a.isi, Kategori: a.kategori, Tanggal: a.tanggal } : { Kategori: 'Pengumuman', Tanggal: todayStr() },
    fields: [{ name: 'Judul', label: 'Judul', req: 1, max: 120 }, { name: 'Isi', label: 'Isi / deskripsi', type: 'textarea', req: 1, max: 1000 }, { name: 'Kategori', label: 'Kategori', type: 'select', options: ['Pengumuman', 'Agenda', 'Ujian', 'Persetujuan', 'Galeri'], req: 1 }, { name: 'Tanggal', label: 'Tanggal (tanggal acara untuk agenda/ujian)', type: 'date', req: 1 },
      { name: '_foto', label: 'Foto (opsional, wajib untuk galeri)', type: 'file', accept: 'image/*', help: 'Foto informasi dapat dilihat siapa pun yang memiliki tautan. Jangan unggah dokumen rahasia.' }],
    onSubmit: async v => { await rpc('simpanPengumuman', { ID: id || '', Judul: v.Judul, Isi: v.Isi, Kategori: v.Kategori, Tanggal: v.Tanggal, _foto: v._foto }); toast('Tersimpan', 'Informasi dipublikasikan.', 'success'); reload(); } });
}
function hapusAnn(id) { confirmBox('Hapus informasi ini?', async () => { try { await rpc('hapusPengumuman', id); toast('Dihapus', 'Informasi dihapus.', 'success'); reload(); } catch (e) { toast('Gagal', e.message, 'danger'); } }, 'Hapus'); }

// ============================================================
// HALAMAN: MASTER DATA (admin)
// ============================================================
PAGES.master = d => {
  App.ui.pg.master = 1; App.ui.masterQ = '';
  return pageHead('Master Data', 'Kelola data pusat: siswa, pengguna & peran, kelas, mapel, jadwal') +
    '<div class="seg" role="tablist">' + d.entities.map(e => '<button type="button" role="tab" class="seg-btn ' + (e.k === d.entity ? 'active' : '') + '" onclick="navigateTo(\'master\',{entity:\'' + e.k + '\'},{noHistory:true})">' + esc(e.l) + '</button>').join('') + '</div>' +
    '<div class="toolbar"><div class="search-box"><i class="bi bi-search" aria-hidden="true"></i><input class="form-control" placeholder="Cari di ' + esc(d.label) + '…" aria-label="Cari data" oninput="App.ui.masterQ=this.value;App.ui.pg.master=1;renderMaster()"></div><button class="btn-x btn-primary-x" style="flex:0 0 auto" onclick="bukaMaster()">' + icon('plus-lg') + ' Tambah ' + esc(d.label) + '</button></div>' +
    '<div class="card-x flush"><div class="table-wrap" id="masterTable"></div></div><div id="masterPager"></div>';
};
INIT.master = () => renderMaster();
function renderMaster() {
  const d = App.data, q = (App.ui.masterQ || '').toLowerCase(), size = 10;
  const list = d.rows.filter(r => !q || d.cols.some(c => String(r[c[0]] === undefined ? '' : r[c[0]]).toLowerCase().indexOf(q) >= 0));
  const rows = slicePg('master', list, size).map(r => '<tr>' + d.cols.map(c => { const v = r[c[0]]; return '<td>' + ((c[0] === 'Status' || c[0] === 'Aktif') ? chip(String(v), v === 'Aktif' || v === 'Ya' ? 'success' : 'muted') : esc(v)) + '</td>'; }).join('') +
    '<td class="text-end" style="white-space:nowrap">' + (d.entity === 'siswa' ? '<button class="btn-x btn-ghost btn-sm-x" onclick="showQR(\'' + r.ID + '\')" aria-label="Kartu QR">' + icon('qr-code') + '</button> ' : '') + (d.entity === 'user' ? '<button class="btn-x btn-ghost btn-sm-x" onclick="resetPw(\'' + r.ID + '\')" aria-label="Reset kata sandi">' + icon('key') + '</button> ' : '') +
    '<button class="btn-x btn-soft btn-sm-x" onclick="bukaMaster(\'' + r.ID + '\')" aria-label="Ubah">' + icon('pencil') + '</button> <button class="btn-x btn-ghost btn-sm-x text-danger-x" onclick="hapusMaster(\'' + r.ID + '\')" aria-label="' + (d.entity === 'siswa' ? 'Nonaktifkan' : 'Hapus') + '">' + icon(d.entity === 'siswa' ? 'person-dash' : 'trash') + '</button></td></tr>').join('');
  $('masterTable').innerHTML = '<table class="table-x"><thead><tr>' + d.cols.map(c => '<th>' + esc(c[1]) + '</th>').join('') + '<th class="text-end">Aksi</th></tr></thead><tbody>' + (rows || '<tr><td colspan="' + (d.cols.length + 1) + '">' + empty('database', 'Belum ada data.') + '</td></tr>') + '</tbody></table>';
  $('masterPager').innerHTML = pager('master', list.length, size, renderMaster);
}
function bukaMaster(id) {
  const d = App.data, r = id ? d.rows.find(x => x.ID === id) : null;
  openForm({ title: (r ? 'Ubah ' : 'Tambah ') + d.label, values: r || {}, fields: d.fields.map(f => Object.assign({}, f)),
    onSubmit: async v => { await rpc('crudSave', d.entity, Object.assign({ ID: id || '' }, v)); toast('Tersimpan', d.label + ' berhasil disimpan.', 'success'); reload(); } });
}
function hapusMaster(id) {
  const d = App.data;
  confirmBox(d.entity === 'siswa' ? 'Nonaktifkan siswa ini? Riwayat data tetap tersimpan dan akun siswa dinonaktifkan.' : 'Hapus data ini secara permanen?', async () => { try { const m = await rpc('crudDelete', d.entity, id); toast('Berhasil', m, 'success'); reload(); } catch (e) { toast('Gagal', e.message, 'danger'); } }, d.entity === 'siswa' ? 'Nonaktifkan' : 'Hapus');
}
function resetPw(id) { confirmBox('Reset kata sandi pengguna ini ke sandi awal?', async () => { try { toast('Berhasil', await rpc('resetPassword', id), 'success'); } catch (e) { toast('Gagal', e.message, 'danger'); } }, 'Reset'); }
function showQR(id) {
  const r = App.data.rows.find(x => x.ID === id);
  if (typeof qrcode === 'undefined') { toast('Gagal', 'Pustaka QR belum termuat. Periksa koneksi internet.', 'danger'); return; }
  const q = qrcode(0, 'M'); q.addData(r.KodeQR); q.make();
  showView('Kartu QR — ' + r.Nama, '<div class="id-card"><div class="id-head">' + esc(App.config.appName || 'SITH-One') + '</div>' + q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) + '<div class="nm">' + esc(r.Nama) + '</div><div>' + esc(r.Kelas) + ' • NIS ' + esc(r.NIS) + '</div><code style="font-size:11px">' + esc(r.KodeQR) + '</code></div>',
    '<button class="btn-x btn-primary-x" onclick="printHtml($(\'viewBody\').innerHTML)">' + icon('printer') + ' Cetak Kartu</button><button type="button" class="btn-x btn-ghost" data-bs-dismiss="modal">Tutup</button>');
}

// ============================================================
// HALAMAN: PENGATURAN (admin)
// ============================================================
PAGES.pengaturan = d => {
  const groups = {}; d.fields.forEach(f => { (groups[f.g] = groups[f.g] || []).push(f); });
  const link = (u, t) => u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + t + '</a>' : '-';
  return pageHead('Pengaturan Aplikasi', 'Identitas, akademik, jam operasional presensi, dan keuangan') +
    '<form onsubmit="simpanPengaturan(event)" novalidate>' + Object.keys(groups).map(g => '<div class="card-x"><h3>' + esc(g) + '</h3><div class="row g-3">' + groups[g].map(f => '<div class="col-12 col-md-6">' + fieldHtml({ name: 'cfg_' + f.k, label: f.l, type: f.t || 'text', options: f.o }, d.values[f.k] === undefined ? '' : d.values[f.k]) + '</div>').join('') + '</div></div>').join('') +
    '<div class="sticky-foot"><button class="btn-x btn-primary-x" id="cfgSave" type="submit">' + icon('check2') + ' Simpan Pengaturan</button></div></form>' +
    '<div class="card-x"><h3>Infrastruktur Data</h3><dl class="kv"><dt>Spreadsheet</dt><dd>' + link(d.info.spreadsheetId && 'https://docs.google.com/spreadsheets/d/' + d.info.spreadsheetId, 'Buka database') + '</dd><dt>Folder Drive</dt><dd>' + link(d.info.folderId && 'https://drive.google.com/drive/folders/' + d.info.folderId, 'Buka folder') + '</dd><dt>Email admin</dt><dd>' + esc(d.info.adminEmail || '-') + '</dd></dl><button class="btn-x btn-soft" onclick="navigateTo(\'master\',{entity:\'user\'})">' + icon('people') + ' Kelola Pengguna & Peran</button></div>';
};
async function simpanPengaturan(ev) {
  ev.preventDefault(); const kv = {};
  App.data.fields.forEach(f => { kv[f.k] = $('f_cfg_' + f.k).value; });
  const b = $('cfgSave'); btnLoading(b, true);
  try { const c = await rpc('simpanPengaturan', kv); applyConfig(c); toast('Tersimpan', 'Pengaturan diperbarui.', 'success'); } catch (e) { toast('Gagal', e.message, 'danger'); } finally { btnLoading(b, false); }
}

// ============================================================
// HALAMAN: PROFIL
// ============================================================
PAGES.profil = d => {
  const u = d.user, dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return pageHead('Profil Saya', '') + '<div class="grid-2"><div><div class="card-x d-flex gap-3 align-items-center">' + avatar(u.nama, d.siswa ? d.siswa.foto : '', 'lg') + '<div><div class="row-title h5 mb-1">' + esc(u.nama) + '</div>' + chip(ROLE_LABEL[u.role] || u.role, 'primary') + '<div class="row-sub mt-1">@' + esc(u.username) + (u.kelas ? ' • ' + esc(u.kelas) : '') + '</div></div></div>' +
    (d.siswa ? '<div class="card-x"><h3>Data Siswa</h3><dl class="kv"><dt>Kelas</dt><dd>' + esc(d.siswa.kelas) + '</dd><dt>NIS</dt><dd>' + esc(d.siswa.nis) + '</dd><dt>NISN</dt><dd>' + esc(d.siswa.nisn) + '</dd></dl></div>' : '') +
    '<div class="card-x"><h3>Tampilan</h3><button class="btn-x btn-ghost btn-block" onclick="toggleTheme();navigateTo(\'profil\',{},{noHistory:true})">' + icon(dark ? 'sun' : 'moon-stars') + ' ' + (dark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap') + '</button></div></div>' +
    '<div><form class="card-x" onsubmit="gantiSandi(event)" novalidate><h3>Ubah Kata Sandi</h3><div class="mb-3"><label class="form-label fw-600" for="pwOld">Kata sandi lama</label><input class="form-control" type="password" id="pwOld" autocomplete="current-password" required></div><div class="mb-3"><label class="form-label fw-600" for="pwNew">Kata sandi baru (min. 6 karakter)</label><input class="form-control" type="password" id="pwNew" autocomplete="new-password" minlength="6" required></div><div class="mb-3"><label class="form-label fw-600" for="pwNew2">Ulangi kata sandi baru</label><input class="form-control" type="password" id="pwNew2" autocomplete="new-password" required></div><button class="btn-x btn-primary-x btn-block" id="pwBtn" type="submit">Simpan Kata Sandi</button></form>' +
    '<button class="btn-x btn-danger-x btn-block" onclick="doLogout()">' + icon('box-arrow-left') + ' Keluar</button></div></div>';
};
async function gantiSandi(ev) {
  ev.preventDefault();
  const a = $('pwOld').value, b = $('pwNew').value, c = $('pwNew2').value;
  if (b.length < 6) { toast('Periksa isian', 'Kata sandi baru minimal 6 karakter.', 'warning'); return; }
  if (b !== c) { toast('Periksa isian', 'Pengulangan kata sandi tidak sama.', 'warning'); return; }
  const btn = $('pwBtn'); btnLoading(btn, true);
  try { await rpc('ubahPassword', a, b); toast('Berhasil', 'Kata sandi diperbarui.', 'success'); ev.target.reset(); } catch (e) { toast('Gagal', e.message, 'danger'); } finally { btnLoading(btn, false); }
}