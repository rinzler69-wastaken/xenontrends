/**
 * rsi.js — Relative Strength Index memakai Wilder's Smoothing Method
 * (J. Welles Wilder Jr., 1978), BUKAN simple moving average.
 *
 * Ini keputusan metodologis eksplisit dari Bab 7.2 dokumen konsep:
 * Wilder's Smoothing adalah standar de-facto di semua platform charting
 * profesional (TradingView, Bloomberg), sehingga angka RSI yang tampil
 * di sini konsisten dengan yang biasa dilihat trader di platform lain —
 * poin penting untuk kredibilitas, karena RSI yang "beda sendiri" (meski
 * secara matematis SMA-based juga valid) langsung dipertanyakan.
 */

/**
 * @param {Array<[number, number]>} pricesArray [[timestamp, price], ...]
 * @param {number} [period=14]
 * @returns {number|null} RSI 0-100, atau null kalau data kurang
 */
export function calcRSIWilder(pricesArray, period, intervalMs){
  period = period || 14;
  if (!pricesArray || pricesArray.length < period + 1) return null;

  let closes;
  if (intervalMs && intervalMs > 0 && Array.isArray(pricesArray[0]) && pricesArray[0].length >= 2){
    const buckets = new Map();
    for (let i = 0; i < pricesArray.length; i++){
      const ts = pricesArray[i][0];
      const price = pricesArray[i][1];
      if (typeof price === 'number' && Number.isFinite(price)){
        buckets.set(Math.floor(ts / intervalMs), price);
      }
    }
    closes = Array.from(buckets.values());
  } else {
    closes = pricesArray.map(p => p[1]).filter(v => typeof v === 'number' && Number.isFinite(v));
  }

  if (closes.length < period + 1) return null;
  const changes = [];
  for (let i = 1; i < closes.length; i++){
    changes.push(closes[i] - closes[i - 1]);
  }
  if (changes.length < period) return null;

  // Seed: SMA dari `period` perubahan pertama
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++){
    const c = changes[i];
    if (c >= 0) avgGain += c; else avgLoss += Math.abs(c);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smoothing Wilder's untuk sisa data: avg_t = (avg_(t-1) * (period-1) + current) / period
  for (let i = period; i < changes.length; i++){
    const c = changes[i];
    const gain = c >= 0 ? c : 0;
    const loss = c < 0 ? Math.abs(c) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - (100 / (1 + rs)));
}
