/**
 * components/confluence.js — jantung UI: signal box WCCS + confluence
 * breakdown (Bab 11.2), confidence interval visual (Bab 11.4), crowding
 * warning badge (Bab 11.5).
 */
import { $, unSkel } from '../utils/dom.js';

const PILLAR_LABELS = {
  A: 'Price Action', B: 'Momentum Teknikal', C: 'Sentimen', D: 'On-Chain Flow', E: 'Derivatives'
};

export function renderSignalBox(narrative, classification){
  $('signalText').innerHTML = narrative.mainText;
  $('invalidationText').textContent = narrative.invalidation;
  unSkel($('signalText'));

  const disclaimerEl = $('estimateDisclaimer');
  if (narrative.estimateDisclaimer){
    disclaimerEl.textContent = 'ℹ️ ' + narrative.estimateDisclaimer;
    disclaimerEl.classList.add('show');
  } else {
    disclaimerEl.classList.remove('show');
  }

  const toneClass = classification.tone.startsWith('bullish') ? 'div-bullish'
    : classification.tone.startsWith('bearish') ? 'div-bearish' : '';
  $('signalBox').className = 'signal-box ' + toneClass;

  const icon = classification.tone.startsWith('bullish') ? '▲'
    : classification.tone.startsWith('bearish') ? '▼' : '✦';
  $('signalIcon').textContent = icon;
}

export function renderSignalTag(confidence, wccs){
  $('signalTag').textContent = `auto · WCCS ${wccs >= 0 ? '+' : ''}${wccs.toFixed(2)} · confidence ${confidence}%`;
}

/** Confidence interval visual (Bab 11.4): bar dengan "kerucut ketidakpastian". */
export function renderConfidenceInterval(wccs, confidence){
  const track = $('ciTrack');
  const clampedWccs = Math.max(-3, Math.min(3, wccs));
  const centerPct = ((clampedWccs + 3) / 6) * 100;
  const widthPct = (1 - confidence / 100) * 40; // makin rendah confidence, makin lebar kerucut
  const leftPct = Math.max(0, centerPct - widthPct);
  const rightPct = Math.min(100, centerPct + widthPct);

  track.innerHTML = `
    <div class="ci-zero-line"></div>
    <div class="ci-cone" style="left:${leftPct}%; width:${Math.max(0, rightPct - leftPct)}%;"></div>
    <div class="ci-point" style="left:${centerPct}%;"></div>
  `;
}

/** Confluence breakdown: bar horizontal per komponen, expandable (Bab 11.2). */
export function renderBreakdown(sortedComponents){
  const maxAbs = Math.max(...sortedComponents.map(c => Math.abs(c.contribution)), 0.01);
  const html = sortedComponents.map(c => {
    const pct = (Math.abs(c.contribution) / maxAbs) * 100;
    const isBullish = c.contribution >= 0;
    const side = isBullish ? 'right' : 'left';
    const color = c.isCrowded ? 'var(--violet)' : (isBullish ? 'var(--up)' : 'var(--down)');
    return `
      <div class="breakdown-row">
        <span class="breakdown-label">${c.key}${c.isCrowded ? ' ⚡' : ''}</span>
        <div class="breakdown-track">
          <div class="breakdown-bar breakdown-${side}" style="width:${pct}%; background:${color};"></div>
        </div>
        <span class="breakdown-val">${c.z >= 0 ? '+' : ''}${c.z.toFixed(2)}</span>
      </div>`;
  }).join('');
  $('breakdownRows').innerHTML = html;
}

/** Ringkasan per-pilar (5 pilar), untuk panel metodologi ringan di header breakdown. */
export function renderPillarSummary(pillars){
  const html = Object.entries(pillars).map(([key, val]) => {
    const cls = val > 0.1 ? 'up' : val < -0.1 ? 'down' : 'neutral';
    return `<div class="pillar-chip ${cls}">
      <span class="pillar-name">${key}</span>
      <span class="pillar-full">${PILLAR_LABELS[key]}</span>
      <span class="pillar-val">${val >= 0 ? '+' : ''}${val.toFixed(2)}</span>
    </div>`;
  }).join('');
  $('pillarSummary').innerHTML = html;
}

/** Crowding warning badge (Bab 11.5) — independen dari status WCCS utama. */
export function renderCrowdingBadge(crowdingFlag){
  const el = $('crowdingBadge');
  if (!crowdingFlag || !crowdingFlag.isCrowded){
    el.classList.remove('show');
    return;
  }
  el.classList.add('show');
  el.textContent = crowdingFlag.direction === 'long' ? '⚡ CROWDED LONG' : '⚡ CROWDED SHORT';
}

export function renderTldr(narrative, classification, confidence){
  $('tldrBadge').textContent = classification.label;
  $('tldrText').textContent = narrative.mainText.replace(/<[^>]+>/g, '');
}

export function toggleBreakdown(){
  const panel = $('breakdownPanel');
  const btn = $('breakdownToggle');
  const isOpen = panel.classList.toggle('open');
  btn.textContent = isOpen ? 'Sembunyikan Breakdown ↑' : 'Lihat Breakdown →';
}
