/**
 * narrative.js — Bab 8 dokumen konsep: Narrative Decomposition Engine.
 * Mengubah WCCS + breakdown komponen jadi kalimat Bahasa Indonesia yang
 * jujur, mengikuti algoritma 6 langkah Bab 8.2, plus kondisi falsifiability
 * wajib (Bab 10.4) di tiap output.
 */
import { formatPercent, formatCompact, formatFundingRate } from '../utils/formatters.js';

const LABELS = {
  A1_btc_24h_return: 'return 24h BTC',
  A2_eth_btc_relative: 'kekuatan relatif ETH vs BTC',
  B1_rsi_1h: 'RSI 1H',
  B2_rsi_4h: 'RSI 4H',
  C1_fg_level: 'level Fear & Greed',
  C2_fg_delta: 'perubahan sentimen 24h',
  D1_btc_netflow: 'netflow BTC ke exchange',
  D2_eth_netflow: 'netflow ETH ke exchange',
  E1_funding_rate: 'funding rate BTC',
  E2_oi_change: 'perubahan open interest'
};

function describeComponent(c){
  const label = LABELS[c.key] || c.key;
  const dir = c.z >= 0 ? 'mendukung bullish' : 'mendukung bearish';
  return `${label} (${dir}${c.isCrowded ? ', TAPI di zona crowded' : ''})`;
}

/**
 * Bab 4.3 dokumen konsep: cek apakah baseline (μ,σ) yang dipakai top-2
 * kontributor sudah "live" (dihitung dari histori sesi berjalan) atau
 * masih pakai patokan umum. Dipakai untuk menyisipkan catatan singkat di
 * UI — bahasanya disengaja tetap tenang dan wajar (seperti disclaimer
 * umum di aplikasi finansial pada umumnya), bukan menjelaskan detail
 * teknis internal yang bisa disalahpahami sebagai "sistem belum matang".
 * Fakta yang mendasarinya tetap sama, hanya cara penyampaiannya yang
 * disesuaikan untuk pembaca umum.
 * @param {object[]} components
 */
export function assessEstimateQuality(components){
  const top2 = components.slice(0, 2);
  const nonLiveOnes = top2.filter(c =>
    c.baseline && c.baseline.source && c.baseline.source !== 'live-browser-session'
  );

  if (nonLiveOnes.length === 0) return null; // semua live, tidak perlu catatan tambahan

  return `Catatan: pembacaan ini adalah indikasi awal berdasarkan kondisi pasar saat ini, bukan kepastian arah. Gunakan sebagai salah satu bahan pertimbangan, bukan acuan tunggal — selalu cek ulang sebelum mengambil keputusan.`;
}

/**
 * Bab 8.2 — algoritma dekomposisi.
 * @param {object[]} sortedComponents keluaran computeWCCS().components (sudah terurut |contribution| desc)
 * @param {{label:string, tone:string}} classification
 * @param {number} wccs
 * @param {object} [divergence] hasil buildDivergenceMatrix (opsional, prioritas tampil kalau ada)
 * @param {object} [crowdingFlag] {isCrowded:boolean, direction:'long'|'short'}
 */
export function buildNarrative(sortedComponents, classification, wccs, divergence, crowdingFlag){
  const top2 = sortedComponents.slice(0, 2);
  let mainText, invalidation;

  // Prioritas 1: divergensi harga vs flow (paling tajam, Bab 6)
  if (divergence && (divergence.btc.detected || divergence.eth.detected)){
    const d = divergence.btc.detected ? divergence.btc : divergence.eth;
    const assetName = d.asset;
    if (d.type === 'bearish-div'){
      mainText = `${assetName} naik tapi netflow exchange menunjukkan tekanan jual tersembunyi (z-flow ${d.zFlow.toFixed(2)}) — kenaikan harga kurang didukung akumulasi riil, waspada exhaustion jangka pendek.`;
    } else {
      mainText = `${assetName} turun namun netflow exchange justru menunjukkan akumulasi (z-flow ${d.zFlow.toFixed(2)}) — koreksi ini kemungkinan profit taking jangka pendek, bukan keluarnya modal besar.`;
    }
    invalidation = `Pembacaan ini salah kalau netflow ${assetName} berbalik arah dalam 1-2 siklus data berikutnya, atau kalau volume yang mendasari netflow ini didominasi satu wallet tunggal (bukan agregasi banyak pelaku) — cek breakdown transaksi di panel metodologi.`;
  }
  // Prioritas 2: crowding ekstrem di Pilar E (Bab 4.5, 11.5)
  else if (crowdingFlag && crowdingFlag.isCrowded){
    const dirText = crowdingFlag.direction === 'long' ? 'long' : 'short';
    mainText = `Funding rate & open interest menunjukkan posisi ${dirText} sudah crowded — ini sinyal RISIKO squeeze berlawanan arah, bukan konfirmasi tren makin kuat. WCCS keseluruhan (${classification.label}) tetap dihitung dari 10 komponen, tapi confidence untuk melanjutkan posisi searah crowding ini sebaiknya lebih rendah dari angka yang tertera.`;
    invalidation = `Kondisi crowding ini biasanya terurai dalam hitungan jam-hari, bukan minggu. Kalau funding rate kembali ke rentang normal (|z| < 1.5) di siklus data berikutnya tanpa terjadi squeeze, itu artinya crowding mereda secara organik — bukan berarti pembacaan awal salah, tapi risiko sudah lewat.`;
  }
  // Prioritas 3: dekomposisi top-2 kontributor (kasus umum)
  else if (top2.length >= 2){
    const [c1, c2] = top2;
    const sameDirection = Math.sign(c1.z) === Math.sign(c2.z);
    if (sameDirection){
      mainText = `Dua kontributor utama searah: ${describeComponent(c1)} dan ${describeComponent(c2)}. Konfluensi ini yang mendasari klasifikasi ${classification.label}.`;
      invalidation = `Kalau salah satu dari dua komponen ini berbalik arah signifikan di update berikutnya, klasifikasi ${classification.label} kemungkinan besar berubah — komponen-komponen ini yang paling perlu dipantau, bukan rata-rata keseluruhan.`;
    } else if (Math.abs(c1.contribution) > Math.abs(c2.contribution) * 1.8){
      mainText = `Skor didominasi ${describeComponent(c1)}, meski ada tarikan berlawanan dari ${describeComponent(c2)} yang belum cukup kuat mengubah arah keseluruhan.`;
      invalidation = `Kalau ${describeComponent(c2)} menguat lebih jauh sementara ${describeComponent(c1)} melemah, keseimbangan bisa berbalik ke MIXED atau bahkan arah sebaliknya.`;
    } else {
      mainText = `Sinyal saling meniadakan: ${describeComponent(c1)} vs ${describeComponent(c2)} punya magnitudo yang setara tapi berlawanan arah. Ini kasus MIXED asli — bukan sekadar lemah, tapi genuinely dua kekuatan yang saling menahan.`;
      invalidation = `Klasifikasi MIXED ini valid selama tidak ada komponen lain yang tiba-tiba melonjak signifikan (|z| > 1.5) dan memecah kebuntuan ini secara sepihak.`;
    }
  } else {
    mainText = `Data komponen belum cukup untuk dekomposisi naratif yang bermakna.`;
    invalidation = `Tunggu siklus refresh berikutnya.`;
  }

  const estimateDisclaimer = assessEstimateQuality(sortedComponents);

  return { mainText, invalidation, classification, estimateDisclaimer };
}

/**
 * Bangun ringkasan TL;DR 1 kalimat (untuk toggle mode ringkas, Bab 11).
 */
export function buildTldr(narrative, classification, confidence){
  return `${classification.label} (confidence ${confidence}%) — ${narrative.mainText}`;
}

export { formatPercent, formatCompact, formatFundingRate };
