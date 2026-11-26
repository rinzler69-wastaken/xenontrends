/**
 * api/onchain.js — Pilar D (On-Chain Flow). Bab 9.2 dokumen konsep.
 *
 * Mock aktif secara default (CONFIG.onChain.provider === 'mock'). Untuk
 * data real: daftar Whale Alert (https://docs.whale-alert.io), isi
 * CONFIG.onChain.whaleAlertApiKey, ubah provider ke 'whalealert', lalu
 * lengkapi fetchWhaleAlert() di bawah dengan logic agregasi sesuai kontrak
 * OnChainFlowResult yang didokumentasikan di sini.
 *
 * KONTRAK DATA (wajib dipenuhi provider apa pun):
 *   { btc: {amount:number, txCount:number}, eth: {amount:number, txCount:number} }
 *   amount dalam USD, + = inflow ke exchange (bearish), − = outflow (bullish)
 *   — perhatikan orientasi ini SUDAH sesuai sign-validation.js (D1/D2 = -1)
 */
import { CONFIG } from '../config.js';

function seedRandom(seed){
  let s = seed;
  return function(){
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateMockOnChain(){
  const rnd = seedRandom(Date.now() % 10000);
  const btcFlow = (rnd() - 0.45) * 8;
  const ethFlow = (rnd() - 0.5) * 90;
  return {
    btc: { amount: btcFlow, txCount: Math.round(4 + rnd() * 10) },
    eth: { amount: ethFlow, txCount: Math.round(3 + rnd() * 8) }
  };
}

/**
 * STUB — isi ketika sudah punya Whale Alert API key.
 * Docs: https://docs.whale-alert.io/#transactions
 * @param {string} apiKey
 */
async function fetchWhaleAlert(apiKey){
  throw new Error('fetchWhaleAlert() belum diimplementasi — isi API key + parsing logic sesuai kontrak OnChainFlowResult.');
}

export async function fetchOnChainFlow(){
  if (CONFIG.onChain.provider === 'whalealert' && CONFIG.onChain.whaleAlertApiKey){
    try{
      return await fetchWhaleAlert(CONFIG.onChain.whaleAlertApiKey);
    }catch(e){
      console.warn('Whale Alert gagal, fallback ke mock:', e.message);
    }
  }
  return generateMockOnChain();
}
