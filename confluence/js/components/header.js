/**
 * components/header.js — masthead meta, status badge, confidence bar, session strip.
 */
import { $ } from '../utils/dom.js';
import { formatDateID } from '../utils/formatters.js';
import { BRAND, VERSION, CONFIG } from '../config.js';
import { effectiveRefreshMs } from '../engine/settings.js';

export function renderHeaderMeta(){
  $('briefMeta').textContent = `Confluence Brief #${BRAND.briefNumber} · v${VERSION} · ${formatDateID(new Date())}`;
}

export function renderStatusBadge(classification, confidence){
  $('statusText').textContent = classification.label;
  const toneClass = classification.tone.startsWith('bullish') ? 'bullish'
    : classification.tone.startsWith('bearish') ? 'bearish' : '';
  $('statusBadge').className = 'status-badge ' + toneClass;
  $('confidenceFill').style.width = confidence + '%';
  $('confidenceLabel').textContent = 'CONFIDENCE ' + confidence + '%';
}

export function renderSessionStrip(){
  const now = new Date();
  const wibHour = parseInt(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).format(now),
    10
  );
  const sessions = [
    { name: 'Asia', range: [6, 15], icon: '🌅' },
    { name: 'Eropa', range: [14, 23], icon: '🌇' },
    { name: 'AS', range: [20, 29], icon: '🌃' }
  ];
  const el = $('sessionStrip');
  el.innerHTML = sessions.map(s => {
    let active = wibHour >= s.range[0] && wibHour < s.range[1];
    if (s.name === 'AS') active = wibHour >= 20 || wibHour < 5;
    return `<div class="session-chip ${active ? 'active' : ''}">
      <span class="sdot"></span>${s.icon} <b>${s.name}</b> ${active ? 'sesi aktif' : ''}
    </div>`;
  }).join('') + (() => {
    const ms = effectiveRefreshMs(CONFIG.refreshMs);
    if (!ms || ms <= 0) return `<div class="session-chip"><span class="sdot"></span>⏸ auto-refresh mati</div>`;
    const sec = Math.round(ms / 1000);
    const label = sec >= 60 ? `${Math.round(sec / 60)}m` : `${sec}d`;
    return `<div class="session-chip"><span class="sdot"></span>🔄 auto-refresh ${label}</div>`;
  })();
}

export function setLiveDot(color){
  $('liveDot').style.background = color;
}
