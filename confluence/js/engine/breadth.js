/**
 * engine/breadth.js — LEBAR PASAR (market breadth) & turunannya.
 *
 * Satu pertanyaan yang tidak bisa dijawab oleh harga BTC sendirian:
 * *kenaikan ini melibatkan berapa banyak orang?* Pasar yang naik karena
 * tiga koin besar berbeda secara fundamental dari pasar yang naik karena
 * delapan puluh koin ikut bergerak — yang pertama rapuh, yang kedua punya
 * dasar partisipasi.
 *
 * Seluruh modul ini berjalan dari data yang SUDAH ditarik untuk momentum
 * (endpoint /coins/markets), jadi nol panggilan API tambahan.
 *
 * Catatan kejujuran: universe-nya top-100 market cap. Breadth yang dihitung
 * di sini adalah breadth *dari koin besar*, bukan seluruh pasar kripto yang
 * berisi ribuan token. Itu pilihan disengaja — memasukkan micro-cap yang
 * bisa naik 400% karena satu pembelian justru merusak sinyalnya.
 */
import { mean, stdDev, zScore, winsorize } from './statistics.js';
import { THRESHOLDS } from '../config.js';

const STABLE = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'PYUSD', 'USDS', 'BUSD']);

/** Buang stablecoin — pergerakan 0% mereka akan menyesatkan semua statistik. */
export function tradableUniverse(markets){
  return (markets || []).filter(m => m && m.symbol && !STABLE.has(m.symbol.toUpperCase()));
}

const pc = (m, tf) => {
  const v = m[`price_change_percentage_${tf}_in_currency`];
  if (typeof v === 'number' && isFinite(v)) return v;
  if (tf === '24h' && typeof m.price_change_percentage_24h === 'number') return m.price_change_percentage_24h;
  return null;
};

/* ============================================================
   1. BREADTH — berapa persen pasar yang ikut bergerak
   ============================================================ */
export function computeBreadth(markets){
  const uni = tradableUniverse(markets);
  if (uni.length < 20) return { available: false };

  const build = (tf) => {
    const vals = uni.map(m => pc(m, tf)).filter(v => v != null);
    if (vals.length < 20) return null;
    const naik = vals.filter(v => v > 0).length;
    return {
      total: vals.length,
      naik,
      turun: vals.length - naik,
      pctNaik: Math.round((naik / vals.length) * 100),
      median: median(vals),
      rata: mean(vals)
    };
  };

  const b24 = build('24h');
  if (!b24) return { available: false };
  const b7 = build('7d');
  const b30 = build('30d');

  // Histogram distribusi return 24 jam. Bentuknya bercerita: terpusat rapat
  // = pasar bergerak serempak (biasanya digerakkan makro); menyebar lebar
  // = pasar memilah-milah antar aset (rezim rotasi).
  const vals24 = uni.map(m => pc(m, '24h')).filter(v => v != null);
  const batas = [-15, -8, -4, -2, 0, 2, 4, 8, 15];
  const bins = [];
  for (let i = 0; i <= batas.length; i++){
    const lo = i === 0 ? -Infinity : batas[i - 1];
    const hi = i === batas.length ? Infinity : batas[i];
    const count = vals24.filter(v => v >= lo && v < hi).length;
    const label = i === 0 ? `<${batas[0]}` : i === batas.length ? `>${batas[batas.length - 1]}` : `${lo}`;
    bins.push({ label, count, positive: hi <= 0 ? false : lo >= 0 ? true : null });
  }

  // Dispersi = simpangan baku return seluruh universe. Angka ini yang
  // membedakan "pasar bergerak bersama" dari "pasar memilah pemenang".
  const dispersi = stdDev(vals24);

  let tafsir;
  if (b24.pctNaik >= THRESHOLDS.breadthBroad){
    tafsir = 'Partisipasi luas — mayoritas koin besar ikut bergerak naik, bukan cuma beberapa nama.';
  } else if (b24.pctNaik <= THRESHOLDS.breadthNarrow){
    tafsir = 'Partisipasi sempit — sebagian besar koin justru melemah. Kalau indeks/BTC tetap hijau, kenaikannya bertumpu pada segelintir nama.';
  } else {
    tafsir = 'Partisipasi terbelah — pasar tidak bergerak serempak, lebih menyerupai kondisi memilah antar aset.';
  }

  return {
    available: true,
    d24: b24, d7: b7, d30: b30,
    bins, dispersi,
    advanceDecline: b24.turun > 0 ? b24.naik / b24.turun : b24.naik,
    tafsir
  };
}

function median(arr){
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* ============================================================
   2. BAROMETER ALTSEASON
   Definisi yang dipakai: berapa persen dari top-50 (di luar BTC dan
   stablecoin) yang mengungguli BTC dalam 30 hari. Ambang 60% dipilih
   mengikuti konvensi yang lazim dipakai indeks altseason publik —
   dicantumkan supaya angkanya bisa dibandingkan, bukan angka karangan.
   ============================================================ */
export function computeAltseason(markets, global){
  const uni = tradableUniverse(markets).slice(0, 50);
  const btc = (markets || []).find(m => (m.symbol || '').toUpperCase() === 'BTC');
  if (!btc || uni.length < 20) return { available: false };

  const btc30 = pc(btc, '30d');
  const btc7 = pc(btc, '7d');
  if (btc30 == null) return { available: false };

  const pesaing = uni.filter(m => (m.symbol || '').toUpperCase() !== 'BTC');
  const unggul30 = pesaing.filter(m => { const v = pc(m, '30d'); return v != null && v > btc30; });
  const unggul7 = pesaing.filter(m => { const v = pc(m, '7d'); return v != null && btc7 != null && v > btc7; });

  const indeks = Math.round((unggul30.length / pesaing.length) * 100);
  const indeks7 = btc7 != null ? Math.round((unggul7.length / pesaing.length) * 100) : null;

  let label, tafsir;
  if (indeks >= THRESHOLDS.altseasonThreshold){
    label = 'Condong Musim Alt';
    tafsir = `${indeks}% dari top-50 mengungguli BTC dalam 30 hari. Secara historis kondisi ini berbarengan dengan modal berputar keluar dari BTC — sekaligus periode ketika sebaran hasil antar koin melebar tajam, jadi risiko salah pilih ikut naik.`;
  } else if (indeks <= 100 - THRESHOLDS.altseasonThreshold){
    label = 'Condong Musim Bitcoin';
    tafsir = `Hanya ${indeks}% dari top-50 yang mengungguli BTC dalam 30 hari. Modal cenderung terkonsentrasi di aset paling likuid — pola yang biasa muncul saat pasar sedang menurunkan risiko.`;
  } else {
    label = 'Belum Terbentuk';
    tafsir = `${indeks}% dari top-50 mengungguli BTC — belum ada dominasi jelas ke salah satu sisi.`;
  }

  return {
    available: true,
    indeks, indeks7, label, tafsir,
    btc30, btcDominance: global?.btcDominance ?? null,
    ethDominance: global?.ethDominance ?? null,
    pemimpin: pesaing
      .map(m => ({ ticker: (m.symbol || '').toUpperCase(), lebih: (pc(m, '30d') ?? 0) - btc30, ret30: pc(m, '30d') }))
      .filter(x => x.ret30 != null)
      .sort((a, b) => b.lebih - a.lebih)
      .slice(0, 5)
  };
}

/* ============================================================
   3. PEMINDAI ANOMALI TURNOVER
   Turnover = volume 24 jam dibagi kapitalisasi pasar. Ia mengukur
   seberapa banyak sebuah koin berpindah tangan relatif terhadap
   ukurannya. Lonjakan turnover yang BELUM diikuti pergerakan harga
   adalah salah satu pola paling informatif yang bisa didapat gratis:
   ada yang ramai diperdagangkan tanpa harga bergerak.
   ============================================================ */
export function scanTurnoverAnomaly(markets){
  const uni = tradableUniverse(markets).filter(m => m.market_cap > 0 && m.total_volume > 0);
  if (uni.length < 20) return { available: false, items: [] };

  const turnovers = uni.map(m => (m.total_volume / m.market_cap) * 100);
  // Turnover berdistribusi sangat miring ke kanan; log-transform dulu supaya
  // z-score-nya bermakna, bukan didominasi satu-dua ekor ekstrem.
  const logs = turnovers.map(t => Math.log(Math.max(t, 0.0001)));
  const mu = mean(logs), sd = stdDev(logs) || 1;

  const items = uni.map((m, i) => {
    const z = winsorize(zScore(logs[i], mu, sd));
    const ret = pc(m, '24h') ?? 0;
    return {
      ticker: (m.symbol || '').toUpperCase(),
      name: m.name,
      turnover: turnovers[i],
      z,
      ret24h: ret,
      // "Sunyi tapi ramai": volume jauh di atas kebiasaan, harga hampir diam.
      sunyi: z >= THRESHOLDS.turnoverAnomalyZ && Math.abs(ret) < 2.5
    };
  }).filter(x => x.z >= THRESHOLDS.turnoverAnomalyZ)
    .sort((a, b) => b.z - a.z)
    .slice(0, 6);

  return { available: true, items, rataTurnover: Math.exp(mu) };
}

/* ============================================================
   4. GRID MULTI-TIMEFRAME
   Satu koin bisa hijau di 24 jam dan merah di 30 hari. Grid ini
   menampilkan keempat horizon berdampingan supaya "naik" tidak pernah
   terbaca tanpa konteks jangka waktunya.
   ============================================================ */
export function buildMtfGrid(markets, tickers){
  const uni = tradableUniverse(markets);
  const peta = new Map(uni.map(m => [(m.symbol || '').toUpperCase(), m]));
  const daftar = (tickers && tickers.length ? tickers : uni.slice(0, 10).map(m => (m.symbol || '').toUpperCase()));

  const rows = daftar.map(t => {
    const m = peta.get(t);
    if (!m) return null;
    const tf = {
      '1h': pc(m, '1h'), '24h': pc(m, '24h'),
      '7d': pc(m, '7d'), '30d': pc(m, '30d')
    };
    const nilai = Object.values(tf).filter(v => v != null);
    const semuaNaik = nilai.length === 4 && nilai.every(v => v > 0);
    const semuaTurun = nilai.length === 4 && nilai.every(v => v < 0);
    return {
      ticker: t, name: m.name, tf,
      alignment: semuaNaik ? 'up' : semuaTurun ? 'down' : 'mixed',
      athGap: typeof m.ath_change_percentage === 'number' ? m.ath_change_percentage : null
    };
  }).filter(Boolean);

  const selaras = rows.filter(r => r.alignment !== 'mixed');
  return {
    available: rows.length > 0,
    rows,
    jumlahSelaras: selaras.length,
    tafsir: selaras.length === 0
      ? 'Tidak ada koin yang keempat horizon waktunya searah — sinyal jangka pendek dan jangka menengah sedang bertentangan di seluruh papan.'
      : `${selaras.length} dari ${rows.length} koin punya arah yang sama di keempat horizon waktu. Keselarasan lintas timeframe adalah bentuk konfluensi juga — sama logikanya dengan lima pilar, tapi pada sumbu waktu, bukan sumbu jenis data.`
  };
}
