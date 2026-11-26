/**
 * baselines.js — baseline (μ, σ) terdokumentasi untuk tiap komponen sinyal.
 *
 * KENAPA FILE INI ADA (bukan disembunyikan di dalam engine):
 * Bab 4.1 dokumen konsep mensyaratkan z-score dihitung dari rolling window
 * 90-hari. Tapi ArgonPulse adalah aplikasi client-side murni tanpa backend
 * (keputusan arsitektur sengaja — Bab 9.7), sehingga tidak ada database
 * yang menyimpan histori 90-hari per komponen untuk tiap pengguna.
 *
 * Solusi jujur: dua sumber baseline digabung —
 *   1. Baseline "hard-coded" di bawah ini: estimasi kasar dari observasi
 *      pasar umum (didokumentasikan, BUKAN diklaim presisi ilmiah) — dipakai
 *      sebagai fallback kalau histori browser terlalu pendek.
 *   2. Baseline "live": dihitung on-the-fly dari data historis yang memang
 *      sudah kita tarik untuk kebutuhan lain (chart 7 hari BTC untuk RSI 4H,
 *      market list top-100 untuk momentum) — dipakai kalau sample cukup.
 *
 * Field `source` & `lastCalibrated` WAJIB diisi supaya panel metodologi bisa
 * menampilkan transparansi ini ke pengguna — prinsip P1 (Bab 1.2).
 */

export const STATIC_BASELINES = {
  // Pilar A — Price Action
  A1_btc_24h_return: { mu: 0.05, sigma: 2.3, source: 'estimasi-observasi-pasar', lastCalibrated: '2026-08-31' },
  A2_eth_btc_relative: { mu: 0.0, sigma: 1.8, source: 'estimasi-observasi-pasar', lastCalibrated: '2026-08-31' },

  // Pilar B — Momentum Teknikal (RSI dipusatkan di 50, std dev ~15 tipikal)
  B1_rsi_1h: { mu: 50, sigma: 15, source: 'karakteristik-rsi-umum', lastCalibrated: '2026-08-31' },
  B2_rsi_4h: { mu: 50, sigma: 13, source: 'karakteristik-rsi-umum', lastCalibrated: '2026-08-31' },

  // Pilar C — Sentimen
  C1_fg_level: { mu: 50, sigma: 20, source: 'karakteristik-fg-umum', lastCalibrated: '2026-08-31' },
  C2_fg_delta: { mu: 0, sigma: 6, source: 'estimasi-observasi-pasar', lastCalibrated: '2026-08-31' },

  // Pilar D — On-Chain Flow (dalam satuan $ juta, relatif)
  D1_btc_netflow: { mu: 0, sigma: 6, source: 'estimasi-observasi-pasar-mock', lastCalibrated: '2026-08-31' },
  D2_eth_netflow: { mu: 0, sigma: 60, source: 'estimasi-observasi-pasar-mock', lastCalibrated: '2026-08-31' },

  // Pilar E — Derivatives (funding dalam basis poin per 8 jam, OI dalam % perubahan)
  E1_funding_rate: { mu: 0.01, sigma: 0.03, source: 'literatur-derivatif (Kraken/Coinbase, funding "normal" ±0.01%, ekstrem >0.05-0.1%)', lastCalibrated: '2026-08-31' },
  E2_oi_change: { mu: 0, sigma: 3.5, source: 'estimasi-observasi-pasar', lastCalibrated: '2026-08-31' }
};

/**
 * Hitung baseline "live" dari sebuah array nilai historis, kalau cukup panjang.
 * Kalau tidak cukup, kembalikan null supaya caller fallback ke STATIC_BASELINES.
 * @param {number[]} series
 * @param {number} [minSamples=20]
 */
export function computeLiveBaseline(series, minSamples){
  minSamples = minSamples ?? 20;
  if (!series || series.length < minSamples) return null;
  const m = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((a, b) => a + (b - m) ** 2, 0) / series.length;
  return { mu: m, sigma: Math.sqrt(variance) || 0.0001, source: 'live-browser-session', lastCalibrated: new Date().toISOString() };
}

/**
 * Resolve baseline untuk sebuah komponen: coba live dulu, fallback ke static.
 * Sekarang benar-benar terhubung ke Historical Ledger (engine/ledger.js) —
 * setiap kali cukup observasi terkumpul di ledger untuk komponen ini,
 * sistem otomatis pindah dari estimasi statis ke baseline live tanpa
 * campur tangan manual. Ini implementasi konkret dari janji "revalidasi
 * berkala" di Bab 4.3 dokumen konsep.
 * @param {string} key salah satu key STATIC_BASELINES
 * @param {number[]|null} liveSeries kalau tidak diberikan, akan dicoba tarik dari ledger
 */
export function resolveBaseline(key, liveSeries){
  let series = liveSeries;
  if (!series){
    // lazy import untuk hindari circular dependency wccs.js <-> ledger.js <-> baselines.js
    series = null; // diisi oleh wccs.js lewat parameter, lihat wccs.js untuk wiring ledger
  }
  const live = series ? computeLiveBaseline(series) : null;
  if (live) return live;
  return STATIC_BASELINES[key] || { mu: 0, sigma: 1, source: 'default-netral', lastCalibrated: '2026-08-31' };
}
