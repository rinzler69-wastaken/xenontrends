/**
 * components/metrics.js — 4 kartu utama yang tetap dipertahankan dari v1
 * (Bab 11.1 — "evolusi, bukan revolusi"): BTC, ETH, Fear & Greed, RSI.
 */
import { $, unSkel } from '../utils/dom.js';
import { formatCurrency, formatPercent, fgClassify } from '../utils/formatters.js';

function renderSpark(svgEl, prices, isUp){
  if (!prices || prices.length < 2) return;
  const vals = prices.map(p => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const w = 100, h = 28;
  const step = w / (vals.length - 1);

  let d = '';
  vals.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
  });

  const color = isUp ? 'var(--up)' : 'var(--down)';
  const areaD = d + `L${w},${h} L0,${h} Z`;
  svgEl.innerHTML = `
    <defs>
      <linearGradient id="grad-${svgEl.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaD}" fill="url(#grad-${svgEl.id})" stroke="none"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  `;
}

function renderFgRing(svgEl, value){
  const r = 16, cx = 20, cy = 20;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const offset = circumference * (1 - pct);
  let color = 'var(--down)';
  if (value >= 75) color = '#3ddc97';
  else if (value >= 50) color = 'var(--up)';
  else if (value >= 25) color = 'var(--gold)';
  svgEl.innerHTML = `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="4"
      stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
      stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
      style="transition: stroke-dashoffset 1s cubic-bezier(.16,.84,.44,1)"/>
  `;
}

export function renderMetrics(state){
  const { btc, eth, fg, rsi1h, btcChart1h, ethChart1h } = state;

  // Reveal live data containers & hide empty/throbber states
  ['Btc', 'Eth', 'Fg', 'Rsi'].forEach(key => {
    const emptyEl = $(`metricEmpty${key}`);
    const throbEl = $(`metricThrobber${key}`);
    const dataEl = $(`metricData${key}`);
    if (emptyEl) emptyEl.style.display = 'none';
    if (throbEl) throbEl.style.display = 'none';
    if (dataEl) dataEl.style.display = 'flex';
  });

  $('btcPrice').innerHTML = formatCurrency(btc.usd);
  $('btcChange').textContent = formatPercent(btc.change);
  $('btcChange').className = 'metric-sub ' + (btc.change >= 0 ? 'up' : 'down');
  unSkel($('btcPrice')); unSkel($('btcChange'));
  renderSpark($('btcSpark'), btcChart1h, btc.change >= 0);

  $('ethPrice').innerHTML = formatCurrency(eth.usd);
  $('ethChange').textContent = formatPercent(eth.change);
  $('ethChange').className = 'metric-sub ' + (eth.change >= 0 ? 'up' : 'down');
  unSkel($('ethPrice')); unSkel($('ethChange'));
  renderSpark($('ethSpark'), ethChart1h, eth.change >= 0);

  $('fgValue').textContent = fg.value;
  const fgLabelText = fg.trendDelta != null
    ? `${fgClassify(fg.value)} ${fg.trendDelta > 0 ? '▲' : fg.trendDelta < 0 ? '▼' : '—'}${fg.trendDelta !== 0 ? Math.abs(fg.trendDelta) : ''}`
    : fgClassify(fg.value);
  $('fgLabel').textContent = fgLabelText;
  $('fgLabel').className = 'metric-sub ' + (fg.value >= 55 ? 'up' : fg.value <= 45 ? 'down' : 'neutral');
  unSkel($('fgValue')); unSkel($('fgLabel'));
  renderFgRing($('fgRing'), fg.value);

  if (rsi1h != null){
    $('rsiValue').textContent = rsi1h;
    const rsiLabel = rsi1h >= 70 ? 'Overbought' : rsi1h <= 30 ? 'Oversold' : rsi1h < 50 ? 'Weak' : 'Strong';
    $('rsiLabel').textContent = rsiLabel;
    $('rsiLabel').className = 'metric-sub ' + (rsi1h >= 70 ? 'down' : rsi1h <= 30 ? 'up' : rsi1h < 50 ? 'neutral' : 'up');
    $('rsiBarFill').style.width = rsi1h + '%';
    $('rsiBarFill').style.background = rsi1h >= 70 ? 'var(--down)' : rsi1h <= 30 ? 'var(--up)' : 'var(--gold)';
  } else {
    $('rsiValue').textContent = 'N/A';
    $('rsiLabel').textContent = 'data kurang';
  }
  unSkel($('rsiValue')); unSkel($('rsiLabel'));
}
