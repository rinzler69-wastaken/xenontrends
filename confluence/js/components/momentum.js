/**
 * components/momentum.js — tabel "MOMENTUM" 10 koin dengan skor riil
 * (Bab 9.4), bukan lagi random seperti v1, dan bukan lagi 3 kartu kecil
 * — sekarang tabel penuh sesuai permintaan revisi.
 */
import { $ } from '../utils/dom.js';
import { formatPercent } from '../utils/formatters.js';

const ARROW = { up: '▲', down: '▼', flat: '➖' };

export function renderMomentum(list){
  if (!list || list.length === 0){
    $('momRows').innerHTML = `<tr><td colspan="5" class="mom-empty">Data momentum belum tersedia.</td></tr>`;
    return;
  }
  const html = list.map((m, i) => `
    <tr class="mom-tr">
      <td class="mom-rank">${i + 1}</td>
      <td class="mom-ticker-cell">
        <span class="mom-ticker">${m.ticker}</span>
        <span class="mom-name">${m.name || ''}</span>
      </td>
      <td class="mom-score-cell">
        <span class="mom-score">${m.score}</span>
        <div class="mom-bar-track"><div class="mom-bar-fill" style="width:${m.score}%;"></div></div>
      </td>
      <td class="mom-return-cell ${m.return24h >= 0 ? 'up' : 'down'}">${formatPercent(m.return24h)}</td>
      <td class="mom-trend ${m.trend}">${ARROW[m.trend]}</td>
    </tr>
  `).join('');
  $('momRows').innerHTML = html;
}
