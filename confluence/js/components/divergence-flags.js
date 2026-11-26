/**
 * components/divergence-flags.js — render hasil engine/divergence-scanner.js
 * sebagai daftar peringatan ringan di bawah tabel momentum.
 */
import { $ } from '../utils/dom.js';

export function renderDivergenceFlags(flags){
  const el = $('divergenceFlagsContent');
  const wrap = $('divergenceFlagsWrap');

  if (!flags || flags.length === 0){
    wrap.classList.remove('show');
    return;
  }

  wrap.classList.add('show');
  el.innerHTML = flags.map(f => `
    <div class="dflag-row">
      <span class="dflag-ticker">${f.ticker}</span>
      <span class="dflag-label">${f.label}</span>
    </div>
  `).join('');
}
