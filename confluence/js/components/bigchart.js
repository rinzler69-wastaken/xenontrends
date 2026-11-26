/**
 * components/bigchart.js — GRAFIK BTC 30 HARI + overlay level S/R (v2.4).
 *
 * Selama ini data chart 30 hari sudah diambil untuk volatilitas/drawdown/level,
 * tapi bentuknya hanya angka — belum pernah dilihat sebagai kurva. Panel ini
 * menggambarnya (murni SVG, utils/priceChart), dengan garis putus-putus level
 * support/resistance yang benar-benar teruji harga dari engine/volatility.js.
 * Grafik dan panel Level Otomatis membaca sumber yang sama — angkanya tidak
 * mungkin berbeda.
 */
import { $ } from '../utils/dom.js';
import { formatCurrency } from '../utils/formatters.js';
import { priceChart } from '../utils/svg.js';

export function renderBigChart(chart30d, levels, hargaSekarang){
  const el = $('bigChartContent');
  if (!el) return;
  if (!chart30d || !chart30d.available || chart30d.prices.length < 100){
    el.innerHTML = '<div class="lab-empty">Grafik 30 hari butuh data market_chart CoinGecko — belum tersedia (cek tab 🩺 Kesehatan untuk statusnya).</div>';
    return;
  }

  const harga = chart30d.prices.map(p => p[1]);
  const levelGabungan = [
    ...(levels?.support || []).slice(0, 3).map(s => ({ harga: s.harga, sentuhan: s.sentuhan, tipe: 'sup' })),
    ...(levels?.resistance || []).slice(0, 3).map(r => ({ harga: r.harga, sentuhan: r.sentuhan, tipe: 'res' }))
  ];

  el.innerHTML = `
    <div class="bc-toolbar">
      <span class="bc-title">BTC · USD · 30 hari</span>
      <span class="bc-now">${formatCurrency(hargaSekarang)}</span>
    </div>
    <div class="lab-chart bc-chart">${priceChart(harga, { w: 640, h: 210, levels: levelGabungan, current: hargaSekarang })}</div>
    <div class="lab-caveat">Garis putus-putus adalah level dari panel "Level Otomatis" (pivot teruji ≥${'2'}×), digambar dari data yang sama persis. Grafik ini konteks, bukan sinyal — harga naik-turun di garis bukan berarti garisnya sihir.</div>`;
}
