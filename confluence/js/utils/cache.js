/**
 * cache.js — localStorage wrapper untuk fallback last-known-good data
 * saat sumber eksternal gagal semua (rate-limit/network drop).
 */

export function saveCache(key, data){
  try{
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  }catch(e){ /* private mode / storage penuh — abaikan, ini opsional */ }
}

export function loadCache(key){
  try{
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch(e){
    return null;
  }
}
