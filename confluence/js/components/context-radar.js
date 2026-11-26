/**
 * components/context-radar.js — panel "RADAR KONTEKS" (Bab 11.6). Sengaja
 * TIDAK memengaruhi WCCS — murni overlay informasi tambahan.
 */
import { $ } from '../utils/dom.js';
import { formatCompact } from '../utils/formatters.js';

export function renderContextRadar(tvl, news){
  const tvlEl = $('tvlValue');
  if (tvl.available){
    tvlEl.textContent = formatCompact(tvl.current);
  } else {
    tvlEl.textContent = 'Tidak tersedia';
  }
  unSkelSafe(tvlEl);

  const newsEl = $('newsList');
  if (news.available && news.items.length){
    newsEl.innerHTML = news.items.map(n =>
      `<a class="news-item" href="${n.link}" target="_blank" rel="noopener">${n.title}</a>`
    ).join('');
  } else {
    newsEl.innerHTML = `<div class="news-empty">Feed berita tidak tersedia saat ini.</div>`;
  }
}

function unSkelSafe(el){ if (el) el.classList.remove('skel'); }

export function toggleContextRadar(){
  const panel = $('contextRadarPanel');
  const btn = $('contextRadarToggle');
  const isOpen = panel.classList.toggle('open');
  btn.textContent = isOpen ? 'Sembunyikan Radar Konteks ↑' : '🛰 Radar Konteks (TVL & Berita) →';
}
