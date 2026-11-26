/**
 * confidence.js — Bab 10 dokumen konsep: confidence sebagai fungsi terukur,
 * bukan angka ad-hoc.
 *
 * Confidence = 0.5×Agreement + 0.3×DataQuality + 0.2×SampleAdequacy
 */

/**
 * @param {object[]} scoredComponents keluaran computeWCCS().components
 * @param {number} wccs skor total
 */
export function computeAgreement(scoredComponents, wccs){
  if (!scoredComponents.length) return 0;
  const wccsSign = Math.sign(wccs) || 0;
  const agreeing = scoredComponents.filter(c => Math.sign(c.z) === wccsSign || wccsSign === 0).length;
  return agreeing / scoredComponents.length;
}

/**
 * @param {object[]} scoredComponents
 */
export function computeDataQuality(scoredComponents){
  if (!scoredComponents.length) return 0;
  const total = scoredComponents.reduce((sum, c) => sum + c.validity, 0);
  return total / scoredComponents.length;
}

/**
 * Sample adequacy khusus komponen on-chain/derivatif — apakah jumlah
 * transaksi/observasi yang mendasari cukup besar untuk dipercaya.
 * @param {{onchainTxCount?: number, derivativesSampleOk?: boolean}} meta
 */
export function computeSampleAdequacy(meta){
  let score = 1;
  if (meta.onchainTxCount != null){
    score = Math.min(1, meta.onchainTxCount / 5); // <5 transaksi whale 24h = kurang meyakinkan
  }
  if (meta.derivativesSampleOk === false){
    score = Math.min(score, 0.6);
  }
  return score;
}

/**
 * @param {object[]} scoredComponents
 * @param {number} wccs
 * @param {object} meta
 * @returns {{confidence:number, agreement:number, dataQuality:number, sampleAdequacy:number}}
 */
export function computeConfidence(scoredComponents, wccs, meta){
  const agreement = computeAgreement(scoredComponents, wccs);
  const dataQuality = computeDataQuality(scoredComponents);
  const sampleAdequacy = computeSampleAdequacy(meta || {});

  const confidence = Math.round(
    (0.5 * agreement + 0.3 * dataQuality + 0.2 * sampleAdequacy) * 100
  );

  return { confidence: Math.max(5, Math.min(95, confidence)), agreement, dataQuality, sampleAdequacy };
}
