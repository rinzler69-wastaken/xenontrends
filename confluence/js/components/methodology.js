/**
 * components/methodology.js — panel metodologi (Bab 11.3), diakses lewat
 * ikon "ⓘ Metodologi" di footer. Sengaja disembunyikan dari tampilan
 * default (Prinsip P5, Bab 1.2) tapi selalu bisa diakses untuk transparansi.
 */
import { $ } from '../utils/dom.js';
import { WEIGHTS } from '../config.js';
import { STATIC_BASELINES } from '../engine/baselines.js';
import { SIGN_ORIENTATION } from '../engine/sign-validation.js';
import { computeTrackRecord, computeBaselineProgress } from '../engine/ledger.js';

const PILLAR_NAMES = {
  A: 'Price Action & Trend', B: 'Momentum Teknikal', C: 'Sentimen Pasar',
  D: 'On-Chain Flow', E: 'Derivatives & Leverage Positioning'
};

export function renderMethodologyPanel(){
  const pillarRows = Object.entries(WEIGHTS.pillars).map(([key, w]) =>
    `<tr><td>${key} — ${PILLAR_NAMES[key]}</td><td>${(w * 100).toFixed(0)}%</td></tr>`
  ).join('');

  const componentRows = Object.entries(SIGN_ORIENTATION).map(([key, meta]) => {
    const baseline = STATIC_BASELINES[key];
    const orientLabel = meta.orientation === 1 ? '+1 (searah)' : meta.orientation === -1 ? '−1 (berlawanan)' : 'non-linear (Pilar E)';
    return `<tr>
      <td>${key}</td>
      <td>${orientLabel}</td>
      <td>${meta.validated ? '✓ tervalidasi' : '⏳ dari literatur, belum diuji ulang'}</td>
      <td class="methodology-note">${meta.note}</td>
    </tr>`;
  }).join('');

  const tr = computeTrackRecord();
  const bp = computeBaselineProgress();
  const trText = tr.ready
    ? `Hit rate ${tr.hitRate}% dari ${tr.sampleSize} sinyal dievaluasi, Brier score ${tr.brierScore}.`
    : `${tr.sampleSize} sinyal terkumpul, minimal 5 dibutuhkan sebelum hit rate ditampilkan.`;

  $('methodologyContent').innerHTML = `
    <h3>Bobot Pilar (Bab 5.1)</h3>
    <table class="methodology-table">
      <thead><tr><th>Pilar</th><th>Bobot</th></tr></thead>
      <tbody>${pillarRows}</tbody>
    </table>

    <h3>Orientasi & Status Validasi Komponen (Bab 4.3)</h3>
    <table class="methodology-table methodology-table-wide">
      <thead><tr><th>Komponen</th><th>Orientasi</th><th>Status</th><th>Catatan</th></tr></thead>
      <tbody>${componentRows}</tbody>
    </table>

    <h3>Rekam Jejak & Baseline Live (Bab 10.3, 4.1)</h3>
    <p class="methodology-note" style="font-size:12px; padding:8px 0;">
      ${trText} Baseline live (menggantikan estimasi statis) untuk komponen harga BTC:
      ${bp.current}/${bp.target} observasi terkumpul (${bp.pct}%)${bp.isLiveReady ? ', sudah aktif.' : '.'}
      Detail lengkap ada di panel "Rekam Jejak Sinyal" pada halaman utama.
    </p>

    <h3>Batas Kejujuran Intelektual</h3>
    <p class="methodology-disclaimer">
      ArgonPulse⚡ tidak mengklaim memprediksi pasar. WCCS (Weighted Composite Confluence Score)
      adalah cara yang lebih disiplin dan transparan untuk merangkum informasi publik yang sudah
      tersedia — bukan sumber informasi baru, bukan bola kristal. Orientasi tanda tiap komponen
      di atas berasal dari literatur yang dikutip per baris (belum diuji ulang dari nol oleh kami
      sendiri karena aplikasi ini baru berjalan dan belum punya 90 hari data historis sendiri).
      Revalidasi terjadwal setiap 90 hari begitu data cukup. Edukasi, bukan financial advice. DYOR.
    </p>
  `;
}

export function toggleMethodologyPanel(){
  const modal = $('methodologyModal');
  modal.classList.toggle('show');
}
