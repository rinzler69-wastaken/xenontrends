/**
 * api/derivatives.js — Pilar E (Derivatives & Leverage Positioning).
 *
 * Implementasi tangga fallback 5-tingkat dari Bab 9.7 dokumen konsep:
 *   Tingkat 1: Binance fapi        → validity 1.0
 *   Tingkat 2: Bybit                → validity 1.0
 *   Tingkat 3: OKX                  → validity 1.0
 *   Tingkat 4: (reverse-proxy sendiri, TIDAK diimplementasi di v2.0 —
 *               roadmap v2.1, lihat README) → validity 0.9
 *   Tingkat 5: CORS proxy publik (LAST RESORT, dengan disclosure eksplisit
 *               ke UI) → validity 0.6
 *
 * PENTING: berbeda dari kompetitor yang memakai proxy publik SECARA DIAM-DIAM
 * (tanpa indikasi ke pengguna), setiap kali Tingkat 5 terpakai di sini,
 * `usedPublicProxy: true` dikembalikan agar UI WAJIB menampilkan badge
 * peringatan (Bab 9.7, Bab 11.5) dan validity otomatis didiskon.
 */
import { CONFIG } from '../config.js';

// Tingkat 5 — HANYA dipakai kalau Tingkat 1-3 semuanya gagal. Didaftarkan
// eksplisit di sini (bukan disembunyikan) supaya mudah diaudit/diganti.
const PUBLIC_CORS_PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

async function tryFetch(url, timeoutMs){
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs ?? 6000);
  try{
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }catch(e){
    clearTimeout(t);
    throw e;
  }
}

async function tryViaPublicProxy(url){
  for (const buildProxyUrl of PUBLIC_CORS_PROXIES){
    try{
      const data = await tryFetch(buildProxyUrl(url), 8000);
      return data;
    }catch(e){ /* coba proxy berikutnya */ }
  }
  throw new Error('Semua CORS proxy publik gagal juga.');
}

/**
 * Ambil funding rate + OI dari satu exchange, dengan fallback proxy publik
 * kalau direct fetch gagal (biasanya karena CORS/blocking geografis).
 * @param {string} fundingUrl
 * @param {string} oiUrl
 * @param {(f:any, o:any) => {rate:number, oi:number}} parseFn
 */
function validateParsed(parsed){
  if (!parsed || typeof parsed.rate !== 'number' || !Number.isFinite(parsed.rate)){
    throw new Error('Payload exchange tidak berisi funding rate valid (kemungkinan geo-block).');
  }
  return parsed;
}

async function fetchExchangeData(fundingUrl, oiUrl, parseFn){
  try{
    const [funding, oi] = await Promise.all([tryFetch(fundingUrl), tryFetch(oiUrl)]);
    return { ...validateParsed(parseFn(funding, oi)), usedPublicProxy: false, validity: 1.0 };
  }catch(directErr){
    try{
      const [funding, oi] = await Promise.all([
        tryViaPublicProxy(fundingUrl),
        tryViaPublicProxy(oiUrl)
      ]);
      return { ...validateParsed(parseFn(funding, oi)), usedPublicProxy: true, validity: 0.6 };
    }catch(proxyErr){
      throw new Error('Direct dan proxy publik sama-sama gagal: ' + directErr.message);
    }
  }
}

function parseBinance(funding, oi){
  const rate = funding && funding[0] ? parseFloat(funding[0].fundingRate) : null;
  const oiVal = oi ? parseFloat(oi.openInterest) : null;
  return { rate, oi: oiVal };
}
function parseBybit(funding, oi){
  const rate = funding?.result?.list?.[0] ? parseFloat(funding.result.list[0].fundingRate) : null;
  const oiList = oi?.result?.list;
  const oiVal = oiList && oiList.length ? parseFloat(oiList[0].openInterest) : null;
  return { rate, oi: oiVal };
}
function parseOkx(funding, oi){
  const rate = funding?.data?.[0] ? parseFloat(funding.data[0].fundingRate) : null;
  const oiVal = oi?.data?.[0] ? parseFloat(oi.data[0].oi) : null;
  return { rate, oi: oiVal };
}

/**
 * Coba Binance → Bybit → OKX berurutan. Mengembalikan hasil exchange
 * pertama yang berhasil, plus metadata jalur mana yang dipakai (Bab 9.7).
 * @returns {Promise<{rate:number, oi:number, exchange:string, usedPublicProxy:boolean, validity:number}>}
 */
export async function fetchFundingAndOI(){
  const attempts = [
    { name: 'binance', urls: CONFIG.derivatives.binance, parse: parseBinance },
    { name: 'bybit', urls: CONFIG.derivatives.bybit, parse: parseBybit },
    { name: 'okx', urls: CONFIG.derivatives.okx, parse: parseOkx }
  ];

  const errors = [];
  for (const attempt of attempts){
    try{
      const result = await fetchExchangeData(attempt.urls.funding, attempt.urls.openInterest, attempt.parse);
      return { ...result, exchange: attempt.name };
    }catch(e){
      errors.push(`${attempt.name}: ${e.message}`);
    }
  }

  throw new Error('Semua exchange (Binance/Bybit/OKX) gagal, termasuk fallback proxy publik. ' + errors.join(' | '));
}

/**
 * OI historis (2 titik) untuk menghitung % perubahan 24h — dipakai komponen E2.
 * Best-effort: kalau gagal, kembalikan null (E2 akan divalidity-0 di caller).
 */
export async function fetchOIChange(){
  const parseBinanceHist = (hist) => {
    if (!Array.isArray(hist) || hist.length < 2) throw new Error('Data OI Binance kurang');
    const oldest = parseFloat(hist[0].sumOpenInterest);
    const newest = parseFloat(hist[hist.length - 1].sumOpenInterest);
    if (!oldest || !Number.isFinite(oldest) || !Number.isFinite(newest)) throw new Error('Nilai OI tidak valid');
    return ((newest - oldest) / oldest) * 100;
  };
  const parseBybitHist = (d) => {
    const list = d?.result?.list;
    if (!Array.isArray(list) || list.length < 2) throw new Error('Data OI Bybit kurang');
    const newest = parseFloat(list[0].openInterest);
    const oldest = parseFloat(list[list.length - 1].openInterest);
    if (!oldest || !Number.isFinite(oldest) || !Number.isFinite(newest)) throw new Error('Nilai OI Bybit tidak valid');
    return ((newest - oldest) / oldest) * 100;
  };

  try{ return parseBybitHist(await tryFetch(CONFIG.derivatives.bybit.openInterest)); }catch(e){}
  try{ return parseBinanceHist(await tryFetch(CONFIG.derivatives.binance.openInterestHist)); }catch(e){}
  try{ return parseBybitHist(await tryViaPublicProxy(CONFIG.derivatives.bybit.openInterest)); }catch(e){}
  try{ return parseBinanceHist(await tryViaPublicProxy(CONFIG.derivatives.binance.openInterestHist)); }catch(e){}
  return null;
}
