/**
 * components/market-lab.js — panel struktur pasar (v2.3).
 *
 * Enam panel yang menjawab pertanyaan yang tidak bisa dijawab harga:
 *   Rezim       — kita sedang di jenis pasar seperti apa
 *   Breadth     — berapa banyak yang ikut bergerak
 *   Altseason   — ke mana modal berputar
 *   Grid MTF    — apakah arahnya konsisten lintas horizon waktu
 *   Korelasi    — apakah diversifikasi yang dirasakan itu nyata
 *   Anomali     — apa yang ramai diperdagangkan tapi harganya belum bergerak
 */
import { $ } from '../utils/dom.js';
import { formatCompact, formatPercent } from '../utils/formatters.js';
import { histogram, gauge, heatColor, heatText, sparkline } from '../utils/svg.js';

const TONE_CLASS = {
  bullish: 'up', 'bullish-soft': 'up', neutral: 'gold',
  'bearish-soft': 'down', bearish: 'down'
};

function kosong(pesan){
  return `<div class="lab-empty">${pesan}</div>`;
}

/* ============================================================
   REZIM PASAR
   ============================================================ */
export function renderRegime(regime){
  const el = $('regimeContent');
  if (!el) return;
  if (!regime || !regime.available){
    el.innerHTML = kosong(regime?.ringkas || 'Data rezim belum tersedia.');
    return;
  }

  const warna = TONE_CLASS[regime.tone] || 'gold';
  const faktor = regime.faktor.map(f => `
    <div class="regime-factor">
      <div class="regime-factor-head">
        <span class="regime-factor-name">${f.nama}</span>
        <span class="regime-factor-val">${f.nilai}</span>
      </div>
      <div class="regime-factor-note"><b>${f.arah}</b> — ${f.catatan}</div>
    </div>`).join('');

  el.innerHTML = `
    <div class="regime-hero regime-${warna}">
      <div class="regime-label">${regime.label}</div>
      <div class="regime-ringkas">${regime.ringkas}</div>
    </div>
    <div class="regime-factors">${faktor}</div>
    <div class="lab-note"><b>Implikasi membaca:</b> ${regime.implikasi}</div>
    <div class="lab-caveat">Rezim tidak masuk ke dalam perhitungan WCCS. Bobot lima pilar tetap 25/20/15/20/20 seperti v2.0 — rezim adalah lensa untuk membaca skor, bukan bahan skor. Mengubah formula berarti membuat seluruh rekam jejak lama tidak lagi sebanding.</div>`;
}

/* ============================================================
   BREADTH
   ============================================================ */
export function renderBreadth(br){
  const el = $('breadthContent');
  if (!el) return;
  if (!br || !br.available){
    el.innerHTML = kosong('Data breadth butuh minimal 20 koin dari universe top-100 — belum terpenuhi pada pengambilan ini.');
    return;
  }

  const baris = (label, d) => d ? `
    <div class="breadth-row">
      <span class="breadth-row-label">${label}</span>
      <span class="breadth-bar">
        <span class="breadth-bar-fill" style="width:${d.pctNaik}%"></span>
      </span>
      <span class="breadth-row-val ${d.pctNaik >= 50 ? 'pos' : 'neg'}">${d.pctNaik}% naik</span>
      <span class="breadth-row-sub">${d.naik}↑ / ${d.turun}↓ · median ${d.median >= 0 ? '+' : ''}${d.median.toFixed(2)}%</span>
    </div>` : '';

  el.innerHTML = `
    <div class="breadth-rows">
      ${baris('24 jam', br.d24)}
      ${baris('7 hari', br.d7)}
      ${baris('30 hari', br.d30)}
    </div>
    <div class="lab-subtitle">Sebaran return 24 jam di top-100</div>
    <div class="lab-chart">${histogram(br.bins, { w: 300, h: 66 })}</div>
    <div class="lab-stat-row">
      <span>Dispersi ${br.dispersi.toFixed(2)}%</span>
      <span>Advance/Decline ${br.advanceDecline.toFixed(2)}</span>
    </div>
    <div class="lab-note">${br.tafsir}</div>
    <div class="lab-caveat">Universe-nya top-100 kapitalisasi, bukan seluruh pasar. Memasukkan micro-cap yang bisa bergerak ratusan persen karena satu transaksi justru merusak sinyal breadth-nya.</div>`;
}

/* ============================================================
   ALTSEASON + DOMINANSI
   ============================================================ */
export function renderAltseason(alt, global){
  const el = $('altseasonContent');
  if (!el) return;
  if (!alt || !alt.available){
    el.innerHTML = kosong('Barometer altseason butuh data return 30 hari untuk top-50 — belum tersedia.');
    return;
  }

  const warna = alt.indeks >= 60 ? 'var(--violet)' : alt.indeks <= 40 ? 'var(--gold)' : 'var(--cyan)';
  const pemimpin = alt.pemimpin.map(p => `
    <div class="alt-leader">
      <span class="alt-leader-tick">${p.ticker}</span>
      <span class="alt-leader-val ${p.lebih >= 0 ? 'pos' : 'neg'}">${p.lebih >= 0 ? '+' : ''}${p.lebih.toFixed(1)} pt vs BTC</span>
    </div>`).join('');

  const dom = global && global.available ? `
    <div class="lab-stat-row">
      <span>Dominansi BTC <b>${global.btcDominance != null ? global.btcDominance.toFixed(1) + '%' : '—'}</b></span>
      <span>Dominansi ETH <b>${global.ethDominance != null ? global.ethDominance.toFixed(1) + '%' : '—'}</b></span>
    </div>
    <div class="lab-stat-row">
      <span>Kapitalisasi total <b>${formatCompact(global.totalMcap)}</b></span>
      <span>24 jam <b class="${(global.mcapChange24h ?? 0) >= 0 ? 'pos' : 'neg'}">${global.mcapChange24h != null ? formatPercent(global.mcapChange24h) : '—'}</b></span>
    </div>` : '';

  el.innerHTML = `
    <div class="alt-hero">
      <div class="alt-gauge">${gauge(alt.indeks, { color: warna, label: 'indeks altseason' })}</div>
      <div class="alt-hero-text">
        <div class="alt-index">${alt.indeks}<span>/100</span></div>
        <div class="alt-label">${alt.label}</div>
        ${alt.indeks7 != null ? `<div class="alt-sub">Versi 7 hari: ${alt.indeks7}</div>` : ''}
      </div>
    </div>
    ${dom}
    <div class="lab-subtitle">Paling jauh mengungguli BTC (30 hari)</div>
    <div class="alt-leaders">${pemimpin || kosong('Tidak ada data pembanding.')}</div>
    <div class="lab-note">${alt.tafsir}</div>`;
}

/* ============================================================
   GRID MULTI-TIMEFRAME
   ============================================================ */
export function renderMtfGrid(mtf){
  const el = $('mtfContent');
  if (!el) return;
  if (!mtf || !mtf.available){
    el.innerHTML = kosong('Grid multi-timeframe butuh data return 1h/24h/7d/30d — belum lengkap pada pengambilan ini.');
    return;
  }

  const sel = { '1h': 3, '24h': 8, '7d': 18, '30d': 35 }; // skala warna per horizon
  const rows = mtf.rows.map(r => {
    const sel4 = ['1h', '24h', '7d', '30d'].map(tf => {
      const v = r.tf[tf];
      const bg = heatColor(v, sel[tf]);
      const fg = heatText(v, sel[tf]);
      return `<td style="background:${bg}; color:${fg}">${v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1)}</td>`;
    }).join('');
    const tanda = r.alignment === 'up' ? '<span class="mtf-align up">selaras naik</span>'
      : r.alignment === 'down' ? '<span class="mtf-align down">selaras turun</span>'
      : '<span class="mtf-align mix">campur</span>';
    return `<tr>
      <td class="mtf-tick">${r.ticker}</td>${sel4}
      <td class="mtf-ath">${r.athGap != null ? r.athGap.toFixed(0) + '%' : '—'}</td>
      <td>${tanda}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="lab-table-scroll">
      <table class="mtf-table">
        <thead><tr><th>Koin</th><th>1 jam</th><th>24 jam</th><th>7 hari</th><th>30 hari</th><th>vs ATH</th><th>Arah</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="lab-note">${mtf.tafsir}</div>`;
}

/* ============================================================
   MATRIKS KORELASI
   ============================================================ */
export function renderCorrelation(corr){
  const el = $('corrContent');
  if (!el) return;
  if (!corr || !corr.available){
    el.innerHTML = kosong(corr?.alasan || 'Matriks korelasi belum bisa dihitung.');
    return;
  }

  const head = '<th></th>' + corr.tickers.map(t => `<th>${t}</th>`).join('');
  const rows = corr.matrix.map((baris, i) => {
    const sel = baris.map((v, j) => {
      if (i === j) return '<td class="corr-self">1</td>';
      return `<td style="background:${heatColor(v, 1)}; color:${heatText(v, 1)}">${v.toFixed(2)}</td>`;
    }).join('');
    return `<tr><th class="corr-row-head">${corr.tickers[i]}</th>${sel}</tr>`;
  }).join('');

  const kembar = corr.kembar.length
    ? corr.kembar.slice(0, 4).map(k =>
        `<div class="corr-twin"><b>${k.a} &amp; ${k.b}</b> korelasi ${k.r} — praktis satu posisi yang sama.</div>`).join('')
    : '<div class="corr-twin ok">Tidak ada pasangan dengan korelasi di atas 0,85 dalam matriks ini — masih ada perbedaan perilaku antar aset yang ditampilkan.</div>';

  el.innerHTML = `
    <div class="lab-table-scroll">
      <table class="corr-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="lab-subtitle">Diversifikasi semu</div>
    ${kembar}
    <div class="lab-note">${corr.tafsir}</div>
    <div class="lab-caveat">Jendela ${corr.jendela}. Korelasi jangka pendek berubah cepat saat rezim berubah — angka ini dihitung ulang tiap hari, bukan hafalan.</div>`;
}

/* ============================================================
   ANOMALI TURNOVER
   ============================================================ */
export function renderAnomaly(an){
  const el = $('anomalyContent');
  if (!el) return;
  if (!an || !an.available){
    el.innerHTML = kosong('Pemindai turnover belum bisa berjalan.');
    return;
  }
  if (!an.items.length){
    el.innerHTML = kosong('Tidak ada koin dengan turnover yang menyimpang jauh dari kebiasaan universe hari ini. Ketiadaan anomali juga informasi.');
    return;
  }

  const rows = an.items.map(it => `
    <div class="anom-row ${it.sunyi ? 'sunyi' : ''}">
      <span class="anom-tick">${it.ticker}</span>
      <span class="anom-turn">turnover ${it.turnover.toFixed(1)}% <span class="anom-z">z ${it.z.toFixed(2)}</span></span>
      <span class="anom-ret ${it.ret24h >= 0 ? 'pos' : 'neg'}">${formatPercent(it.ret24h)}</span>
      ${it.sunyi ? '<span class="anom-flag">ramai tapi harga diam</span>' : ''}
    </div>`).join('');

  const adaSunyi = an.items.some(i => i.sunyi);
  el.innerHTML = `
    <div class="anom-rows">${rows}</div>
    <div class="lab-note">
      Turnover = volume 24 jam dibagi kapitalisasi pasar, dinormalkan terhadap seluruh universe (turnover rata-rata ${an.rataTurnover.toFixed(1)}%).
      ${adaSunyi
        ? ' Koin bertanda <b>ramai tapi harga diam</b> adalah yang paling layak diperhatikan: perpindahan tangan jauh di atas kebiasaan sementara harga hampir tidak bergerak. Itu bisa berarti akumulasi, distribusi, atau sekadar aktivitas bot — datanya sendiri tidak bisa membedakan ketiganya.'
        : ' Semua anomali hari ini disertai pergerakan harga, jadi volumenya punya penjelasan yang terlihat.'}
    </div>`;
}

/* ============================================================
   NAVIGASI TAB LAB
   ============================================================ */
export function wireLabTabs(){
  const nav = $('labNav');
  if (!nav) return;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.lab-tab-btn');
    if (!btn) return;
    nav.querySelectorAll('.lab-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.lab-body').forEach(body => {
      body.classList.toggle('active', body.id === btn.dataset.lab);
    });
  });
}
