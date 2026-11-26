/**
 * statistics.js — primitif statistik yang jadi tulang punggung WCCS
 * (Weighted Composite Confluence Score), sesuai Bab 4 dokumen konsep:
 * Metodologi Normalisasi & Validasi.
 *
 * Karena kita tidak punya backend untuk menyimpan histori 90-hari penuh
 * per pengguna, rolling baseline (μ, σ) didekati dari data historis yang
 * SUDAH kita tarik untuk keperluan lain (chart 7 hari, dsb) plus fallback
 * ke baseline terdokumentasi (lihat baselines.js) ketika sample historis
 * yang tersedia di browser terlalu pendek. Ini trade-off yang didokumentasikan
 * secara eksplisit — bukan disembunyikan — karena murni client-side tanpa
 * database historis jangka panjang adalah batasan arsitektur yang disengaja
 * (Bab 9.7: prioritas "client-side murni, tanpa server wajib").
 */

/**
 * Hitung mean sederhana.
 * @param {number[]} arr
 */
export function mean(arr){
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Standar deviasi populasi (bukan sample) — dipilih karena baseline kita
 * memperlakukan window historis sebagai populasi referensi lengkap untuk
 * rezim itu, bukan sample dari populasi lebih besar.
 * @param {number[]} arr
 */
export function stdDev(arr){
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  const variance = mean(arr.map(x => (x - m) ** 2));
  return Math.sqrt(variance);
}

/**
 * Z-score sebuah nilai relatif terhadap baseline (μ, σ) — Bab 4.1.
 * @param {number} x nilai mentah
 * @param {number} mu rata-rata baseline
 * @param {number} sigma std dev baseline
 * @returns {number}
 */
export function zScore(x, mu, sigma){
  if (sigma === 0 || sigma == null || isNaN(sigma)) return 0;
  return (x - mu) / sigma;
}

/**
 * Winsorize (cap) nilai z ke rentang ±limit — Bab 4.1, mencegah satu
 * outlier ekstrem mendominasi agregasi komposit secara tidak proporsional.
 * @param {number} z
 * @param {number} [limit=3]
 */
export function winsorize(z, limit){
  limit = limit ?? 3;
  return Math.max(-limit, Math.min(limit, z));
}

/**
 * Korelasi Pearson antar dua array sama panjang — dipakai untuk uji
 * redundansi antar-komponen (Bab 4.2).
 * @param {number[]} a
 * @param {number[]} b
 */
export function pearsonCorrelation(a, b){
  if (!a || !b || a.length !== b.length || a.length < 2) return 0;
  const ma = mean(a), mb = mean(b);
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < a.length; i++){
    const da = a[i] - ma, db = b[i] - mb;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (den === 0) return 0;
  return num / den;
}

/**
 * CrowdingIntensity — transformasi non-linear khusus Pilar E (Bab 4.5).
 * Funding rate/OI TIDAK monoton seperti pilar lain: ekstrem di kedua arah
 * sama-sama menandakan risiko crowding/squeeze, bukan makin kuatnya tren.
 * Begitu |z| melewati crowdingZ, kontribusi ke arah tren didiskon.
 *
 * @param {number} z z-score mentah komponen E
 * @param {number} crowdingZ ambang mulai mendiskon (default dari config THRESHOLDS)
 * @param {number} penaltyRate seberapa cepat diskon bertambah per unit |z| di atas ambang
 * @returns {{value:number, isCrowded:boolean}}
 */
export function crowdingIntensity(z, crowdingZ, penaltyRate){
  const absZ = Math.abs(z);
  const capped = Math.max(-3, Math.min(3, z));
  if (absZ <= crowdingZ){
    return { value: capped, isCrowded: false };
  }
  const penalty = Math.max(0, 1 - penaltyRate * (absZ - crowdingZ));
  return { value: capped * penalty, isCrowded: true };
}
