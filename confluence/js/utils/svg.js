/**
 * utils/svg.js — pabrik grafik SVG murni, tanpa library chart apa pun.
 *
 * Alasan tidak memakai Chart.js atau sejenisnya: seluruh aplikasi ini
 * dibangun dengan prinsip nol-dependensi-eksternal supaya bisa jalan dari
 * `python -m http.server` di jaringan tanpa internet keluar. Menambahkan
 * 200KB library chart hanya untuk menggambar garis 60 titik adalah harga
 * yang tidak sebanding — apalagi semua bentuk yang dibutuhkan dashboard ini
 * (sparkline, histogram, gauge, heatmap, kurva underwater) bisa ditulis
 * dalam beberapa puluh baris path SVG.
 *
 * Semua fungsi di sini MURNI: angka masuk, string markup keluar. Tidak
 * menyentuh DOM, tidak menyimpan state, gampang diuji.
 */

/** Skala linear dari domain ke range. */
function scale(v, dMin, dMax, rMin, rMax){
  if (dMax === dMin) return (rMin + rMax) / 2;
  return rMin + ((v - dMin) / (dMax - dMin)) * (rMax - rMin);
}

function esc(s){
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   SPARKLINE — garis tren ringkas
   ============================================================ */
/**
 * @param {number[]} values
 * @param {object} [opt] {w,h,stroke,fill,showLast,pad}
 * @returns {string} markup <svg>
 */
export function sparkline(values, opt){
  const o = Object.assign({ w: 120, h: 32, stroke: 'var(--up)', fill: null, showLast: true, pad: 2, strokeWidth: 1.6 }, opt || {});
  const v = (values || []).filter(x => typeof x === 'number' && isFinite(x));
  if (v.length < 2) return `<svg viewBox="0 0 ${o.w} ${o.h}" class="ic-spark"></svg>`;

  const min = Math.min(...v), max = Math.max(...v);
  const pts = v.map((y, i) => [
    scale(i, 0, v.length - 1, o.pad, o.w - o.pad),
    scale(y, min, max, o.h - o.pad, o.pad)
  ]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');

  let area = '';
  if (o.fill){
    area = `<path d="${d} L${(o.w - o.pad).toFixed(2)} ${o.h} L${o.pad} ${o.h} Z" fill="${o.fill}" stroke="none"/>`;
  }
  const last = pts[pts.length - 1];
  const dot = o.showLast
    ? `<circle cx="${last[0].toFixed(2)}" cy="${last[1].toFixed(2)}" r="2.2" fill="${o.stroke}"/>`
    : '';

  return `<svg viewBox="0 0 ${o.w} ${o.h}" preserveAspectRatio="none" class="ic-spark">
    ${area}<path d="${d}" fill="none" stroke="${o.stroke}" stroke-width="${o.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>${dot}
  </svg>`;
}

/* ============================================================
   KURVA UNDERWATER — jarak dari puncak tertinggi sepanjang waktu
   Selalu ≤ 0. Bentuk visual yang langsung terbaca sebagai "seberapa
   dalam kita sedang terbenam dari puncak".
   ============================================================ */
export function underwaterCurve(drawdowns, opt){
  const o = Object.assign({ w: 240, h: 48, pad: 2 }, opt || {});
  const v = (drawdowns || []).filter(x => typeof x === 'number' && isFinite(x));
  if (v.length < 2) return '';
  const min = Math.min(...v, -0.5);
  const pts = v.map((y, i) => [
    scale(i, 0, v.length - 1, o.pad, o.w - o.pad),
    scale(y, min, 0, o.h - o.pad, o.pad)
  ]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  return `<svg viewBox="0 0 ${o.w} ${o.h}" preserveAspectRatio="none" class="ic-spark">
    <path d="${d} L${(o.w - o.pad).toFixed(2)} ${o.pad} L${o.pad} ${o.pad} Z" fill="rgba(255,84,112,0.14)" stroke="none"/>
    <path d="${d}" fill="none" stroke="var(--down)" stroke-width="1.4"/>
  </svg>`;
}

/* ============================================================
   HISTOGRAM — distribusi return, untuk membaca bentuk pasar
   ============================================================ */
/**
 * @param {Array<{label:string, count:number, positive:boolean}>} bins
 */
export function histogram(bins, opt){
  const o = Object.assign({ w: 280, h: 62, gap: 2 }, opt || {});
  if (!bins || !bins.length) return '';
  const max = Math.max(...bins.map(b => b.count), 1);
  const bw = (o.w - o.gap * (bins.length - 1)) / bins.length;

  const bars = bins.map((b, i) => {
    const h = Math.max(1, (b.count / max) * (o.h - 14));
    const x = i * (bw + o.gap);
    const y = (o.h - 12) - h;
    const color = b.positive == null ? 'var(--text-3)' : b.positive ? 'var(--up)' : 'var(--down)';
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${color}" opacity="0.8"><title>${esc(b.label)}: ${b.count} koin</title></rect>`;
  }).join('');

  const labels = bins.map((b, i) => {
    if (i % 2 !== 0 && bins.length > 6) return '';
    const x = i * (bw + o.gap) + bw / 2;
    return `<text x="${x.toFixed(1)}" y="${o.h - 1}" font-size="6.5" fill="var(--text-3)" text-anchor="middle">${esc(b.label)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${o.w} ${o.h}" class="ic-histogram">${bars}${labels}</svg>`;
}

/* ============================================================
   GAUGE SETENGAH LINGKARAN — untuk barometer 0-100
   ============================================================ */
export function gauge(value, opt){
  const o = Object.assign({ w: 132, h: 76, min: 0, max: 100, color: 'var(--violet)', label: '' }, opt || {});
  const pct = Math.max(0, Math.min(1, (value - o.min) / (o.max - o.min)));
  const cx = o.w / 2, cy = o.h - 10, r = Math.min(o.w / 2 - 8, cy - 8);

  const arc = (from, to, color, width) => {
    const a0 = Math.PI * (1 + from), a1 = Math.PI * (1 + to);
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = (to - from) > 0.5 ? 1 : 0;
    return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
  };

  const needleAngle = Math.PI * (1 + pct);
  const nx = cx + (r - 4) * Math.cos(needleAngle);
  const ny = cy + (r - 4) * Math.sin(needleAngle);

  return `<svg viewBox="0 0 ${o.w} ${o.h}" class="ic-gauge">
    ${arc(0, 1, 'rgba(255,255,255,0.07)', 7)}
    ${pct > 0.01 ? arc(0, pct, o.color, 7) : ''}
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(2)}" y2="${ny.toFixed(2)}" stroke="var(--text-1)" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="3" fill="var(--text-1)"/>
    ${o.label ? `<text x="${cx}" y="${cy - r - 1}" font-size="7" fill="var(--text-3)" text-anchor="middle">${esc(o.label)}</text>` : ''}
  </svg>`;
}

/* ============================================================
   WARNA HEATMAP — dipakai matriks korelasi & grid multi-timeframe
   ============================================================ */
/**
 * Petakan nilai ke warna merah-netral-hijau. Intensitas warna mengikuti
 * |value| relatif terhadap skala, jadi angka kecil tetap terbaca netral
 * alih-alih dipaksa berwarna.
 */
export function heatColor(value, scaleMax, opts){
  const o = Object.assign({ neutral: 'rgba(255,255,255,0.045)' }, opts || {});
  if (value == null || isNaN(value)) return o.neutral;
  const t = Math.max(0, Math.min(1, Math.abs(value) / (scaleMax || 1)));
  if (t < 0.06) return o.neutral;
  const alpha = (0.10 + t * 0.42).toFixed(3);
  return value >= 0 ? `rgba(33,209,159,${alpha})` : `rgba(255,84,112,${alpha})`;
}

/** Warna teks yang tetap terbaca di atas heatColor. */
export function heatText(value, scaleMax){
  if (value == null || isNaN(value)) return 'var(--text-3)';
  const t = Math.abs(value) / (scaleMax || 1);
  if (t < 0.06) return 'var(--text-3)';
  return value >= 0 ? 'var(--up)' : 'var(--down)';
}

/* ============================================================
   BAR PERSENTIL — penggaris posisi relatif terhadap sejarah sendiri
   ============================================================ */
export function percentileRuler(pct, opt){
  const o = Object.assign({ w: 240, h: 26, marks: [25, 50, 75] }, opt || {});
  const p = Math.max(0, Math.min(100, pct));
  const x = (p / 100) * (o.w - 4) + 2;
  const marks = o.marks.map(m => {
    const mx = (m / 100) * (o.w - 4) + 2;
    return `<line x1="${mx.toFixed(1)}" y1="6" x2="${mx.toFixed(1)}" y2="14" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>`;
  }).join('');
  const color = p >= 75 ? 'var(--down)' : p <= 25 ? 'var(--cyan)' : 'var(--gold)';
  return `<svg viewBox="0 0 ${o.w} ${o.h}" class="ic-ruler">
    <rect x="2" y="7" width="${o.w - 4}" height="6" rx="3" fill="rgba(255,255,255,0.06)"/>
    ${marks}
    <circle cx="${x.toFixed(1)}" cy="10" r="4.5" fill="${color}"/>
    <text x="2" y="24" font-size="6.5" fill="var(--text-3)">tenang</text>
    <text x="${o.w - 2}" y="24" font-size="6.5" fill="var(--text-3)" text-anchor="end">bergejolak</text>
  </svg>`;
}

/* ============================================================
   BAR HORIZONTAL BERPASANGAN — long vs short, naik vs turun
   ============================================================ */
export function splitBar(leftPct, opt){
  const o = Object.assign({ w: 240, h: 10, leftColor: 'var(--up)', rightColor: 'var(--down)' }, opt || {});
  const l = Math.max(0, Math.min(100, leftPct));
  const lw = (l / 100) * o.w;
  return `<svg viewBox="0 0 ${o.w} ${o.h}" class="ic-splitbar" preserveAspectRatio="none">
    <rect x="0" y="0" width="${o.w}" height="${o.h}" rx="${o.h / 2}" fill="${o.rightColor}" opacity="0.55"/>
    <rect x="0" y="0" width="${lw.toFixed(1)}" height="${o.h}" rx="${o.h / 2}" fill="${o.leftColor}" opacity="0.9"/>
  </svg>`;
}

/** Bar vertikal sederhana untuk heatmap sesi perdagangan. */
export function verticalBars(items, opt){
  const o = Object.assign({ w: 240, h: 68 }, opt || {});
  if (!items || !items.length) return '';
  const maxAbs = Math.max(...items.map(i => Math.abs(i.value)), 0.01);
  const bw = o.w / items.length;
  const mid = (o.h - 12) / 2 + 2;

  const bars = items.map((it, i) => {
    const h = (Math.abs(it.value) / maxAbs) * ((o.h - 14) / 2);
    const x = i * bw + bw * 0.22;
    const w = bw * 0.56;
    const y = it.value >= 0 ? mid - h : mid;
    const color = it.value >= 0 ? 'var(--up)' : 'var(--down)';
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="1.5" fill="${color}" opacity="0.85"><title>${esc(it.label)}: ${it.value >= 0 ? '+' : ''}${it.value.toFixed(2)}%</title></rect>`;
  }).join('');

  const labels = items.map((it, i) => {
    const x = i * bw + bw / 2;
    return `<text x="${x.toFixed(1)}" y="${o.h - 1}" font-size="6.5" fill="var(--text-3)" text-anchor="middle">${esc(it.label)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${o.w} ${o.h}" class="ic-vbars">
    <line x1="0" y1="${mid}" x2="${o.w}" y2="${mid}" stroke="rgba(255,255,255,0.10)" stroke-width="0.7"/>
    ${bars}${labels}
  </svg>`;
}

/* ============================================================
   v2.4 — GRAFIK HARGA 30 HARI + garis level S/R + titik harga kini
   Satu grafik yang menjawab tiga pertanyaan sekaligus: ke mana harga
   bergerak sebulan, di mana level yang pernah teruji, dan di mana kita
   sekarang. Murni SVG tanpa library — konsisten dengan prinsip utils ini.
   ============================================================ */
export function priceChart(prices, opt){
  const o = Object.assign({
    w: 640, h: 200, pad: 4,
    levels: [],          // [{harga, sentuhan, tipe:'sup'|'res'}]
    current: null,
    fmt: (n) => '$' + Math.round(n).toLocaleString('en-US')
  }, opt || {});
  const v = (prices || []).filter(x => typeof x === 'number' && isFinite(x));
  if (v.length < 10) return '';

  // Sumbu Y mencakup harga + level yang mau digambar, biar garisnya tidak
  // terpotong keluar bidang.
  const levelHarga = (o.levels || []).map(l => l.harga).filter(x => typeof x === 'number' && Number.isFinite(x));
  let min = Math.min(...v, ...levelHarga), max = Math.max(...v, ...levelHarga);
  const span = (max - min) || 1;
  min -= span * 0.04; max += span * 0.04;

  const X = (i) => scale(i, 0, v.length - 1, o.pad, o.w - o.pad);
  const Y = (y) => scale(y, min, max, o.h - o.pad, o.pad);
  const d = v.map((y, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(y).toFixed(1)}`).join(' ');

  const labelGaris = (harga, color, teks) => {
    const y = Y(harga);
    if (y < 8 || y > o.h - 2) return '';
    return `<line x1="${o.pad}" y1="${y.toFixed(1)}" x2="${o.w - o.pad}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="0.9" stroke-dasharray="4 3" opacity="0.75"/>
      <text x="${o.w - o.pad - 2}" y="${(y - 2.5).toFixed(1)}" font-size="8" fill="${color}" text-anchor="end">${esc(teks)}</text>`;
  };

  const garisLevel = (o.levels || []).slice(0, 6).map(l =>
    labelGaris(l.harga, l.tipe === 'sup' ? 'var(--up)' : 'var(--down)', `${l.tipe === 'sup' ? 'S' : 'R'} ${o.fmt(l.harga)} · ${l.sentuhan}×`)
  ).join('');

  let titikKini = '';
  if (typeof o.current === 'number' && Number.isFinite(o.current)){
    const cx = X(v.length - 1), cy = Y(o.current);
    titikKini = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="var(--gold)" stroke="#0a0c12" stroke-width="1"/>
      <text x="${(cx - 4).toFixed(1)}" y="${(cy - 6).toFixed(1)}" font-size="8.5" fill="var(--gold)" text-anchor="end" font-weight="600">${esc(o.fmt(o.current))}</text>`;
  }

  // Grid horizontal samar supaya mata punya jangkar.
  const grid = [0.25, 0.5, 0.75].map(f => {
    const y = o.pad + f * (o.h - 2 * o.pad);
    return `<line x1="${o.pad}" y1="${y.toFixed(1)}" x2="${o.w - o.pad}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.05)" stroke-width="0.6"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${o.w} ${o.h}" class="ic-pricechart" preserveAspectRatio="none">
    ${grid}
    <path d="${d} L${X(v.length - 1).toFixed(1)} ${o.h - o.pad} L${X(0).toFixed(1)} ${o.h - o.pad} Z" fill="rgba(139,124,246,0.10)" stroke="none"/>
    <path d="${d}" fill="none" stroke="var(--violet)" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>
    ${garisLevel}${titikKini}
  </svg>`;
}

/* ============================================================
   v2.4 — SEL TREEMAP SATU KOIN (untuk Heatmap Pasar 100 koin)
   Layout treemap penuh (squarified) sengaja TIDAK dipakai: tujuan panel
   ini bukan menggantikan tabel momentum, tapi memberi PETA PERASAAN pasar
   sekilas. Grid seliperbaris dengan ukuran mengikuti kapitalisasi relatif
   (di-cap biar koin kecil tetap terbaca) memberi efek yang sama dengan
   biaya kompleksitas yang jauh lebih rendah — dan tetap jujur: bukan
   klaim representasi spasial pasar yang presisi.
   ============================================================ */
export function treemapTile(t, opt){
  const o = Object.assign({ w: 72, h: 44, change: 0 }, opt || {});
  const tipe = t.change > 0.05 ? 'up' : t.change < -0.05 ? 'down' : 'flat';
  return `<div class="tm-tile tm-${tipe}" style="flex-grow:${Math.max(1, Math.round(t.weight))}" title="${esc(t.name || t.ticker)} · ${t.change >= 0 ? '+' : ''}${t.change.toFixed(2)}% · ${esc(t.mcapLabel || '')}">
    <div class="tm-ticker">${esc(t.ticker)}</div>
    <div class="tm-chg">${t.change >= 0 ? '+' : ''}${t.change.toFixed(1)}%</div>
  </div>`;
}
