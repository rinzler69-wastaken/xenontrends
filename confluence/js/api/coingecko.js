/**
 * api/coingecko.js — Pilar A (Price Action) & Pilar B (RSI) & momentum universe.
 * Gratis, tanpa key, CORS-open. Sumber tunggal paling reliable di seluruh
 * sistem (Bab 9.1).
 *
 * PERBAIKAN (lihat CHANGELOG-FIX-429.md): CoinGecko public API punya burst
 * limit per-IP yang ketat — menembak beberapa endpoint CoinGecko secara
 * bersamaan memicu HTTP 429 "Too Many Requests", yang bikin fetchMarkets()
 * gagal dan tabel momentum kosong/menampilkan cache lama. Di v2.3, jumlah
 * endpoint CoinGecko yang dipanggil tiap siklus bertambah jadi 7 (termasuk
 * fetchGlobal() dan fetchBtcChart30d() di api/market-extra.js), sehingga
 * risiko 429 makin tinggi kalau semuanya ditembak bersamaan.
 *
 * Perbaikan:
 *   1. fetchWithRetry() — diekspor supaya api/market-extra.js juga bisa
 *      memakainya, bukan menulis fetch() polos sendiri lagi. Deteksi 429,
 *      retry dengan exponential backoff (1s, 2s, 4s), menghormati header
 *      Retry-After kalau CoinGecko mengirimkannya.
 *   2. Dukungan Demo API Key opsional (CONFIG.coingecko.apiKey) — kalau
 *      diisi, otomatis disisipkan ke semua endpoint sebagai
 *      x_cg_demo_api_key, menaikkan kuota dari rate-limit publik yang
 *      sangat ketat ke 10.000 calls/bulan (lihat README bagian
 *      "Mengatasi error 429").
 *   3. SEMUA 7 panggilan CoinGecko (termasuk yang di market-extra.js)
 *      dijalankan sequential-throttled dari main.js, bukan paralel.
 */
import { CONFIG } from '../config.js';
import { effectiveCoinGeckoKey } from '../engine/settings.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * Sisipkan API key demo ke URL sebagai query param. v2.4: key bisa datang
 * dari dua tempat — config.js (cara lama) atau Panel Pengaturan di UI
 * (tersimpan di localStorage). Pengaturan UI menimpa config.js.
 */
function withApiKey(url){
  const key = effectiveCoinGeckoKey(CONFIG.coingecko.apiKey);
  if (!key) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}x_cg_demo_api_key=${encodeURIComponent(key)}`;
}

/**
 * fetch() dengan retry otomatis khusus untuk HTTP 429 (rate limit), DIEKSPOR
 * supaya dipakai seragam oleh semua modul yang memanggil CoinGecko
 * (termasuk api/market-extra.js), bukan ditulis ulang per-file.
 * @param {string} url
 * @param {number} [attempt=0]
 * @returns {Promise<any>} JSON hasil parse
 */
export async function fetchWithRetry(url, attempt){
  attempt = attempt || 0;
  const finalUrl = withApiKey(url);
  const res = await fetch(finalUrl);

  if (res.status === 429){
    if (attempt >= MAX_RETRIES){
      throw new Error('CoinGecko rate limit (429) — sudah dicoba ulang ' + MAX_RETRIES + 'x, tetap gagal.');
    }
    const retryAfterHeader = res.headers.get('Retry-After');
    const waitMs = retryAfterHeader
      ? Number(retryAfterHeader) * 1000
      : BASE_DELAY_MS * Math.pow(2, attempt);
    console.warn(`CoinGecko 429, menunggu ${waitMs}ms sebelum retry ke-${attempt + 1}...`);
    await sleep(waitMs);
    return fetchWithRetry(url, attempt + 1);
  }

  if (!res.ok){
    throw new Error('CoinGecko fetch gagal: HTTP ' + res.status + ' — ' + url.split('?')[0]);
  }
  return res.json();
}

export async function fetchPrices(){
  const d = await fetchWithRetry(CONFIG.coingecko.price);
  return {
    btc: { usd: d.bitcoin.usd, change: d.bitcoin.usd_24h_change },
    eth: { usd: d.ethereum.usd, change: d.ethereum.usd_24h_change },
    usdt: { usd: d.tether.usd, change: d.tether.usd_24h_change }
  };
}

export async function fetchChart(url){
  const d = await fetchWithRetry(url);
  return d.prices; // [[ts, price], ...]
}

export const fetchBtcChart1h = () => fetchChart(CONFIG.coingecko.btcChart1h);
export const fetchBtcChart4h = () => fetchChart(CONFIG.coingecko.btcChart4h);
export const fetchEthChart1h = () => fetchChart(CONFIG.coingecko.ethChart1h);

/** Top-100 market cap, untuk momentum composite score riil (Bab 9.4). */
export async function fetchMarkets(){
  return fetchWithRetry(CONFIG.coingecko.markets);
}
