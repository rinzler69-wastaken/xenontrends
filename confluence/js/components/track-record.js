/**
 * components/track-record.js — panel "Rekam Jejak" yang menampilkan hit
 * rate & Brier score dari Historical Ledger (Bab 10.3), plus progress
 * transisi baseline statis → live (Bab 4.1). Ini bagian paling penting
 * secara filosofis: produk yang berani menunjukkan seberapa akurat dirinya
 * SENDIRI, termasuk saat salah, jauh lebih kredibel daripada yang selalu
 * terdengar yakin tapi tidak pernah diaudit.
 */
import { $ } from '../utils/dom.js';

export function renderTrackRecord(trackRecord, baselineProgress){
  const el = $('trackRecordContent');

  if (!trackRecord.ready){
    el.innerHTML = `
      <div class="track-empty">
        <p>Rekam jejak sedang terkumpul di perangkat ini. Setiap kali dashboard dibuka,
        sinyal saat itu dicatat lokal (di browser kamu, bukan server), lalu 24 jam kemudian
        dicek otomatis apakah arahnya sesuai pergerakan harga.</p>
        <p class="track-count">${trackRecord.sampleSize} dari minimal 5 sinyal terevaluasi terkumpul.</p>
      </div>`;
  } else {
    const hitColor = trackRecord.hitRate >= 60 ? 'up' : trackRecord.hitRate >= 45 ? 'neutral' : 'down';
    el.innerHTML = `
      <div class="track-grid">
        <div class="track-stat">
          <div class="track-stat-label">Hit Rate</div>
          <div class="track-stat-value ${hitColor}">${trackRecord.hitRate}%</div>
          <div class="track-stat-sub">dari ${trackRecord.sampleSize} sinyal dievaluasi</div>
        </div>
        <div class="track-stat">
          <div class="track-stat-label">Brier Score</div>
          <div class="track-stat-value">${trackRecord.brierScore}</div>
          <div class="track-stat-sub">0 = sempurna, 1 = terburuk</div>
        </div>
      </div>
      ${renderRegimeBreakdown(trackRecord.regimeBreakdown)}
      <p class="track-note">Dihitung dari histori sinyal di perangkat ini sendiri (localStorage),
      bukan klaim global. Angka ini akan makin bermakna seiring waktu penggunaan.</p>`;
  }

  const progressEl = $('baselineProgressContent');
  const bp = baselineProgress;
  progressEl.innerHTML = `
    <div class="bp-row">
      <div class="bp-track"><div class="bp-fill" style="width:${bp.pct}%;"></div></div>
      <span class="bp-label">${bp.current}/${bp.target} observasi ${bp.isLiveReady ? '— baseline live aktif' : 'menuju baseline live'}</span>
    </div>`;
}

/**
 * v2.3 — pecahan akurasi per rezim pasar. Ini pertanyaan yang jauh lebih
 * berguna daripada hit rate tunggal: bukan "seberapa akurat sistem ini",
 * tapi "di kondisi pasar seperti apa sistem ini bisa dipercaya". Sebuah
 * sistem yang akurat 70% di pasar tren dan 40% di pasar sideways adalah
 * sistem yang berguna — asal kamu tahu sedang berada di yang mana.
 *
 * Rezim baru mulai dicatat sejak v2.3, jadi entri lama muncul sebagai
 * "Tidak tercatat". Itu ditampilkan apa adanya, bukan disembunyikan.
 */
function renderRegimeBreakdown(breakdown){
  if (!breakdown || breakdown.length === 0) return '';
  const adaYangSiap = breakdown.some(b => b.ready);

  const rows = breakdown.map(b => `
    <div class="tr-regime-row">
      <span class="tr-regime-label">${b.label}</span>
      <span class="tr-regime-n">${b.sampleSize} sinyal</span>
      <span class="tr-regime-hit ${b.hitRate == null ? 'muted' : b.hitRate >= 55 ? 'up' : b.hitRate >= 45 ? '' : 'down'}">
        ${b.hitRate == null ? 'belum cukup' : b.hitRate + '%'}
      </span>
    </div>`).join('');

  return `
    <div class="tr-regime-block">
      <div class="track-stat-label" style="margin-bottom:6px;">Akurasi per rezim pasar</div>
      ${rows}
      <p class="track-note">${adaYangSiap
        ? 'Pecahan ini baru ditampilkan untuk rezim dengan minimal 5 sinyal terevaluasi. Memecah sampel kecil jadi lebih kecil lagi menghasilkan angka yang terlihat spesifik tapi tidak berarti apa-apa.'
        : 'Belum ada rezim yang mencapai 5 sinyal terevaluasi. Angkanya ditahan sampai sampelnya cukup, alih-alih ditampilkan sebagai persentase yang menyesatkan.'}</p>
    </div>`;
}

export function toggleTrackRecord(){
  const panel = $('trackRecordPanel');
  const btn = $('trackRecordToggle');
  const isOpen = panel.classList.toggle('open');
  btn.textContent = isOpen ? 'Sembunyikan Rekam Jejak ↑' : '📊 Rekam Jejak Sinyal →';
}
