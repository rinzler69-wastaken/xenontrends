/**
 * components/brief-studio.js — BRIEF STUDIO.
 *
 * Satu modal yang menutup jarak terakhir antara "dashboard sudah menghitung"
 * dan "teks sudah tertempel di grup". Delapan format konten, masing-masing
 * bisa disunting langsung di tempat, dihitung panjangnya terhadap batas
 * platform, diperiksa nadanya oleh Tone Guard, lalu disalin atau diunduh.
 *
 * Keputusan desain yang disengaja:
 *   - Teks bisa DISUNTING sebelum disalin. Generator hanya menyiapkan draf;
 *     penilaian akhir tetap di tangan admin, bukan di tangan mesin.
 *   - Tone Guard berjalan ulang setiap kali teks disunting, jadi kalau admin
 *     menambahkan kalimat yang menjanjikan sesuatu, peringatannya muncul
 *     seketika — bukan setelah terlanjur diposting.
 *   - Tidak ada satu pun angka di sini yang dihitung ulang. Semua diambil
 *     dari state yang sudah dirender ke layar, supaya teks yang diposting
 *     dan dashboard yang di-screenshot tidak pernah bisa berbeda.
 */
import { $, clearNode, createEl } from '../utils/dom.js';
import { FORMATS, buildAll, jumlahTopikEdukasi, jumlahQuiz, jumlahPoll } from '../engine/content-generator.js';
import { checkTone, toneSummary } from '../engine/tone-guard.js';

let stateRef = null;
let formatAktif = 'tg';
let toastFn = () => {};
const offsetRotasi = {};   // id format → berapa kali tombol "ganti materi" ditekan
const suntinganUser = {};  // id format → teks yang sudah disunting admin

/* ============================================================
   UTIL
   ============================================================ */
function stempelWaktu(){
  const n = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}`;
}

function unduhTeks(namaFile, teks){
  const blob = new Blob([teks], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = namaFile;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Salin ke clipboard. API modern butuh secure context — di http://localhost
 * itu terpenuhi, tapi kalau dashboard dibuka lewat IP jaringan lokal
 * (http://192.168.x.x) browser menolaknya. Karena itu ada jalur cadangan
 * lama yang masih bekerja di konteks non-secure.
 */
async function salinTeks(teks){
  try{
    if (navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(teks);
      return true;
    }
    throw new Error('clipboard API tidak tersedia');
  }catch(e){
    try{
      const ta = document.createElement('textarea');
      ta.value = teks;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }catch(e2){ return false; }
  }
}

function formatById(id){ return FORMATS.find(f => f.id === id); }

function jumlahVarian(id, state){
  if (id === 'edukasi') return jumlahTopikEdukasi();
  if (id === 'quiz') return jumlahQuiz(state);
  if (id === 'poll') return jumlahPoll(state);
  return 1;
}

/** Bangun teks untuk satu format, menghormati suntingan & rotasi manual. */
function teksUntuk(id){
  if (suntinganUser[id] != null) return suntinganUser[id];
  const f = formatById(id);
  if (!f || !stateRef) return '';
  try{
    return f.rotasi ? f.build(stateRef, offsetRotasi[id] ?? null) : f.build(stateRef);
  }catch(e){
    console.error('Brief Studio gagal membangun format', id, e);
    return `(format ini gagal dibangun: ${e.message})\n\nIni bug, bukan kondisi pasar. Silakan refresh dashboard lalu coba lagi.`;
  }
}

/* ============================================================
   RENDER
   ============================================================ */
function renderTabs(){
  const wrap = $('bsTabs');
  clearNode(wrap);
  FORMATS.forEach(f => {
    const btn = createEl('button', 'bs-tab' + (f.id === formatAktif ? ' active' : ''));
    btn.innerHTML = `<span class="bs-tab-label">${f.label}</span><span class="bs-tab-hint">${f.hint}</span>`;
    btn.addEventListener('click', () => { formatAktif = f.id; renderTabs(); renderIsi(); });
    wrap.appendChild(btn);
  });
}

function renderMeter(teks){
  const f = formatById(formatAktif);
  const n = teks.length;
  const limit = f.limit;
  const pct = Math.min(100, Math.round((n / limit) * 100));

  const el = $('bsCounter');
  el.textContent = `${n.toLocaleString('id-ID')} / ${limit.toLocaleString('id-ID')} karakter`;
  el.classList.toggle('over', n > limit);

  const fill = $('bsCounterFill');
  fill.style.width = pct + '%';
  fill.style.background = n > limit ? 'var(--down)' : pct > 85 ? 'var(--gold)' : 'var(--up)';

  $('bsCounterNote').textContent = n > limit
    ? `Melebihi batas ${f.hint.split('·')[0].trim()} — potong sebagian atau kirim sebagai dua pesan.`
    : '';
}

function renderToneGuard(teks){
  const hasil = checkTone(teks);
  const badge = $('bsToneBadge');
  badge.textContent = toneSummary(hasil);
  badge.className = 'bs-tone-badge ' + (hasil.violations.length ? 'bad' : hasil.ok ? 'good' : 'warn');

  const detail = $('bsToneDetail');
  clearNode(detail);

  if (hasil.violations.length){
    const judul = createEl('div', 'bs-tone-title', 'Frasa yang perlu diganti sebelum diposting:');
    detail.appendChild(judul);
    hasil.violations.forEach(v => {
      const row = createEl('div', 'bs-tone-row');
      row.innerHTML = `<code>${v.word}</code> <span>— ${v.why}</span>`;
      detail.appendChild(row);
    });
  }
  hasil.notes.forEach(n => {
    detail.appendChild(createEl('div', 'bs-tone-note', n));
  });
  if (hasil.ok && !hasil.notes.length){
    detail.appendChild(createEl('div', 'bs-tone-note',
      'Tidak ada klaim kepastian, disclaimer terpasang, dan bahasa probabilistiknya cukup. Aman diposting.'));
  }
}

function renderIsi(){
  const f = formatById(formatAktif);
  const teks = teksUntuk(formatAktif);

  const ta = $('bsTextarea');
  ta.value = teks;

  // Tombol "ganti materi" hanya relevan untuk format yang punya pustaka
  const varian = jumlahVarian(formatAktif, stateRef);
  const rotBtn = $('bsRotateBtn');
  if (f.rotasi && varian > 1){
    rotBtn.style.display = '';
    const posisi = ((offsetRotasi[formatAktif] ?? 0) % varian + varian) % varian;
    rotBtn.textContent = `🔀 Ganti materi (${posisi + 1}/${varian})`;
  } else {
    rotBtn.style.display = 'none';
  }

  const resetBtn = $('bsResetBtn');
  resetBtn.style.display = suntinganUser[formatAktif] != null ? '' : 'none';

  renderMeter(teks);
  renderToneGuard(teks);
}

/* ============================================================
   API PUBLIK
   ============================================================ */
export function openBriefStudio(state, showToast){
  if (!state){
    showToast('Data belum siap — tunggu dashboard selesai memuat');
    return;
  }
  stateRef = state;
  toastFn = showToast || (() => {});
  $('briefStudioModal').classList.add('show');
  document.body.style.overflow = 'hidden';
  renderTabs();
  renderIsi();
}

export function closeBriefStudio(){
  $('briefStudioModal').classList.remove('show');
  document.body.style.overflow = '';
}

/** Dipanggil sekali saat boot. */
export function wireBriefStudio(getState, showToast){
  toastFn = showToast || (() => {});

  $('briefStudioBtn').addEventListener('click', () => openBriefStudio(getState(), showToast));
  $('bsClose').addEventListener('click', closeBriefStudio);
  $('briefStudioModal').addEventListener('click', (e) => {
    if (e.target.id === 'briefStudioModal') closeBriefStudio();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('briefStudioModal').classList.contains('show')) closeBriefStudio();
  });

  // Suntingan manual: simpan, lalu jalankan ulang meter & tone guard supaya
  // peringatan muncul saat mengetik, bukan setelah menyalin.
  $('bsTextarea').addEventListener('input', (e) => {
    suntinganUser[formatAktif] = e.target.value;
    $('bsResetBtn').style.display = '';
    renderMeter(e.target.value);
    renderToneGuard(e.target.value);
  });

  $('bsCopyBtn').addEventListener('click', async () => {
    const teks = $('bsTextarea').value;
    const hasil = checkTone(teks);
    const ok = await salinTeks(teks);
    if (!ok){ toastFn('❌ Gagal menyalin — pilih teksnya lalu salin manual'); return; }
    if (hasil.violations.length){
      toastFn(`✓ Tersalin — tapi ada ${hasil.violations.length} frasa yang sebaiknya diganti dulu`);
    } else {
      toastFn('✓ Tersalin — siap ditempel ke grup');
    }
    const b = $('bsCopyBtn');
    const t = b.textContent;
    b.textContent = '✓ Tersalin!';
    b.classList.add('copied');
    setTimeout(() => { b.textContent = t; b.classList.remove('copied'); }, 1800);
  });

  $('bsRotateBtn').addEventListener('click', () => {
    offsetRotasi[formatAktif] = (offsetRotasi[formatAktif] ?? 0) + 1;
    delete suntinganUser[formatAktif]; // materi baru, suntingan lama tidak relevan
    renderIsi();
  });

  $('bsResetBtn').addEventListener('click', () => {
    delete suntinganUser[formatAktif];
    renderIsi();
    toastFn('Kembali ke draf asli dari data dashboard');
  });

  $('bsDownloadBtn').addEventListener('click', () => {
    unduhTeks(`ArgonPulse-${formatAktif}-${stempelWaktu()}.txt`, $('bsTextarea').value);
    toastFn('✓ Format ini tersimpan sebagai .txt');
  });

  $('bsDownloadAllBtn').addEventListener('click', () => {
    if (!stateRef){ toastFn('Data belum siap'); return; }
    const semua = buildAll(stateRef);
    const bagian = [];
    bagian.push('# Paket Konten Grup — ArgonPulse⚡');
    bagian.push(`Dibuat ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`);
    bagian.push('');
    bagian.push('Semua angka di bawah berasal dari satu pengambilan data yang sama,');
    bagian.push('jadi brief, caption, quiz, dan scorecard di file ini konsisten satu sama lain.');
    bagian.push('');
    FORMATS.forEach(f => {
      // Gunakan teksUntuk(f.id) agar menghormati suntingan admin MAUPUN rotasi materi (🔀)
      const isi = teksUntuk(f.id) || semua[f.id];
      bagian.push('');
      bagian.push('─'.repeat(60));
      bagian.push(`## ${f.label} — ${f.hint}`);
      bagian.push('─'.repeat(60));
      bagian.push('');
      bagian.push(isi);
      bagian.push('');
    });
    unduhTeks(`ArgonPulse-paket-konten-${stempelWaktu()}.md`, bagian.join('\n'));
    toastFn(`✓ Paket ${FORMATS.length} format tersimpan — tinggal buka dan salin per bagian`);
  });
}

/** Dipanggil tiap render supaya Studio selalu memakai data terbaru. */
export function refreshBriefStudioState(state){
  stateRef = state;
  const modal = $('briefStudioModal');
  if (modal && modal.classList.contains('show')) renderIsi();
}
