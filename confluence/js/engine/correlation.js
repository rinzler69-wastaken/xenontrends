/**
 * engine/correlation.js — MATRIKS KORELASI & DIVERSIFIKASI SEMU.
 *
 * Kesalahan paling mahal yang bisa dilakukan seseorang dengan portofolio
 * kripto adalah mengira dia terdiversifikasi karena memegang delapan koin
 * berbeda — padahal kedelapannya bergerak nyaris identik. Ketika pasar
 * turun, delapan posisi itu berperilaku persis seperti satu posisi besar.
 *
 * Modul ini menghitungnya secara eksplisit dari data `sparkline_in_7d`
 * milik CoinGecko (≈168 titik harga per jam selama 7 hari) yang SUDAH ikut
 * terbawa dalam panggilan /coins/markets. Nol panggilan API tambahan untuk
 * informasi yang biasanya cuma ada di terminal berbayar.
 *
 * Batasnya: 7 hari itu jendela pendek. Korelasi jangka pendek bisa berubah
 * drastis saat rezim berubah — justru itu alasannya dihitung ulang tiap
 * hari alih-alih memakai angka hafalan "altcoin korelasi 0,8 dengan BTC".
 */
import { pearsonCorrelation, mean } from './statistics.js';
import { THRESHOLDS } from '../config.js';
import { tradableUniverse } from './breadth.js';

function returnsDariSparkline(m){
  const p = m?.sparkline_in_7d?.price;
  if (!Array.isArray(p) || p.length < 24) return null;
  const out = [];
  for (let i = 1; i < p.length; i++){
    if (p[i - 1] > 0 && p[i] > 0) out.push(Math.log(p[i] / p[i - 1]));
  }
  return out.length >= 20 ? out : null;
}

/**
 * @param {Array} markets hasil /coins/markets (harus dengan sparkline=true)
 * @param {number} [n=8] berapa koin teratas yang dimasukkan matriks
 */
export function computeCorrelation(markets, n){
  n = n ?? 8;
  const uni = tradableUniverse(markets);
  if (!uni.length) return { available: false };

  const kandidat = [];
  for (const m of uni){
    const r = returnsDariSparkline(m);
    if (r) kandidat.push({ ticker: (m.symbol || '').toUpperCase(), name: m.name, r });
    if (kandidat.length >= n) break;
  }
  if (kandidat.length < 3){
    return {
      available: false,
      alasan: 'Data sparkline 7 hari tidak tersedia pada pengambilan ini — matriks korelasi butuh deret harga per jam yang utuh.'
    };
  }

  // Samakan panjang deret; koin baru listing bisa punya deret lebih pendek.
  const panjang = Math.min(...kandidat.map(k => k.r.length));
  kandidat.forEach(k => { k.r = k.r.slice(-panjang); });

  const tickers = kandidat.map(k => k.ticker);
  const matrix = kandidat.map(a => kandidat.map(b =>
    a.ticker === b.ticker ? 1 : Number(pearsonCorrelation(a.r, b.r).toFixed(2))
  ));

  // Korelasi terhadap BTC — kolom yang paling sering dicari orang.
  const idxBtc = tickers.indexOf('BTC');
  const vsBtc = idxBtc >= 0
    ? tickers.map((t, i) => ({ ticker: t, r: matrix[i][idxBtc] })).filter(x => x.ticker !== 'BTC')
    : [];

  // Pasangan yang praktis merupakan satu posisi yang sama.
  const kembar = [];
  for (let i = 0; i < tickers.length; i++){
    for (let j = i + 1; j < tickers.length; j++){
      if (matrix[i][j] >= THRESHOLDS.correlationHigh){
        kembar.push({ a: tickers[i], b: tickers[j], r: matrix[i][j] });
      }
    }
  }
  kembar.sort((x, y) => y.r - x.r);

  // Rata-rata korelasi seluruh pasangan = ukuran "seberapa satu badan"
  // pasar sedang bergerak. Angka tinggi berarti tidak ada tempat sembunyi.
  const semuaPasangan = [];
  for (let i = 0; i < tickers.length; i++)
    for (let j = i + 1; j < tickers.length; j++) semuaPasangan.push(matrix[i][j]);
  const rataKorelasi = Number(mean(semuaPasangan).toFixed(2));

  const paling = vsBtc.length ? [...vsBtc].sort((a, b) => a.r - b.r)[0] : null;

  let tafsir;
  if (rataKorelasi >= 0.8){
    tafsir = `Rata-rata korelasi antar pasangan ${rataKorelasi} — sangat tinggi. Dalam kondisi seperti ini memegang banyak koin berbeda memberi diversifikasi yang sangat kecil: mereka bergerak nyaris sebagai satu posisi. Risiko portofolio praktis sama dengan risiko satu aset dikalikan jumlah posisi.`;
  } else if (rataKorelasi >= 0.55){
    tafsir = `Rata-rata korelasi antar pasangan ${rataKorelasi} — cukup tinggi, seperti lazimnya pasar kripto. Diversifikasi antar koin di sini mengurangi risiko jauh lebih sedikit daripada yang biasanya diperkirakan orang.`;
  } else {
    tafsir = `Rata-rata korelasi antar pasangan ${rataKorelasi} — relatif rendah untuk ukuran kripto. Pasar sedang memilah antar aset alih-alih bergerak serempak, jadi pemilihan koin lebih menentukan hasil daripada biasanya.`;
  }
  if (paling) tafsir += ` Yang paling lepas dari BTC pekan ini: ${paling.ticker} (${paling.r}).`;

  return {
    available: true,
    tickers, matrix, vsBtc, kembar, rataKorelasi, tafsir,
    jendela: `${Math.round(panjang / 24)} hari terakhir, data per jam`
  };
}
