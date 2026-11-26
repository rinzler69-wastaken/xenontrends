/**
 * divergence.js — Bab 6 dokumen konsep: Divergence Detection sebagai
 * overlay TERPISAH di atas WCCS, bukan menggantikan komponen lain (beda
 * dari v1 yang memakai priority-ladder).
 *
 * Divergence = sign(z_PriceAction) ≠ sign(z_OnChainFlow)
 *              AND |z_PriceAction| > threshold AND |z_OnChainFlow| > threshold
 */
import { THRESHOLDS } from '../config.js';

/**
 * @param {number} zPrice z-score komponen price action (mis. A1 BTC return)
 * @param {number} zFlow z-score komponen on-chain flow (mis. D1 BTC netflow, sudah beorientasi)
 * @param {string} assetLabel 'BTC' | 'ETH'
 */
export function detectDivergence(zPrice, zFlow, assetLabel){
  const thr = THRESHOLDS.divergenceZ;
  const sig = Math.abs(zPrice) > thr && Math.abs(zFlow) > thr;
  const opposite = Math.sign(zPrice) !== Math.sign(zFlow) && Math.sign(zPrice) !== 0 && Math.sign(zFlow) !== 0;

  if (!sig || !opposite){
    return { detected: false, asset: assetLabel };
  }

  const type = zPrice > 0 ? 'bearish-div' : 'bullish-div'; // harga naik tapi flow bearish = hidden bearish; sebaliknya = hidden bullish
  return { detected: true, asset: assetLabel, type, zPrice, zFlow };
}

/**
 * Matriks divergensi BTC & ETH + deteksi Rotational Divergence (Bab 6.2):
 * BTC dan ETH menunjukkan arah divergensi berlawanan → rotasi antar-aset,
 * bukan sinyal market-wide.
 * @param {{btcPrice:number, btcFlow:number, ethPrice:number, ethFlow:number}} z
 */
export function buildDivergenceMatrix(z){
  const btc = detectDivergence(z.btcPrice, z.btcFlow, 'BTC');
  const eth = detectDivergence(z.ethPrice, z.ethFlow, 'ETH');

  let rotational = false;
  if (btc.detected && eth.detected && btc.type !== eth.type){
    rotational = true;
  }

  return { btc, eth, rotational };
}
