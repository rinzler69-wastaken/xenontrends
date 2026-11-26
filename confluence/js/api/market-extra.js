/**
 * api/market-extra.js — sumber data tambahan v2.3. Semuanya GRATIS dan
 * tanpa API key.
 *
 * Catatan biaya rate-limit (penting, karena CoinGecko free tier tipis):
 *   - `fetchGlobal()`      → +1 panggilan CoinGecko per siklus
 *   - `fetchBtcChart30d()` → +1 panggilan, TAPI di-cache 10 menit karena
 *                            data 30 hari praktis tidak berubah dalam
 *                            hitungan menit. Efektifnya ~0.1 panggilan/menit.
 *   - breadth, korelasi, multi-timeframe, turnover, altseason: NOL panggilan
 *     tambahan — semuanya diperas dari endpoint /coins/markets yang memang
 *     sudah dipanggil, hanya parameternya diperluas.
 *   - long/short ratio: Binance, kuota terpisah dari CoinGecko.
 *   - stablecoin supply: DefiLlama, kuota terpisah, di-cache 30 menit.
 *
 * Jadi delapan belas fitur analitik baru hanya menambah dua panggilan
 * CoinGecko per siklus, salah satunya ter-cache berat.
 */
import { CONFIG } from '../config.js';
import { fetchWithRetry } from './coingecko.js';

/* ------------------------------------------------------------------
   Cache ringan per-endpoint. Berbeda dari utils/cache.js yang menyimpan
   satu snapshot besar; ini per-URL dengan TTL sendiri-sendiri, supaya
   data yang lambat berubah tidak ikut ditarik ulang tiap 60 detik.

   PERBAIKAN (lihat CHANGELOG-FIX-429.md): fetchGlobal() dan
   fetchBtcChart30d() memanggil domain api.coingecko.com, domain yang
   sama dengan fetchPrices/fetchMarkets/dst di coingecko.js. Kalau semua
   endpoint itu ditembak bersamaan, CoinGecko membalas 429. Parameter
   `isCoinGecko` di bawah memilih antara fetchWithRetry() (yang menangani
   429 dengan backoff, dipakai untuk endpoint CoinGecko) atau fetch()
   polos dengan timeout (untuk Binance/DefiLlama, domain lain, rate-limit
   independen, tidak butuh penanganan 429 CoinGecko).
   ------------------------------------------------------------------ */
const memCache = new Map();

async function cachedJson(key, url, ttlMs, timeoutMs, isCoinGecko){
  const now = Date.now();
  const hit = memCache.get(key);
  if (hit && (now - hit.t) < ttlMs) return hit.v;

  try{
    let json;
    if (isCoinGecko){
      // fetchWithRetry menangani 429 sendiri (backoff internal), jadi
      // tidak perlu AbortController tambahan di sini.
      json = await fetchWithRetry(url);
    } else {
      const fetchDirectOrProxy = async (targetUrl, ms) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        try{
          const res = await fetch(targetUrl, { signal: controller.signal });
          clearTimeout(timer);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return await res.json();
        }catch(err){
          clearTimeout(timer);
          throw err;
        }
      };
      try{
        json = await fetchDirectOrProxy(url, timeoutMs ?? 8000);
      }catch(directErr){
        const proxies = [
          `https://corsproxy.io/?${encodeURIComponent(url)}`,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
        ];
        let proxyOk = false;
        for (const pUrl of proxies){
          try{
            const candidate = await fetchDirectOrProxy(pUrl, 8000);
            if (Array.isArray(candidate) || (candidate && typeof candidate === 'object' && !candidate.code)){
              json = candidate;
              proxyOk = true;
              break;
            }
          }catch(e){}
        }
        if (!proxyOk) throw directErr;
      }
    }
    memCache.set(key, { t: now, v: json });
    return json;
  }catch(e){
    // Kalau ada versi lama di cache, lebih baik data basi yang ditandai
    // daripada panel kosong — selama UI tahu itu basi.
    if (hit) return hit.v;
    throw e;
  }
}

/** Umur data cache dalam detik, untuk panel Kesehatan Data. */
export function cacheAgeSec(key){
  const hit = memCache.get(key);
  return hit ? Math.round((Date.now() - hit.t) / 1000) : null;
}

/* ============================================================
   GLOBAL — kapitalisasi total, dominansi BTC/ETH
   ============================================================ */
export async function fetchGlobal(){
  try{
    const d = await cachedJson('global', CONFIG.coingecko.global, 120_000, undefined, true);
    const g = d.data || {};
    return {
      available: true,
      totalMcap: g.total_market_cap?.usd ?? null,
      totalVolume: g.total_volume?.usd ?? null,
      mcapChange24h: g.market_cap_change_percentage_24h_usd ?? null,
      btcDominance: g.market_cap_percentage?.btc ?? null,
      ethDominance: g.market_cap_percentage?.eth ?? null,
      activeCoins: g.active_cryptocurrencies ?? null
    };
  }catch(e){
    return { available: false, totalMcap: null, totalVolume: null, mcapChange24h: null, btcDominance: null, ethDominance: null, activeCoins: null };
  }
}

/* ============================================================
   CHART 30 HARI — dasar volatilitas, drawdown, level, dan sesi
   ============================================================ */
export async function fetchBtcChart30d(){
  try{
    const d = await cachedJson('btc30d', CONFIG.coingecko.btcChart30d, 600_000, undefined, true);
    return {
      available: true,
      prices: d.prices || [],          // [[ts, price], ...] granularitas per jam
      volumes: d.total_volumes || []
    };
  }catch(e){
    return { available: false, prices: [], volumes: [] };
  }
}

/* ============================================================
   LONG/SHORT RATIO — posisi ritel vs top trader (Binance, publik)
   Ini informasi yang jarang ada di dashboard gratis, padahal justru
   yang paling menjelaskan "siapa yang sedang salah posisi".
   ============================================================ */
function ratioToLongPct(ratio){
  const r = parseFloat(ratio);
  if (!isFinite(r) || r <= 0) return null;
  return (r / (1 + r)) * 100;
}

export async function fetchLongShortRatio(){
  const out = {
    available: false,
    retailLongPct: null, retailSeries: [],
    topLongPct: null, topSeries: [],
    divergence: null
  };
  try{
    const [gl, top] = await Promise.allSettled([
      cachedJson('gls', CONFIG.derivatives.binance.globalLongShort, 300_000, 6000),
      cachedJson('tls', CONFIG.derivatives.binance.topLongShort, 300_000, 6000)
    ]);

    if (gl.status === 'fulfilled' && Array.isArray(gl.value) && gl.value.length){
      out.retailSeries = gl.value.map(x => ratioToLongPct(x.longShortRatio)).filter(v => v != null);
      out.retailLongPct = out.retailSeries[out.retailSeries.length - 1] ?? null;
    }
    if (top.status === 'fulfilled' && Array.isArray(top.value) && top.value.length){
      out.topSeries = top.value.map(x => ratioToLongPct(x.longShortRatio)).filter(v => v != null);
      out.topLongPct = out.topSeries[out.topSeries.length - 1] ?? null;
    }
    out.available = out.retailLongPct != null || out.topLongPct != null;

    // Selisih posisi ritel vs trader besar. Ini angka yang paling menarik
    // dari keseluruhan endpoint ini: ketika keduanya berbeda tajam, salah
    // satu kelompok sedang berada di sisi yang salah.
    if (out.retailLongPct != null && out.topLongPct != null){
      out.divergence = out.retailLongPct - out.topLongPct;
    }
    return out;
  }catch(e){
    return out;
  }
}

/* ============================================================
   PASOKAN STABLECOIN — proksi "dry powder" (amunisi yang siap masuk)
   ============================================================ */
export async function fetchStablecoinSupply(){
  try{
    const d = await cachedJson('stables', CONFIG.context.stablecoinChart, 1_800_000, 9000);
    if (!Array.isArray(d) || d.length < 8) throw new Error('bentuk data tidak sesuai');

    const val = (row) => {
      const t = row.totalCirculatingUSD;
      if (t == null) return null;
      if (typeof t === 'number') return t;
      return Object.values(t).reduce((a, b) => a + (Number(b) || 0), 0);
    };

    const series = d.slice(-90).map(val).filter(v => v != null && v > 0);
    if (series.length < 8) throw new Error('deret terlalu pendek');

    const now = series[series.length - 1];
    const d7 = series[series.length - 8];
    const d30 = series.length >= 31 ? series[series.length - 31] : series[0];

    return {
      available: true,
      total: now,
      change7d: d7 ? ((now - d7) / d7) * 100 : null,
      change30d: d30 ? ((now - d30) / d30) * 100 : null,
      series: series.slice(-30)
    };
  }catch(e){
    return { available: false, total: null, change7d: null, change30d: null, series: [] };
  }
}
