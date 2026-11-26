/**
 * components/v24-panels.js — panel-panel baru v2.4 yang ringkas:
 *
 *   Heatmap Pasar — peta 100 koin top, 4 horizon, toggle interaktif
 *
 * Dipisah dari market-lab/risk-lab (milik v2.3) supaya riwayat fitur per
 * versi tetap terbaca dari struktur filenya.
 */
import { $ } from '../utils/dom.js';

let horizonAktif = '24h';

/* ============================================================
   HEATMAP PASAR — 100 koin, ukuran sel mengikuti kapitalisasi
   ============================================================ */
function selHorizon(m, horizon){
  switch (horizon){
    case '1h':  return m.price_change_percentage_1h_in_currency ?? null;
    case '7h':  return m.price_change_percentage_7d_in_currency ?? null;
    case '30h': return m.price_change_percentage_30d_in_currency ?? null;
    default:    return m.price_change_percentage_24h ?? null;
  }
}

export function renderHeatmap(markets){
  const el = $('heatmapContent');
  if (!el) return;
  if (!markets || markets.length < 10){
    el.innerHTML = '<div class="lab-empty">Heatmap butuh data top-100 CoinGecko — belum tersedia pada pengambilan ini.</div>';
    return;
  }

  const mcapMax = Math.max(...markets.map(m => m.market_cap || 0), 1);
  const sel = markets.slice(0, 100).map(m => ({
    ticker: (m.symbol || '').toUpperCase(),
    name: m.name,
    change: selHorizon(m, horizonAktif) ?? 0,
    weight: Math.max(1, Math.min(26, Math.round(Math.sqrt((m.market_cap || 0) / mcapMax) * 26)))
  }));

  const warna = (c) => {
    if (c == null || Math.abs(c) < 0.05) return 'rgba(255,255,255,0.08)';
    const t = Math.min(1, Math.abs(c) / 8);
    return c >= 0 ? `rgba(33,209,159,${(0.12 + t * 0.5).toFixed(2)})` : `rgba(255,84,112,${(0.12 + t * 0.5).toFixed(2)})`;
  };

  el.innerHTML = `
    <div class="hm-toolbar">
      <div class="hm-legend"><span class="hm-chip" style="background:rgba(255,84,112,.6)"></span> melemah
        <span class="hm-chip" style="background:rgba(255,255,255,.08);margin-left:10px"></span> diam
        <span class="hm-chip" style="background:rgba(33,209,159,.6);margin-left:10px"></span> menguat</div>
      <div class="hm-switch">
        ${['1h', '24h', '7h', '30h'].map(h =>
          `<button class="hm-btn ${h === horizonAktif ? 'active' : ''}" data-h="${h}">${h === '24h' ? '24 jam' : h === '7h' ? '7 hari' : h === '30h' ? '30 hari' : '1 jam'}</button>`).join('')}
      </div>
    </div>
    <div class="tm-grid">${sel.map(t =>
      `<div class="tm-tile" style="flex-grow:${t.weight};background:${warna(t.change)}" title="${t.name} · ${t.change >= 0 ? '+' : ''}${t.change.toFixed(2)}%">
        <div class="tm-ticker">${t.ticker}</div>
        <div class="tm-chg">${t.change >= 0 ? '+' : ''}${t.change.toFixed(1)}%</div>
      </div>`).join('')}
    </div>
    <div class="lab-caveat">Ukuran sel mengikuti kapitalisasi pasar (diperskala akar agar koin kecil tetap terbaca). Intensitas warna mengikuti besarnya perubahan. Ini peta untuk melihat sekilas, bukan alat analisis presisi — untuk itu ada grid MTF dan tabel momentum.</div>`;

  el.querySelectorAll('.hm-btn').forEach(b => {
    b.addEventListener('click', () => { horizonAktif = b.dataset.h; renderHeatmap(markets); });
  });
}
