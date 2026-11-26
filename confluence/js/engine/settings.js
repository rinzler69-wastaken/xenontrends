/**
 * engine/settings.js — PENGATURAN YANG BERTAHAN ANTAR-SESI (v2.4).
 *
 * Sampai v2.3 semua penyesuaian (API key CoinGecko, interval refresh) harus
 * diedit langsung di config.js lalu halaman di-reload. Modul ini memindahkan
 * penyesuaian yang paling sering dipakai ke localStorage + panel Pengaturan,
 * supaya berlaku seketika tanpa menyentuh file.
 *
 * Batas yang disengaja (turunan langsung filosofi Bab 12 — changelog
 * metodologi): satu-satunya hal yang TIDAK bisa diubah dari sini adalah
 * bobot resmi lima pilar. Mode Eksperimen Bobot di Panel Pengaturan
 * menghitung ulang skor di SANDBOX terpisah untuk perbandingan sampingan —
 * skor resmi, ledger, dan rekam jejak tetap memakai bobot beku 25/20/15/20/20
 * supaya hit rate historis tetap sebanding. Mengubah bobot resmi tetap
 * harus lewat config.js + catatan changelog metodologi, seperti sejak v2.0.
 */

const SETTINGS_KEY = 'ic_settings_v1';

/** Nilai bawaan — mencerminkan perilaku v2.3 persis. */
const DEFAULTS = {
  // Demo API key CoinGecko (opsional). Kalau diisi, menimpa CONFIG.coingecko.apiKey
  // untuk SEMUA endpoint CoinGecko. Kosong = pakai rate-limit publik.
  coingeckoApiKey: '',

  // Interval auto-refresh: 30_000 | 60_000 | 120_000 | 0 (matikan)
  refreshMs: 60_000,

  // Menara Pengawas
  watchEnabled: true,      // evaluasi aturan & banner aktif
  watchNotify: false,      // notifikasi desktop (perlu izin browser)
  watchSound: false,       // bunyi beep saat alert (Web Audio, tanpa file)

  // Mode Eksperimen Bobot — SANDBOX, tidak pernah menyentuh skor resmi.
  // null = eksperimen mati. Bentuk: { A,B,C,D,E } dalam pecahan (dijumlah 1).
  experimentWeights: null
};

let cache = null;

function load(){
  if (cache) return cache;
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  }catch(e){
    cache = { ...DEFAULTS };
  }
  return cache;
}

function persist(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(cache)); }catch(e){ /* abaikan */ }
}

/** Ambil satu pengaturan. */
export function getSetting(key){
  return load()[key];
}

/** Ambil seluruh pengaturan (salinan). */
export function getAllSettings(){
  return { ...load() };
}

/** Set satu atau beberapa pengaturan, langsung dipersistenkan. */
export function setSettings(patch){
  cache = { ...load(), ...patch };
  persist();
  return { ...cache };
}

/** Reset SEMUA pengaturan ke bawaan. */
export function resetSettings(){
  cache = { ...DEFAULTS };
  persist();
  return { ...cache };
}

/**
 * API key efektif untuk CoinGecko: pengaturan pengguna menimpa config.js.
 * Dipakai oleh withApiKey() di api/coingecko.js — satu titik kebenaran.
 */
export function effectiveCoinGeckoKey(configKey){
  const fromSettings = String(getSetting('coingeckoApiKey') || '').trim();
  if (fromSettings) return fromSettings;
  return configKey || null;
}

/** Interval refresh efektif (0 = auto-refresh dimatikan). */
export function effectiveRefreshMs(defaultMs){
  const v = Number(getSetting('refreshMs'));
  if (!isFinite(v)) return defaultMs;
  return v; // termasuk 0 = mati
}

/**
 * Validasi & normalisasi bobot eksperimen: jumlah harus 1 (±0,001),
 * tiap bobot 0..1. Mengembalikan null kalau tidak valid.
 */
export function normalizeWeights(w){
  if (!w) return null;
  const keys = ['A', 'B', 'C', 'D', 'E'];
  const out = {};
  let sum = 0;
  for (const k of keys){
    const v = Number(w[k]);
    if (!isFinite(v) || v < 0 || v > 1) return null;
    out[k] = v;
    sum += v;
  }
  if (Math.abs(sum - 1) > 0.001) return null;
  return out;
}
