/**
 * wccs.js — Weighted Composite Confluence Score, jantung mesin sinyal
 * (Bab 2, 5.3 dokumen konsep).
 *
 * Formula:
 *   WCCS = Σ_p [ weight_pillar_p × ( Σ_c (weight_c × z_c × validity_c) / Σ weight_c ) ]
 *
 * Untuk E1/E2, z_c digantikan CrowdingIntensity(z_c) (Bab 4.5) — satu-satunya
 * pilar yang transformasinya non-linear, karena karakter statistiknya
 * kontrarian/mean-reverting, bukan trend-following seperti pilar lain.
 */
import { WEIGHTS, THRESHOLDS } from '../config.js';
import { zScore, winsorize, crowdingIntensity } from './statistics.js';
import { resolveBaseline } from './baselines.js';
import { getOrientation } from './sign-validation.js';

/**
 * @typedef {Object} RawComponent
 * @property {string} key      kunci baseline, misal 'A1_btc_24h_return'
 * @property {number} value    nilai mentah komponen (sudah dalam satuan baseline)
 * @property {number} validity 0..1, dari staleness/CORS-fallback/dsb
 * @property {number[]} [liveSeries] histori opsional untuk baseline live
 */

/**
 * Hitung z-score + orientasi + (kalau perlu) crowding intensity untuk 1 komponen.
 * @param {RawComponent} comp
 * @param {boolean} [isPillarE=false]
 */
export function scoreComponent(comp, isPillarE){
  const baseline = resolveBaseline(comp.key, comp.liveSeries || null);
  const rawZ = winsorize(zScore(comp.value, baseline.mu, baseline.sigma));
  const { orientation } = getOrientation(comp.key);

  let orientedZ = rawZ * (orientation === 0 ? 1 : orientation); // Pilar E tetap dilewatkan mentah, orientation-nya ditangani via crowding
  let isCrowded = false;

  if (isPillarE){
    const ci = crowdingIntensity(rawZ, THRESHOLDS.crowdingZ, THRESHOLDS.crowdingPenaltyRate);
    orientedZ = ci.value;
    isCrowded = ci.isCrowded;
  }

  return {
    key: comp.key,
    rawValue: comp.value,
    z: orientedZ,
    rawZ,
    validity: comp.validity ?? 1,
    baseline,
    isCrowded,
    contribution: 0 // diisi belakangan setelah tahu bobot komponen
  };
}

/**
 * @param {{A: RawComponent[], B: RawComponent[], C: RawComponent[], D: RawComponent[], E: RawComponent[]}} pillarInputs
 * @param {object} [weightsOverride] — v2.4, HANYA untuk Mode Eksperimen Bobot
 *   (sandbox Panel Pengaturan). Bentuk { pillars: {A..E} }. Jalur resmi
 *   TIDAK PERNAH mengirim parameter ini — bobot resmi tetap beku di config.js,
 *   ledger dan rekam jejak hanya pernah mencatat hasil jalur resmi.
 * @returns {{wccs:number, pillars:object, components:object[], stabilityFlag:boolean}}
 */
export function computeWCCS(pillarInputs, weightsOverride){
  const pillarWeights = (weightsOverride && weightsOverride.pillars) || WEIGHTS.pillars;
  const pillarScores = {};
  const allComponents = [];

  for (const pillar of ['A', 'B', 'C', 'D', 'E']){
    const comps = pillarInputs[pillar] || [];
    const isPillarE = pillar === 'E';
    let weightedSum = 0;
    let weightTotal = 0;

    comps.forEach(comp => {
      const scored = scoreComponent(comp, isPillarE);
      // fallback: kalau key tidak match pola X1/X2, bagi rata
      const effectiveWeight = WEIGHTS.components[comp.key.match(/^[A-E]\d/)?.[0]] ?? (1 / comps.length);

      const intraContribution = effectiveWeight * scored.z * scored.validity;
      scored.contribution = pillarWeights[pillar] * intraContribution;
      scored.componentWeight = effectiveWeight;
      scored.pillar = pillar;

      weightedSum += intraContribution;
      weightTotal += effectiveWeight;
      allComponents.push(scored);
    });

    pillarScores[pillar] = weightTotal > 0 ? (weightedSum / weightTotal) : 0;
  }

  let wccs = 0;
  for (const pillar of ['A', 'B', 'C', 'D', 'E']){
    wccs += pillarWeights[pillar] * pillarScores[pillar];
  }

  return {
    wccs,
    pillars: pillarScores,
    components: allComponents.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  };
}

/**
 * Peta WCCS numerik ke label kategori — Bab 5.3.
 * @param {number} wccs
 */
export function classifyWCCS(wccs){
  if (wccs >= 1.2) return { label: 'STRONG BULLISH CONFLUENCE', tone: 'bullish' };
  if (wccs >= 0.4) return { label: 'LEANING BULLISH', tone: 'bullish-soft' };
  if (wccs > -0.4) return { label: 'NEUTRAL / MIXED', tone: 'neutral' };
  if (wccs > -1.2) return { label: 'LEANING BEARISH', tone: 'bearish-soft' };
  return { label: 'STRONG BEARISH CONFLUENCE', tone: 'bearish' };
}
