/**
 * components/delta-banner.js — "Sejak terakhir dibuka" banner, dari
 * engine/delta.js. Muncul kalau ada snapshot sebelumnya yang cukup lama
 * (>1 menit) untuk dibandingkan.
 */
import { $ } from '../utils/dom.js';
import { formatPercent } from '../utils/formatters.js';

function formatMinutesAgo(m){
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h} jam ${rem} menit lalu` : `${h} jam lalu`;
}

export function renderDeltaBanner(delta){
  const el = $('deltaBanner');
  if (!delta){
    el.classList.remove('show');
    return;
  }

  const parts = [];
  if (delta.classificationChanged){
    parts.push(`status bergeser dari <b>${delta.previousClassification}</b>`);
  }
  if (Math.abs(delta.btcPctMove) >= 0.1){
    parts.push(`BTC ${formatPercent(delta.btcPctMove)}`);
  }
  if (Math.abs(delta.ethPctMove) >= 0.1){
    parts.push(`ETH ${formatPercent(delta.ethPctMove)}`);
  }
  if (Math.abs(delta.fgDelta) >= 1){
    parts.push(`Fear & Greed ${delta.fgDelta > 0 ? 'naik' : 'turun'} ${Math.abs(delta.fgDelta)} poin`);
  }

  if (parts.length === 0){
    el.classList.remove('show');
    return;
  }

  el.innerHTML = `<span class="delta-icon">↻</span> Sejak ${formatMinutesAgo(delta.minutesAgo)}: ${parts.join(' · ')}`;
  el.classList.add('show');
}
