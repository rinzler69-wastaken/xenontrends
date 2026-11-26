/**
 * components/risk-lab.js — panel risiko & kesehatan (v2.3).
 *
 * Delapan panel yang menerjemahkan data jadi hal yang bisa dipakai untuk
 * mengambil keputusan tentang UKURAN dan KESIAPAN, bukan tentang arah:
 *
 *   Volatilitas   — seberapa liar pasar, relatif terhadap dirinya sendiri
 *   Drawdown      — seberapa dalam sedang terbenam dari puncak
 *   Level         — di mana harga pernah berbalik, dan seberapa sering
 *   Sesi          — kapan pergerakan biasanya terjadi
 *   Posisi        — siapa yang sedang ramai di satu sisi
 *   Dry powder    — berapa banyak amunisi yang menunggu di stablecoin
 *   Riwayat WCCS  — bentuk skor sistem ini sendiri sepekan terakhir
 *   Kesehatan data— sumber mana yang hidup, basi, atau mati
 */
import { $ } from '../utils/dom.js';
import { formatCurrency, formatCompact, formatPercent } from '../utils/formatters.js';
import { sparkline, underwaterCurve, percentileRuler, splitBar, verticalBars } from '../utils/svg.js';
import { getLedgerRaw } from '../engine/ledger.js';

function kosong(p){ return `<div class="lab-empty">${p}</div>`; }

/* ============================================================
   VOLATILITAS
   ============================================================ */
export function renderVolatility(vol){
  const el = $('volContent');
  if (!el) return;
  if (!vol || !vol.available){
    el.innerHTML = kosong('Volatilitas terealisasi butuh ≥100 titik harga dari chart 30 hari — belum tersedia.');
    return;
  }

  el.innerHTML = `
    <div class="vol-hero">
      <div>
        <div class="vol-big">${vol.vol7 ?? vol.vol30}<span>%</span></div>
        <div class="vol-cap">volatilitas terealisasi 7 hari (disetahunkan)</div>
      </div>
      <div class="vol-badge vol-${(vol.label || '').toLowerCase()}">${vol.label}</div>
    </div>
    ${vol.persentil != null ? `<div class="lab-chart">${percentileRuler(vol.persentil)}</div>` : ''}
    <div class="lab-stat-row">
      <span>30 hari <b>${vol.vol30}%</b></span>
      <span>Persentil <b>${vol.persentil ?? '—'}</b></span>
      <span>Rentang harian tipikal <b>±${vol.rentangHarianPct}%</b></span>
    </div>
    <div class="vol-translate">
      Dalam rupiah-dolar: pergerakan harian BTC yang <i>wajar</i> pada tingkat volatilitas ini
      sekitar <b>±${formatCompact(vol.rentangHarianUsd)}</b>. Pergerakan sebesar itu bukan kejadian
      luar biasa — ia bagian dari kebisingan normal.
    </div>
    <div class="lab-note">${vol.tafsir}</div>
    <div class="lab-caveat">Volatilitas terealisasi mengukur yang <b>sudah</b> terjadi. Ia tidak memberi tahu volatilitas besok, dan tidak mengandung informasi arah sama sekali.</div>`;
}

/* ============================================================
   DRAWDOWN
   ============================================================ */
export function renderDrawdown(dd){
  const el = $('ddContent');
  if (!el) return;
  if (!dd || !dd.available){
    el.innerHTML = kosong('Kurva drawdown butuh deret harga 30 hari.');
    return;
  }

  el.innerHTML = `
    <div class="dd-hero">
      <div class="dd-item"><div class="dd-val ${dd.sekarang < -0.5 ? 'neg' : ''}">${dd.sekarang.toFixed(1)}%</div><div class="dd-cap">dari puncak 30 hari</div></div>
      <div class="dd-item"><div class="dd-val neg">${dd.terdalam.toFixed(1)}%</div><div class="dd-cap">terdalam sebulan</div></div>
      <div class="dd-item"><div class="dd-val ${dd.dariAth != null && dd.dariAth < -0.5 ? 'neg' : ''}">${dd.dariAth != null ? dd.dariAth.toFixed(0) + '%' : '—'}</div><div class="dd-cap">dari ATH sepanjang masa</div></div>
    </div>
    <div class="lab-chart">${underwaterCurve(dd.underwater, { w: 300, h: 52 })}</div>
    <div class="lab-stat-row">
      <span>Puncak 30h <b>${formatCurrency(dd.puncak30d)}</b></span>
      <span>Lembah 30h <b>${formatCurrency(dd.lembah30d)}</b></span>
    </div>
    <div class="lab-note">${dd.tafsir}</div>`;
}

/* ============================================================
   LEVEL OTOMATIS
   ============================================================ */
export function renderLevels(lv, hargaSekarang){
  const el = $('levelsContent');
  if (!el) return;
  if (!lv || !lv.available){
    el.innerHTML = kosong('Deteksi level butuh ≥120 titik harga untuk menemukan pivot yang layak — belum tersedia.');
    return;
  }

  const baris = (z, tipe) => `
    <div class="lvl-row ${tipe}">
      <span class="lvl-price">${formatCurrency(z.harga)}</span>
      <span class="lvl-dist ${z.jarakPct >= 0 ? 'pos' : 'neg'}">${z.jarakPct >= 0 ? '+' : ''}${z.jarakPct.toFixed(2)}%</span>
      <span class="lvl-touch">${z.sentuhan}× teruji · ${z.kekuatan}</span>
    </div>`;

  el.innerHTML = `
    <div class="lvl-group">
      <div class="lvl-head down">Resistance terdekat</div>
      ${lv.resistance.length ? lv.resistance.map(z => baris(z, 'res')).join('') : kosong('Tidak ada zona resistance teruji di atas harga sekarang dalam 30 hari terakhir — harga sedang berada di wilayah tanpa pembanding baru-baru ini.')}
    </div>
    <div class="lvl-now">
      <span>harga sekarang</span><b>${formatCurrency(hargaSekarang)}</b>
    </div>
    <div class="lvl-group">
      <div class="lvl-head up">Support terdekat</div>
      ${lv.support.length ? lv.support.map(z => baris(z, 'sup')).join('') : kosong('Tidak ada zona support teruji di bawah harga sekarang dalam 30 hari terakhir.')}
    </div>
    <div class="lab-caveat">${lv.catatan}</div>`;
}

/* ============================================================
   HEATMAP SESI & HARI
   ============================================================ */
export function renderSessions(se){
  const el = $('sessionContent');
  if (!el) return;
  if (!se || !se.available){
    el.innerHTML = kosong('Heatmap sesi butuh deret harga per jam selama 30 hari.');
    return;
  }

  const labelSesi = se.sesi.map(s => ({ label: s.label, value: s.value }));
  const ket = se.sesi.map(s =>
    `<div class="sess-item"><b>${s.label}</b> <span>${s.jamWib}</span> <i class="${s.value >= 0 ? 'pos' : 'neg'}">${s.value >= 0 ? '+' : ''}${s.value.toFixed(1)}%</i></div>`).join('');

  el.innerHTML = `
    <div class="lab-subtitle">Kontribusi pergerakan per sesi (akumulasi 30 hari)</div>
    <div class="lab-chart">${verticalBars(labelSesi, { w: 300, h: 70 })}</div>
    <div class="sess-legend">${ket}</div>
    <div class="lab-subtitle">Per hari dalam sepekan (waktu WIB)</div>
    <div class="lab-chart">${verticalBars(se.hari, { w: 300, h: 68 })}</div>
    <div class="lab-note">${se.tafsir}</div>`;
}

/* ============================================================
   POSISI LEVERAGE
   ============================================================ */
export function renderPositioning(pos){
  const el = $('positioningContent');
  if (!el) return;
  if (!pos || !pos.available){
    el.innerHTML = kosong(pos?.tafsir || 'Data posisi tidak tersedia.');
    return;
  }

  const bar = (label, pct, seri) => pct == null ? '' : `
    <div class="pos-block">
      <div class="pos-head"><span>${label}</span><b>${pct.toFixed(1)}% long</b></div>
      ${splitBar(pct, { w: 300, h: 9 })}
      ${seri && seri.length > 3 ? `<div class="pos-spark">${sparkline(seri, { w: 300, h: 26, stroke: 'var(--text-3)', showLast: true })}</div>` : ''}
    </div>`;

  const selisih = pos.selisih != null ? `
    <div class="pos-diverge ${Math.abs(pos.selisih) >= 8 ? 'warn' : ''}">
      Selisih ritel − top trader: <b>${pos.selisih >= 0 ? '+' : ''}${pos.selisih.toFixed(1)} poin</b>
    </div>` : '';

  el.innerHTML = `
    ${bar('Akun ritel (global)', pos.ritel, pos.seriRitel)}
    ${bar('Top trader (posisi)', pos.top, pos.seriTop)}
    ${selisih}
    <div class="lab-note">${pos.tafsir}</div>
    <div class="lab-caveat">Sumber: data publik Binance Futures, 24 titik terakhir per jam. Ia menggambarkan satu bursa, bukan seluruh pasar — dan rasio akun tidak sama dengan rasio nilai posisi.</div>`;
}

/* ============================================================
   DRY POWDER
   ============================================================ */
export function renderDryPowder(dp){
  const el = $('dryPowderContent');
  if (!el) return;
  if (!dp || !dp.available){
    el.innerHTML = kosong(dp?.tafsir || 'Data pasokan stablecoin tidak tersedia.');
    return;
  }

  el.innerHTML = `
    <div class="dp-hero">
      <div>
        <div class="dp-big">${formatCompact(dp.total)}</div>
        <div class="dp-cap">total pasokan stablecoin beredar</div>
      </div>
      <div class="dp-deltas">
        <div>7h <b class="${(dp.change7d ?? 0) >= 0 ? 'pos' : 'neg'}">${dp.change7d != null ? (dp.change7d >= 0 ? '+' : '') + dp.change7d.toFixed(2) + '%' : '—'}</b></div>
        <div>30h <b class="${(dp.change30d ?? 0) >= 0 ? 'pos' : 'neg'}">${dp.change30d != null ? (dp.change30d >= 0 ? '+' : '') + dp.change30d.toFixed(2) + '%' : '—'}</b></div>
      </div>
    </div>
    <div class="lab-chart">${sparkline(dp.series, { w: 300, h: 40, stroke: 'var(--cyan)', fill: 'rgba(63,199,214,0.12)' })}</div>
    <div class="lab-note">${dp.tafsir}</div>`;
}

/* ============================================================
   RIWAYAT WCCS — bentuk skor sistem ini sendiri
   ============================================================ */
export function renderWccsHistory(){
  const el = $('wccsHistoryContent');
  if (!el) return;

  const entries = getLedgerRaw().filter(e => Date.now() - e.recordedAt < 7 * 86_400_000);
  if (entries.length < 4){
    el.innerHTML = kosong(`Baru ${entries.length} pembacaan tercatat dalam 7 hari terakhir — minimal 4 dibutuhkan sebelum grafik ini berarti. Semakin sering dashboard dibuka, semakin rapat garisnya.`);
    return;
  }

  const seri = entries.map(e => e.wccs);
  const terakhir = seri[seri.length - 1];
  const awal = seri[0];
  const maks = Math.max(...seri), min = Math.min(...seri);
  const arah = terakhir - awal;

  // Berapa kali klasifikasi berpindah — ukuran kestabilan pembacaan
  let pindah = 0;
  for (let i = 1; i < entries.length; i++){
    if (entries[i].classification !== entries[i - 1].classification) pindah++;
  }

  el.innerHTML = `
    <div class="lab-chart">${sparkline(seri, {
      w: 300, h: 44,
      stroke: terakhir >= 0 ? 'var(--up)' : 'var(--down)',
      fill: terakhir >= 0 ? 'rgba(33,209,159,0.10)' : 'rgba(255,84,112,0.10)'
    })}</div>
    <div class="lab-stat-row">
      <span>Sekarang <b>${terakhir >= 0 ? '+' : ''}${terakhir.toFixed(2)}</b></span>
      <span>Rentang <b>${min.toFixed(2)} … ${maks.toFixed(2)}</b></span>
      <span>Pergantian status <b>${pindah}×</b></span>
    </div>
    <div class="lab-note">
      ${pindah === 0
        ? 'Klasifikasi tidak berubah sama sekali selama periode ini — pembacaan yang stabil, bukan sistem yang macet: skornya sendiri tetap bergerak.'
        : pindah > entries.length * 0.4
          ? `Klasifikasi berganti ${pindah} kali dari ${entries.length} pembacaan. Frekuensi setinggi ini biasanya menandakan pasar yang berada di dekat batas kategori, bukan tren yang jelas — perlakukan tiap pembacaan sebagai potret sesaat.`
          : `Klasifikasi berganti ${pindah} kali dari ${entries.length} pembacaan — tingkat pergantian yang wajar.`}
      Skor bergerak ${arah >= 0 ? 'naik' : 'turun'} ${Math.abs(arah).toFixed(2)} poin sejak pembacaan terlama yang tercatat.
    </div>
    <div class="lab-caveat">Grafik ini merekam sejarah pemakaian di perangkat ini saja, bukan sejarah pasar. Ia melompat-lompat kalau dashboard jarang dibuka — itu sifat ledger lokal, bukan cacat data.</div>`;
}

/* ============================================================
   KESEHATAN DATA
   ============================================================ */
const NAMA_SUMBER = {
  prices: 'Harga BTC/ETH', btc1h: 'Chart BTC 1 hari', btc4h: 'Chart BTC 7 hari',
  eth1h: 'Chart ETH 1 hari', markets: 'Universe top-100', fng: 'Fear & Greed',
  onchain: 'Aliran on-chain', deriv: 'Funding + OI', oiChange: 'Perubahan OI 24 jam',
  tvl: 'TVL DeFi', news: 'Berita', global: 'Data global', btc30d: 'Chart BTC 30 hari',
  longShort: 'Rasio long/short', stables: 'Pasokan stablecoin'
};

export function renderDataHealth(health){
  const el = $('dataHealthContent');
  if (!el) return;
  if (!health || !health.items || !health.items.length){
    el.innerHTML = kosong('Status sumber data belum terkumpul.');
    return;
  }

  const rows = health.items.map(it => {
    const cls = it.status === 'ok' ? 'ok' : it.status === 'degraded' ? 'warn' : 'bad';
    const teks = it.status === 'ok' ? 'hidup' : it.status === 'degraded' ? it.note || 'terbatas' : 'gagal';
    return `<div class="dh-row">
      <span class="dh-dot ${cls}"></span>
      <span class="dh-name">${NAMA_SUMBER[it.key] || it.key}</span>
      <span class="dh-status ${cls}">${teks}</span>
      ${it.note && it.status === 'ok' ? `<span class="dh-note">${it.note}</span>` : ''}
    </div>`;
  }).join('');

  const ok = health.items.filter(i => i.status === 'ok').length;
  const total = health.items.length;
  const pct = Math.round((ok / total) * 100);

  el.innerHTML = `
    <div class="dh-summary">
      <b>${ok}/${total}</b> sumber hidup penuh (${pct}%)
    </div>
    <div class="dh-rows">${rows}</div>
    <div class="lab-caveat">
      Panel ini ada karena satu alasan: dashboard yang tetap terlihat rapi saat separuh sumbernya mati
      lebih berbahaya daripada dashboard yang jujur bilang sedang pincang. Setiap sumber yang gagal
      atau berjalan lewat jalur cadangan sudah otomatis mendiskon <i>confidence</i> di perhitungan,
      dan di sini kamu bisa melihat persis sumber mana yang bermasalah.
    </div>`;
}
