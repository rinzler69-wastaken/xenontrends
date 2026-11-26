/**
 * engine/content-generator.js — PABRIK KONTEN GRUP.
 *
 * Dashboard ini sudah menghitung semuanya dengan jujur. Masalahnya, yang
 * dibutuhkan admin grup tiap pagi bukan dashboard — tapi *teks yang tinggal
 * ditempel*. Modul ini menutup jarak terakhir itu: mengubah satu objek state
 * hasil render jadi delapan format konten berbeda, masing-masing dengan
 * panjang, nada, dan tujuan yang berbeda.
 *
 * Prinsip yang dipegang (turunan dari Bab 1.2 & 1.3 dokumen konsep):
 *   - TIDAK PERNAH mengarang angka. Kalau data tidak ada, tulis apa adanya.
 *   - Setiap klaim yang berasal dari sumber lemah (mock on-chain, proxy
 *     publik, baseline statis) DITANDAI di teks, bukan disembunyikan.
 *   - Setiap output diakhiri disclaimer.
 *   - Semua fungsi di sini MURNI: state masuk, string keluar. Tidak menyentuh
 *     DOM, tidak menyimpan apa pun. Supaya gampang diuji dan dipakai ulang.
 *
 * Rotasi harian (edukasi, quiz, poll) memakai "day index" deterministik —
 * konten berganti tiap hari tapi bisa direproduksi, jadi kalau admin
 * membuka dashboard tiga kali dalam sehari dia dapat materi yang sama,
 * bukan undian baru tiap refresh.
 */
import {
  formatCurrency, formatCompact, formatPercent,
  fgClassify, formatFundingRate
} from '../utils/formatters.js';
import { DISCLAIMER } from './tone-guard.js';
import { getLedgerRaw } from './ledger.js';
import { getAlerts, getPriceAlerts } from './watchtower.js';

const RULE = '━━━━━━━━━━━━━━━━━━━━━━━';
const THIN = '───────────────────────';

const PILLAR_NAMES = {
  A: 'Price Action',
  B: 'Momentum Teknikal',
  C: 'Sentimen',
  D: 'Aliran On-Chain',
  E: 'Derivatives'
};

/* ============================================================
   HELPER
   ============================================================ */

/** Hari ke-berapa sejak epoch, di zona WIB. Dasar rotasi konten harian. */
export function dayIndex(date){
  const d = date || new Date();
  const wib = new Date(d.getTime() + 7 * 3600_000);
  return Math.floor(wib.getTime() / 86_400_000);
}

function tanggalPendek(date){
  try{
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long',
      timeZone: 'Asia/Jakarta'
    }).format(date || new Date());
  }catch(e){ return ''; }
}

function jamWIB(date){
  try{
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
    }).format(date || new Date()).replace('.', ':') + ' WIB';
  }catch(e){ return ''; }
}

function arahPilar(v){
  if (v > 0.35) return 'condong bullish';
  if (v > 0.1)  return 'sedikit bullish';
  if (v < -0.35) return 'condong bearish';
  if (v < -0.1) return 'sedikit bearish';
  return 'netral';
}

function ikonPilar(v){
  if (v > 0.1) return '🟢';
  if (v < -0.1) return '🔴';
  return '⚪';
}

function ikonStatus(tone){
  return {
    'bullish': '🟢', 'bullish-soft': '🟩',
    'neutral': '⚪',
    'bearish-soft': '🟥', 'bearish': '🔴'
  }[tone] || '⚪';
}

function labelRSI(v){
  if (v == null) return 'data tidak tersedia';
  if (v >= 70) return 'Overbought';
  if (v >= 50) return 'Strong';
  if (v >= 30) return 'Weak';
  return 'Oversold';
}

function bersih(html){
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function plusMinus(n, dec){
  if (n == null || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(dec ?? 2);
}

/**
 * Semua peringatan kejujuran yang relevan untuk state ini. Dipakai di
 * beberapa format sekaligus supaya konsisten — kalau sumber datanya lemah,
 * SEMUA format menyebutkannya, bukan cuma yang panjang.
 */
const A = (state) => state.__analytics || {};

/** Ringkasan satu baris struktur pasar — dipakai beberapa format sekaligus. */
function barisStruktur(state){
  const a = A(state);
  const out = [];
  if (a.regime?.available) out.push(`Rezim: ${a.regime.label}`);
  if (a.breadth?.available) out.push(`${a.breadth.d24.pctNaik}% koin top-100 naik`);
  if (a.altseason?.available) out.push(`altseason ${a.altseason.indeks}/100`);
  if (a.volatility?.available && a.volatility.persentil != null) out.push(`volatilitas persentil ${a.volatility.persentil}`);
  return out.join(' · ');
}

function catatanKejujuran(state){
  const out = [];
  if (state.__onchainIsMock !== false){
    out.push('Aliran on-chain masih memakai data simulasi (adapter whale real belum diaktifkan) — perlakukan Pilar D sebagai ilustrasi, bukan bukti.');
  }
  if (state.deriv && state.deriv.usedPublicProxy){
    out.push('Data derivatives hari ini lewat jalur cadangan (proxy publik), jadi keyakinan Pilar E otomatis didiskon.');
  }
  if (!state.deriv){
    out.push('Data funding rate & open interest gagal diambil — Pilar E tidak berkontribusi penuh hari ini.');
  }
  if (state.rsi1h == null || state.rsi4h == null){
    out.push('Sebagian data RSI tidak tersedia pada pengambilan ini.');
  }
  if (state.__narrative && state.__narrative.estimateDisclaimer){
    out.push('Pembacaan ini indikasi awal dari kondisi pasar saat ini, bukan kepastian arah.');
  }
  return out;
}

/* ============================================================
   FORMAT 1 — BRIEF LENGKAP (TELEGRAM)
   Format utama. Panjang, terstruktur, semua pilar dibuka.
   ============================================================ */
export function buildTelegramBrief(state){
  const {
    btc, eth, fg, rsi1h, rsi4h, onchain, deriv, oiChangePct, momentum, tvl,
    __wccsResult: w, __classification: cls, __confidence: conf,
    __narrative: nar, __trackRecord: tr, __momentumFlags: flags
  } = state;

  const L = [];
  L.push(`🔥 ArgonPulse — CONFLUENCE BRIEF`);
  L.push(`${tanggalPendek()} · ${jamWIB()}`);
  L.push(RULE);
  L.push('');

  L.push(`${ikonStatus(cls.tone)} STATUS: ${cls.label}`);
  L.push(`Tingkat keyakinan sistem: ${conf}%  (WCCS ${plusMinus(w.wccs, 2)})`);
  L.push('');

  L.push('💰 HARGA');
  L.push(`BTC   ${formatCurrency(btc.usd)}   ${formatPercent(btc.change)}`);
  L.push(`ETH   ${formatCurrency(eth.usd)}   ${formatPercent(eth.change)}`);
  L.push('');

  L.push('🌡 KONDISI PASAR');
  const fgDelta = fg.trendDelta != null ? ` (${plusMinus(fg.trendDelta, 0)} dari kemarin)` : '';
  L.push(`Fear & Greed   ${fg.value} — ${fgClassify(fg.value)}${fgDelta}`);
  L.push(`RSI 1H BTC     ${rsi1h != null ? rsi1h : '—'} — ${labelRSI(rsi1h)}`);
  if (rsi4h != null) L.push(`RSI 4H BTC     ${rsi4h} — ${labelRSI(rsi4h)}`);
  if (deriv){
    L.push(`Funding BTC    ${formatFundingRate(deriv.rate)} per 8 jam`);
    L.push(`OI 24 jam      ${oiChangePct != null ? formatPercent(oiChangePct) : 'data tidak tersedia'}`);
  } else {
    L.push('Funding & OI   data tidak tersedia pada pengambilan ini');
  }
  L.push('');

  L.push('🧭 LIMA PILAR SINYAL');
  Object.entries(w.pillars).forEach(([k, v]) => {
    L.push(`${ikonPilar(v)} ${PILLAR_NAMES[k].padEnd(18)} ${plusMinus(v, 2).padStart(6)}  ${arahPilar(v)}`);
  });
  L.push('');

  L.push('🐋 ALIRAN ON-CHAIN (24 jam)');
  L.push(`BTC   ${formatCompact(onchain.btc.amount * 1_000_000)}  ${onchain.btc.amount >= 0 ? '→ cenderung tekanan jual' : '→ cenderung akumulasi'}`);
  L.push(`ETH   ${formatCompact(onchain.eth.amount * 1_000_000)}  ${onchain.eth.amount >= 0 ? '→ cenderung tekanan jual' : '→ cenderung akumulasi'}`);
  L.push('');

  const topN = momentum.slice(0, 5);
  if (topN.length){
    L.push('🔥 MOMENTUM — 5 TERATAS');
    topN.forEach((m, i) => {
      L.push(`${i + 1}. ${m.ticker.padEnd(7)} skor ${String(m.score).padStart(2)}   ${formatPercent(m.return24h)}`);
    });
    L.push('');
  }

  if (flags && flags.length){
    L.push('🔍 PERLU DIPERHATIKAN');
    flags.slice(0, 3).forEach(f => L.push(`• ${f.ticker} — ${f.label.toLowerCase()}`));
    L.push('');
  }

  // --- Lapisan analitik v2.3 ---
  const a = A(state);
  if (a.regime?.available){
    L.push('🧭 REZIM PASAR');
    L.push(`${a.regime.label}`);
    L.push(a.regime.ringkas);
    L.push('');
  }

  const struktur = [];
  if (a.breadth?.available){
    struktur.push(`Lebar pasar   ${a.breadth.d24.pctNaik}% dari top-100 naik 24 jam (${a.breadth.d24.naik}↑/${a.breadth.d24.turun}↓)`);
  }
  if (a.altseason?.available){
    struktur.push(`Altseason     ${a.altseason.indeks}/100 — ${a.altseason.label}`);
  }
  if (a.correlation?.available){
    struktur.push(`Korelasi rata ${a.correlation.rataKorelasi} antar 8 koin teratas`);
  }
  if (a.dryPowder?.available && a.dryPowder.change30d != null){
    struktur.push(`Stablecoin    ${formatCompact(a.dryPowder.total)} (${a.dryPowder.change30d >= 0 ? '+' : ''}${a.dryPowder.change30d.toFixed(1)}% dalam 30 hari)`);
  }
  if (struktur.length){
    L.push('📐 STRUKTUR PASAR');
    struktur.forEach(x => L.push(x));
    L.push('');
  }

  const risiko = [];
  if (a.volatility?.available){
    risiko.push(`Volatilitas   ${a.volatility.vol7 ?? a.volatility.vol30}% disetahunkan — ${a.volatility.label}${a.volatility.persentil != null ? ` (persentil ${a.volatility.persentil})` : ''}`);
    risiko.push(`Rentang harian wajar BTC ±${a.volatility.rentangHarianPct}%`);
  }
  if (a.drawdown?.available){
    risiko.push(`Jarak dari puncak 30 hari ${a.drawdown.sekarang.toFixed(1)}%`);
  }
  if (a.levels?.available){
    const r = a.levels.resistance[0], sp = a.levels.support[0];
    if (r) risiko.push(`Resistance terdekat ${formatCurrency(r.harga)} (${r.jarakPct >= 0 ? '+' : ''}${r.jarakPct.toFixed(1)}%, ${r.sentuhan}× teruji)`);
    if (sp) risiko.push(`Support terdekat   ${formatCurrency(sp.harga)} (${sp.jarakPct.toFixed(1)}%, ${sp.sentuhan}× teruji)`);
  }
  if (a.positioning?.available && a.positioning.ritel != null){
    risiko.push(`Posisi ritel ${a.positioning.ritel.toFixed(1)}% long${a.positioning.top != null ? `, top trader ${a.positioning.top.toFixed(1)}%` : ''}`);
  }
  if (risiko.length){
    L.push('🛡 UKURAN RISIKO');
    risiko.forEach(x => L.push(x));
    L.push('');
  }

  if (a.anomaly?.available && a.anomaly.items.some(i => i.sunyi)){
    L.push('👀 RAMAI TAPI HARGA DIAM');
    a.anomaly.items.filter(i => i.sunyi).slice(0, 3).forEach(i =>
      L.push(`${i.ticker} — turnover ${i.turnover.toFixed(1)}% (z ${i.z.toFixed(1)}), harga cuma ${formatPercent(i.ret24h)}`));
    L.push('');
  }

  L.push('🧠 BACA SITUASINYA');
  L.push(bersih(nar.mainText));
  L.push('');
  L.push('⏭ YANG PERLU DIPANTAU');
  L.push(bersih(nar.invalidation));
  L.push('');

  if (tvl && tvl.available){
    L.push(`🛰 TVL DeFi ${formatCompact(tvl.current)} (konteks, di luar perhitungan skor)`);
    L.push('');
  }

  if (tr && tr.ready){
    L.push('📊 REKAM JEJAK SISTEM INI');
    L.push(`Hit rate ${tr.hitRate}% dari ${tr.sampleSize} sinyal yang sudah dievaluasi · Brier ${tr.brierScore}`);
    L.push('(dihitung otomatis dari sinyal yang pernah tampil di perangkat admin, bukan klaim marketing)');
    L.push('');
  } else if (tr){
    L.push(`📊 Rekam jejak: baru ${tr.sampleSize} sinyal terevaluasi — belum cukup untuk ditampilkan sebagai statistik.`);
    L.push('');
  }

  const notes = catatanKejujuran(state);
  if (notes.length){
    L.push('⚠️ CATATAN KEJUJURAN DATA');
    notes.forEach(n => L.push(`• ${n}`));
    L.push('');
  }

  L.push(RULE);
  L.push(DISCLAIMER);
  return L.join('\n');
}

/* ============================================================
   FORMAT 2 — BRIEF RINGKAS (WHATSAPP)
   Target di bawah ~900 karakter supaya muat jadi caption gambar WA.
   ============================================================ */
export function buildWhatsAppBrief(state){
  const { btc, eth, fg, rsi1h, momentum, deriv,
          __classification: cls, __confidence: conf, __narrative: nar } = state;

  const L = [];
  L.push(`🔥 *ArgonPulse Brief* · ${tanggalPendek()}`);
  L.push('');
  L.push(`${ikonStatus(cls.tone)} *${cls.label}* — keyakinan ${conf}%`);
  L.push('');
  L.push(`BTC ${formatCurrency(btc.usd)} ${formatPercent(btc.change)}`);
  L.push(`ETH ${formatCurrency(eth.usd)} ${formatPercent(eth.change)}`);
  L.push(`F&G ${fg.value} (${fgClassify(fg.value)}) · RSI 1H ${rsi1h ?? '—'}`);
  if (deriv) L.push(`Funding ${formatFundingRate(deriv.rate)}`);
  const strukturWa = barisStruktur(state);
  if (strukturWa) L.push(strukturWa);
  L.push('');

  // Narasi dipotong di batas kalimat, bukan di tengah kata — supaya tidak
  // pernah menghasilkan potongan kalimat yang maknanya berubah.
  L.push(`_${potongKalimat(bersih(nar.mainText), 240)}_`);
  L.push('');

  const top3 = momentum.slice(0, 3);
  if (top3.length){
    L.push('🔥 Momentum: ' + top3.map(m => `${m.ticker} (${formatPercent(m.return24h)})`).join(' · '));
    L.push('');
  }

  L.push(`⏭ Pantau: ${potongKalimat(bersih(nar.invalidation), 170)}`);
  L.push('');
  L.push(DISCLAIMER);
  return L.join('\n');
}

/** Potong teks di akhir kalimat terdekat sebelum batas, bukan di tengah kata. */
function potongKalimat(teks, maks){
  if (teks.length <= maks) return teks;
  const potong = teks.slice(0, maks);
  const titik = Math.max(potong.lastIndexOf('. '), potong.lastIndexOf(' — '));
  if (titik > maks * 0.5) return potong.slice(0, titik + 1);
  const spasi = potong.lastIndexOf(' ');
  return potong.slice(0, spasi > 0 ? spasi : maks) + '…';
}

/* ============================================================
   FORMAT 3 — CAPTION SCREENSHOT
   Pendek. Dipasang di bawah PNG hasil tombol "Simpan Gambar Halaman".
   ============================================================ */
export function buildCaption(state){
  const { btc, fg, __classification: cls, __confidence: conf, momentum } = state;
  const juara = momentum[0];

  const L = [];
  L.push(`🔥 Confluence Brief · ${tanggalPendek()}`);
  L.push(`${ikonStatus(cls.tone)} ${cls.label} · keyakinan ${conf}%`);
  L.push(`BTC ${formatCurrency(btc.usd)} ${formatPercent(btc.change)} · F&G ${fg.value} (${fgClassify(fg.value)})`);
  if (juara) L.push(`Momentum teratas: ${juara.ticker} ${formatPercent(juara.return24h)}`);
  const aCap = A(state);
  if (aCap.regime?.available) L.push(`Rezim: ${aCap.regime.label}`);
  L.push('');
  L.push('Angka lengkap 5 pilar ada di gambar 👆 Bahas di bawah ya.');
  L.push('');
  L.push(DISCLAIMER);
  return L.join('\n');
}

/* ============================================================
   FORMAT 4 — UPDATE INTRADAY (dari Delta Engine)
   Untuk posting kedua/ketiga dalam sehari: hanya APA YANG BERUBAH.
   ============================================================ */
export function buildUpdateIntraday(state){
  const d = state.__delta;
  const { btc, eth, fg, __classification: cls, __confidence: conf } = state;

  if (!d){
    return [
      '↻ *Update Intraday*',
      '',
      'Belum ada snapshot pembanding di perangkat ini, jadi belum ada yang bisa dibandingkan.',
      'Buka dashboard lagi beberapa jam dari sekarang — Delta Engine akan mencatat apa yang bergeser sejak sekarang.',
      '',
      DISCLAIMER
    ].join('\n');
  }

  const L = [];
  L.push(`↻ *Update Intraday* · ${jamWIB()}`);
  L.push(`Dibanding ${d.minutesAgo < 60 ? `${d.minutesAgo} menit` : `${Math.round(d.minutesAgo / 60)} jam`} lalu:`);
  L.push('');

  if (d.classificationChanged){
    L.push(`🔁 Status berubah: ${d.previousClassification} → *${cls.label}*`);
  } else {
    L.push(`➖ Status masih ${cls.label} (WCCS bergeser ${plusMinus(d.wccsDelta, 2)})`);
  }
  L.push(`BTC ${plusMinus(d.btcPctMove)}% → ${formatCurrency(btc.usd)}`);
  L.push(`ETH ${plusMinus(d.ethPctMove)}% → ${formatCurrency(eth.usd)}`);
  if (d.fgDelta !== 0) L.push(`Fear & Greed ${plusMinus(d.fgDelta, 0)} → ${fg.value} (${fgClassify(fg.value)})`);
  if (d.confidenceDelta !== 0) L.push(`Keyakinan sistem ${plusMinus(d.confidenceDelta, 0)} poin → ${conf}%`);
  L.push('');

  // Interpretasi ringan — dilabeli sebagai interpretasi, bukan fakta.
  const geser = Math.abs(d.wccsDelta);
  if (d.classificationChanged){
    L.push('Catatan: perubahan kategori dalam hitungan jam biasanya berarti ada satu komponen yang bergerak tajam, bukan lima-limanya berubah. Cek breakdown sebelum menyimpulkan tren baru.');
  } else if (geser < 0.1){
    L.push('Catatan: pergeseran sekecil ini masuk rentang noise normal — belum layak disebut perubahan arah.');
  } else {
    L.push('Catatan: skor bergeser tapi belum melewati batas kategori. Perlu dipantau, belum perlu disimpulkan.');
  }
  L.push('');
  L.push(DISCLAIMER);
  return L.join('\n');
}

/* ============================================================
   FORMAT 5 — EDUKASI HARIAN
   Materi dipilih ADAPTIF: kondisi pasar hari ini yang menentukan topik
   apa yang paling relevan diajarkan. Kalau tidak ada pemicu khusus,
   jatuh ke rotasi harian deterministik.
   ============================================================ */
const PUSTAKA_EDUKASI = [
  {
    id: 'funding-crowded',
    judul: 'Funding Rate Tinggi Bukan Berarti Tren Makin Kuat',
    // pemicu: ada komponen Pilar E yang masuk zona crowded
    pemicu: (s) => (s.__wccsResult?.components || []).some(c => c.pillar === 'E' && c.isCrowded),
    isi: (s) => {
      const fr = s.deriv ? formatFundingRate(s.deriv.rate) : 'data tidak tersedia';
      return [
        `Hari ini funding rate BTC ada di ${fr} dan sistem menandainya masuk zona crowded. Ini momen bagus untuk meluruskan satu salah paham yang sering muncul di grup.`,
        '',
        'Funding rate adalah biaya yang dibayar satu sisi ke sisi lain supaya harga perpetual futures menempel ke harga spot. Funding positif tinggi = yang long membayar yang short, artinya *posisi long sedang ramai*.',
        '',
        'Banyak orang membaca ini sebagai "berarti banyak yang yakin naik, ikut saja". Secara statistik justru sebaliknya: makin ramai satu sisi, makin banyak bahan bakar untuk likuidasi beruntun kalau harga bergerak berlawanan sedikit saja. Itu sebabnya di dashboard ini Pilar E adalah satu-satunya pilar yang transformasinya non-linear — funding ekstrem dihitung sebagai *sinyal risiko*, bukan konfirmasi arah.',
        '',
        'Yang perlu dipantau: apakah funding kembali ke rentang normal tanpa terjadi squeeze (artinya crowding terurai pelan-pelan), atau justru diikuti lonjakan volatilitas mendadak.'
      ].join('\n');
    }
  },
  {
    id: 'rsi-overbought',
    judul: 'Overbought Bukan Sinyal Jual',
    pemicu: (s) => s.rsi1h != null && s.rsi1h >= 70,
    isi: (s) => [
      `RSI 1 jam BTC hari ini ${s.rsi1h} — masuk wilayah yang biasa disebut "overbought". Ini istilah yang paling sering disalahartikan di grup kripto.`,
      '',
      'RSI mengukur kecepatan dan besar perubahan harga terakhir, bukan kewajaran harga. Nilai di atas 70 artinya: dalam 14 periode terakhir, kenaikan jauh mendominasi penurunan. Itu deskripsi tentang *momentum*, bukan vonis bahwa harga sudah kemahalan.',
      '',
      'Dalam tren kuat, RSI bisa bertahan di atas 70 selama berhari-hari sambil harga terus naik. Yang menjual semata-mata karena "RSI overbought" sering keluar terlalu awal.',
      '',
      'Cara membaca yang lebih berguna: perhatikan kapan RSI *turun* dari zona itu sementara harga masih membuat puncak baru. Ketidaksesuaian antara keduanya (divergence) jauh lebih informatif daripada angka RSI itu sendiri.'
    ].join('\n')
  },
  {
    id: 'rsi-oversold',
    judul: 'Oversold Juga Bukan Sinyal Beli',
    pemicu: (s) => s.rsi1h != null && s.rsi1h <= 30,
    isi: (s) => [
      `RSI 1 jam BTC di ${s.rsi1h} hari ini — wilayah "oversold". Kebalikan dari overbought, dan sama seringnya disalahpahami.`,
      '',
      'Oversold berarti penurunan mendominasi dalam 14 periode terakhir. Itu saja. Ia tidak memberi tahu kapan penurunan berhenti.',
      '',
      'Dalam pasar yang sedang benar-benar rusak, RSI bisa menempel di bawah 30 sambil harga terus turun — fenomena yang di literatur teknikal disebut "oversold can stay oversold". Membeli hanya karena angka ini berisiko menangkap pisau jatuh.',
      '',
      'Yang lebih berarti: apakah pilar lain ikut mendukung. Kalau RSI rendah TAPI aliran on-chain menunjukkan akumulasi dan sentimen sudah di Extreme Fear, itu konfluensi. Kalau RSI rendah sendirian, itu cuma satu suara dari sepuluh komponen.'
    ].join('\n')
  },
  {
    id: 'fg-ekstrem',
    judul: 'Kenapa Sentimen Ekstrem Dibaca Terbalik',
    pemicu: (s) => s.fg.value >= 75 || s.fg.value <= 25,
    isi: (s) => [
      `Fear & Greed hari ini ${s.fg.value} — ${fgClassify(s.fg.value)}. Mari bahas kenapa angka ini menarik justru di ujung-ujungnya.`,
      '',
      'Indeks ini merangkum volatilitas, momentum pasar, dominasi BTC, dan tren pencarian jadi satu angka 0-100. Yang penting bukan angkanya, tapi *posisi relatifnya terhadap kebiasaan*.',
      '',
      'Ketika mayoritas pelaku pasar sudah berada di satu sisi emosi yang sama, sisa orang yang bisa mendorong harga ke arah itu makin sedikit. Extreme Greed berarti hampir semua yang mau beli sudah beli. Extreme Fear berarti hampir semua yang mau panik sudah panik.',
      '',
      'Tapi hati-hati: sentimen ekstrem cenderung bertahan berminggu-minggu. Ini indikator *kondisi*, bukan pemicu waktu. Di dashboard ini bobotnya hanya 15% justru karena alasan itu — cukup penting untuk diperhitungkan, tidak cukup akurat untuk mendominasi.'
    ].join('\n')
  },
  {
    id: 'divergensi',
    judul: 'Divergensi: Ketika Harga dan Aliran Dana Tidak Sepakat',
    pemicu: (s) => (s.__momentumFlags || []).length > 0
      || /divergen|netflow/i.test(bersih(s.__narrative?.mainText || '')),
    isi: (s) => {
      const f = (s.__momentumFlags || [])[0];
      const contoh = f ? `Hari ini contohnya muncul di ${f.ticker}: ${f.label.toLowerCase()}.` : '';
      return [
        'Divergensi adalah kondisi ketika dua hal yang biasanya bergerak bersama mulai berpisah arah. Di dashboard ini ada dua jenis yang dipindai.',
        '',
        '*Pertama*, harga versus aliran on-chain. Harga naik tapi koin justru mengalir masuk ke exchange (biasanya persiapan jual) — kenaikan itu kurang didukung akumulasi riil.',
        '',
        '*Kedua*, harga versus partisipasi pasar. Harga sebuah koin melonjak tapi perubahan market cap-nya jauh lebih kecil — indikasi kenaikan didorong sedikit pelaku dengan volume tipis, bukan minat luas.',
        contoh ? '' : null,
        contoh || null,
        '',
        'Divergensi bukan ramalan pembalikan. Ia cuma menandai bahwa cerita yang ditampilkan harga belum didukung bukti lain. Kadang bukti menyusul dan harga benar. Kadang tidak. Yang berubah adalah tingkat keyakinan yang pantas kamu berikan, bukan arah keputusan.'
      ].filter(x => x !== null).join('\n');
    }
  },
  {
    id: 'konfluensi',
    judul: 'Kenapa Satu Indikator Selalu Kalah dari Konfluensi',
    pemicu: () => false, // hanya lewat rotasi
    isi: (s) => [
      'Setiap indikator teknikal punya tingkat kesalahan yang tinggi kalau dipakai sendirian. Ini bukan kelemahan indikatornya — ini sifat pasar yang berisik.',
      '',
      'Gagasan konfluensi sederhana: kalau lima sumber informasi yang metodenya berbeda dan sumber datanya berbeda kebetulan menunjuk arah yang sama, kemungkinan kelimanya salah bersamaan lebih kecil daripada satu indikator salah sendirian.',
      '',
      `Itulah struktur WCCS: Price Action 25%, Momentum Teknikal 20%, Sentimen 15%, Aliran On-Chain 20%, Derivatives 20%. Hari ini skor gabungannya ${plusMinus(s.__wccsResult.wccs, 2)} dengan keyakinan ${s.__confidence}%.`,
      '',
      'Perhatikan bahwa angka keyakinan itu naik ketika pilar-pilar *sepakat*, dan turun ketika mereka bertengkar — bukan ketika skornya besar. Skor besar tapi pilar saling bertentangan justru pantas diragukan.',
      '',
      'Pelajaran praktisnya: jangan tanya "indikator apa yang paling akurat". Tanya "berapa banyak sumber independen yang menunjuk arah sama, dan seberapa independen mereka sebenarnya".'
    ].join('\n')
  },
  {
    id: 'brier',
    judul: 'Cara Menilai Apakah Sebuah Sistem Sinyal Layak Dipercaya',
    pemicu: () => false,
    isi: (s) => {
      const tr = s.__trackRecord;
      const ket = tr && tr.ready
        ? `Di perangkat admin, sistem ini saat ini di hit rate ${tr.hitRate}% dari ${tr.sampleSize} evaluasi, dengan Brier score ${tr.brierScore}.`
        : `Sistem ini baru mengumpulkan ${tr ? tr.sampleSize : 0} sinyal terevaluasi — belum cukup untuk diklaim akurat atau tidak akurat.`;
      return [
        'Pertanyaan yang jarang ditanyakan ke penyedia sinyal mana pun: "berapa persen sinyal kamu yang benar, dihitung dari semua sinyal, bukan yang kamu pilih untuk ditampilkan?"',
        '',
        'Ada dua angka yang layak diminta.',
        '',
        '*Hit rate* — persentase arah yang benar. Gampang dipahami, tapi mudah dimanipulasi: kalau seseorang cuma memberi sinyal ketika pasar jelas, hit rate bisa tinggi tanpa berguna.',
        '',
        '*Brier score* — mengukur kalibrasi, yaitu apakah tingkat keyakinan yang diklaim cocok dengan kenyataan. Sistem yang bilang "yakin 90%" tapi benar cuma 50% akan dihukum berat di sini. Nol berarti sempurna, satu berarti terburuk.',
        '',
        ket,
        '',
        'Angka itu dicatat otomatis tiap kali sinyal tampil, lalu dievaluasi sendiri 24 jam kemudian. Perlu dicatat: ukuran sampel kecil membuat angka semacam ini berisiko dibaca berlebihan. Kalau sebuah sistem tidak berani menampilkan angka semacam ini, itu sendiri sudah informasi.'
      ].join('\n');
    }
  },
  {
    id: 'zscore',
    judul: 'Kenapa Angka Mentah Menyesatkan, dan Apa Itu Z-Score',
    pemicu: () => false,
    isi: (s) => [
      'Kenaikan BTC 2% dan kenaikan sebuah altcoin 2% adalah dua peristiwa yang sangat berbeda, meskipun angkanya identik. Yang satu tidak biasa, yang satu rutin.',
      '',
      'Z-score menjawab masalah ini: ia mengukur seberapa jauh sebuah angka menyimpang dari kebiasaannya sendiri, dalam satuan simpangan baku. Z = 0 berarti persis rata-rata. Z = 2 berarti jauh di luar kebiasaan.',
      '',
      `Contoh hari ini: BTC bergerak ${formatPercent(s.btc.change)}. Yang masuk ke perhitungan skor bukan angka itu, tapi posisinya relatif terhadap sebaran pergerakan BTC selama ini.`,
      '',
      'Konsekuensinya penting: dengan z-score, sepuluh komponen yang satuannya beda-beda — persen, poin indeks, dolar netflow, basis poin funding — bisa dijumlahkan dalam satu skala yang adil. Tanpa itu, komponen dengan angka besar akan otomatis mendominasi hanya karena satuannya besar.',
      '',
      'Catatan kejujuran: kualitas z-score bergantung pada kualitas baseline pembandingnya. Sistem ini mulai dengan estimasi statis dan otomatis beralih ke baseline dari data riil setelah cukup observasi terkumpul.'
    ].join('\n')
  },
  {
    id: 'risk-sizing',
    judul: 'Manajemen Risiko: Bagian yang Membosankan dan Paling Menentukan',
    pemicu: () => false,
    isi: () => [
      'Dua orang bisa mengambil keputusan yang persis sama dan berakhir sangat berbeda, semata karena ukuran posisi dan rencana keluarnya berbeda.',
      '',
      'Beberapa prinsip yang bersifat edukatif, bukan instruksi untuk kasus siapa pun secara spesifik:',
      '',
      '*Batas kerugian ditentukan sebelum masuk, bukan setelah harga bergerak.* Keputusan yang diambil saat sedang rugi hampir selalu lebih buruk daripada yang diambil saat tenang.',
      '',
      '*Ukuran posisi adalah fungsi dari jarak ke titik invalidasi, bukan dari tingkat keyakinan.* Makin jauh titik salahnya, makin kecil ukurannya — supaya kerugian maksimal tetap sama berapa pun setup-nya.',
      '',
      '*Matematika pemulihan itu tidak simetris.* Rugi 50% butuh naik 100% untuk kembali impas. Rugi 20% cuma butuh 25%. Inilah alasan membatasi kerugian jauh lebih berdampak daripada memaksimalkan keuntungan.',
      '',
      '*Berapa pun tingkat keyakinan sebuah sistem, termasuk yang ini, rangkaian hasil buruk beruntun tetap mungkin terjadi.* Sistem dengan hit rate 60% masih bisa salah lima kali berturut-turut — itu bukan tanda sistemnya rusak, itu sifat probabilitas.'
    ].join('\n')
  },
  {
    id: 'mock-data',
    judul: 'Kenapa Kami Bilang Sebagian Data Ini Masih Simulasi',
    pemicu: () => false,
    isi: () => [
      'Pengumuman kecil yang jarang dibuat aplikasi sejenis: sebagian data di dashboard ini belum sepenuhnya real, dan itu ditulis terang-terangan di layar.',
      '',
      'Aliran on-chain (Pilar D) default-nya memakai data simulasi karena API whale tracking yang layak berbayar. Adapter untuk menyambungkannya sudah siap, tinggal diisi kunci API. Sampai itu terjadi, validitas Pilar D didiskon otomatis di perhitungan — jadi ia tidak diam-diam menaikkan keyakinan sistem.',
      '',
      'Data derivatives kadang lewat jalur cadangan kalau jalur utama diblokir. Setiap kali itu terjadi, muncul badge peringatan dan keyakinan otomatis dipotong.',
      '',
      'Kenapa ini diumumkan alih-alih disembunyikan? Karena aplikasi yang menyembunyikan kelemahan datanya biasanya terlihat lebih meyakinkan hari ini, lalu kehilangan kepercayaan secara permanen begitu ketahuan. Angka yang jujur lebih berguna daripada angka yang rapi.'
    ].join('\n')
  },
  {
    id: 'momentum-score',
    judul: 'Membaca Skor Momentum Tanpa Salah Paham',
    pemicu: () => false,
    isi: (s) => {
      const top = s.momentum[0];
      const ket = top ? `Hari ini yang teratas ${top.ticker} dengan skor ${top.score} dan pergerakan ${formatPercent(top.return24h)}.` : '';
      return [
        'Skor momentum di tabel itu bukan peringkat "koin terbaik untuk dibeli". Ia peringkat seberapa kuat pergerakan sebuah koin belakangan, relatif terhadap 100 koin lain di universe yang sama.',
        '',
        'Tiga bahan yang dicampur: return 24 jam (40%), perubahan market cap sebagai proksi aliran modal (30%), dan rasio return terhadap volatilitasnya sendiri (30%). Bahan ketiga itu yang membuat koin yang naik 5% dengan tenang bisa mengalahkan koin yang naik 8% sambil naik-turun liar.',
        ket ? '' : null,
        ket || null,
        '',
        'Yang penting dipahami: momentum adalah pengukuran masa lalu terdekat. Ia sangat berguna untuk memahami di mana perhatian pasar sedang berada, dan sangat buruk sebagai jaminan kelanjutan. Koin dengan momentum tertinggi juga sering yang paling jauh dari harga wajarnya.',
        '',
        'Karena itu di bawah tabel ada pemindaian pola — koin yang naiknya belum diikuti partisipasi luas ditandai, bukan disembunyikan supaya tabelnya terlihat bagus.'
      ].filter(x => x !== null).join('\n');
    }
  },
  {
    id: 'bobot',
    judul: 'Siapa yang Menentukan Bobot Pilar, dan Kenapa Itu Boleh Dipertanyakan',
    pemicu: () => false,
    isi: () => [
      'Price Action 25%, Momentum 20%, Sentimen 15%, On-Chain 20%, Derivatives 20%. Dari mana angka-angka ini?',
      '',
      'Jawaban jujurnya: dari penilaian struktural, bukan dari optimasi backtest. Price Action diberi bobot terbesar karena paling langsung dan paling sulit dimanipulasi. Sentimen terkecil karena paling lambat dan paling sering salah waktu.',
      '',
      'Kenapa bukan dioptimasi lewat backtest saja? Karena bobot yang dioptimasi ke data masa lalu hampir selalu tampil lebih bagus di masa lalu dan lebih buruk di masa depan — masalah klasik bernama overfitting. Bobot yang dipilih berdasarkan alasan struktural lebih tahan banting meski tidak pernah jadi yang terbaik di periode mana pun.',
      '',
      'Konsekuensi yang perlu diterima: bobot ini bisa salah. Karena itu setiap perubahan bobot wajib dicatat di changelog metodologi, supaya siapa pun bisa mengaudit apakah bobot diubah karena alasan yang masuk akal atau karena hasilnya sedang jelek.',
      '',
      'Kamu boleh tidak setuju dengan bobotnya. Yang tidak boleh adalah tidak tahu berapa bobotnya.'
    ].join('\n')
  },
  {
    id: 'diversifikasi-semu',
    judul: 'Delapan Koin, Satu Posisi: Soal Diversifikasi Semu',
    pemicu: (s) => (s.__analytics?.correlation?.rataKorelasi ?? 0) >= 0.8,
    isi: (s) => {
      const c = s.__analytics?.correlation;
      const angka = c?.available ? `Hari ini rata-rata korelasi antar delapan koin teratas ada di ${c.rataKorelasi}` : 'Di pasar kripto angka ini biasanya tinggi';
      const kembar = c?.kembar?.[0] ? ` Contoh paling jelas hari ini: ${c.kembar[0].a} dan ${c.kembar[0].b} berkorelasi ${c.kembar[0].r}.` : '';
      return [
        'Ada satu keyakinan yang mahal harganya di kripto: merasa aman karena memegang banyak koin berbeda.',
        '',
        'Diversifikasi bekerja kalau aset-asetnya bergerak berbeda. Kalau delapan koin naik dan turun bersamaan, memegang kedelapannya secara matematis setara dengan memegang satu posisi berukuran delapan kali lipat — dengan ilusi keamanan sebagai bonus yang justru berbahaya.',
        '',
        `${angka}. Angka 1,0 berarti bergerak identik; 0 berarti tidak berhubungan sama sekali.${kembar}`,
        '',
        'Yang bisa dilakukan dengan informasi ini bukan berhenti membeli altcoin, tapi berhenti menghitung risiko seolah posisi-posisi itu saling menutupi. Total eksposur yang sebenarnya lebih dekat ke penjumlahan semua posisi daripada ke rata-ratanya.',
        '',
        'Catatan: korelasi jangka pendek berubah cepat. Angka ini dihitung ulang tiap hari dari data 7 hari terakhir, bukan diambil dari hafalan.'
      ].join('\n');
    }
  },
  {
    id: 'breadth',
    judul: 'Kenapa "Pasar Hijau" Bisa Menipu',
    pemicu: (s) => {
      const b = s.__analytics?.breadth;
      return !!(b?.available && (b.d24.pctNaik <= 40 || b.d24.pctNaik >= 70));
    },
    isi: (s) => {
      const b = s.__analytics?.breadth;
      const angka = b?.available
        ? `Hari ini ${b.d24.pctNaik}% dari top-100 ditutup naik dalam 24 jam (${b.d24.naik} naik, ${b.d24.turun} turun), dengan median ${b.d24.median >= 0 ? '+' : ''}${b.d24.median.toFixed(2)}%.`
        : '';
      return [
        'Harga BTC naik 2% dan semua orang bilang "pasar hijau". Tapi pertanyaan yang lebih berguna adalah: hijau untuk berapa banyak orang?',
        '',
        'Lebar pasar (breadth) mengukur berapa persen koin yang ikut bergerak naik. Angka ini memisahkan dua kondisi yang terlihat identik di grafik BTC tapi berbeda jauh isinya.',
        '',
        '*Kenaikan berbasis luas* — mayoritas koin ikut naik. Artinya modal baru benar-benar masuk dan menyebar.',
        '',
        '*Kenaikan sempit* — indeks hijau karena beberapa nama besar, sementara sebagian besar koin justru merah. Kenaikan seperti ini secara historis lebih rapuh, karena ia bergantung pada sedikit penopang.',
        '',
        angka,
        '',
        'Kegunaan praktisnya: kalau portofoliomu merah sementara BTC hijau, breadth memberi tahu apakah itu karena pilihanmu keliru atau karena memang mayoritas pasar sedang tertinggal. Dua penjelasan itu menuntut respons yang berbeda.'
      ].filter(Boolean).join('\n');
    }
  },
  {
    id: 'volatilitas-ukuran',
    judul: 'Volatilitas Tidak Mengubah Arah, Tapi Mengubah Ukuran',
    pemicu: (s) => {
      const v = s.__analytics?.volatility;
      return !!(v?.available && v.persentil != null && (v.persentil >= 75 || v.persentil <= 25));
    },
    isi: (s) => {
      const v = s.__analytics?.volatility;
      const angka = v?.available
        ? `Saat ini volatilitas terealisasi 7 hari ada di ${v.vol7 ?? v.vol30}% disetahunkan, persentil ${v.persentil ?? '—'} dari sebulan terakhir — artinya rentang harian BTC yang wajar sekitar ±${v.rentangHarianPct}%.`
        : '';
      return [
        'Satu kesalahan yang sering terjadi: memakai ukuran posisi yang sama di semua kondisi pasar, seolah risiko per dolar selalu tetap.',
        '',
        'Volatilitas terealisasi mengukur seberapa liar harga bergerak belakangan. Ia tidak mengandung informasi arah sama sekali — dan justru itu yang membuatnya berguna, karena ia menjawab pertanyaan berbeda: *seberapa besar pergerakan yang harus dianggap normal*.',
        '',
        angka,
        '',
        'Konsekuensinya langsung. Stop loss yang dipasang lebih rapat dari rentang harian normal akan tersentuh oleh kebisingan biasa, bukan oleh perubahan arah. Dan posisi berukuran sama yang terasa nyaman saat pasar tenang membawa ayunan rupiah yang jauh lebih besar saat volatilitas naik — padahal persentasenya identik.',
        '',
        'Cara memakainya: biarkan jarak titik salah mengikuti volatilitas, lalu sesuaikan ukuran posisi supaya kerugian maksimalnya tetap sama. Yang dijaga konstan adalah rupiah yang dipertaruhkan, bukan ukuran posisinya.',
        '',
        'Kalkulator di tab Alat pada dashboard melakukan aritmetika ini, dan jarak stop-nya terisi otomatis dari volatilitas hari ini.'
      ].filter(Boolean).join('\n');
    }
  },
  {
    id: 'posisi-ramai',
    judul: 'Siapa yang Sedang Salah Posisi',
    pemicu: (s) => {
      const p = s.__analytics?.positioning;
      return !!(p?.available && p.tanda && p.tanda !== 'netral');
    },
    isi: (s) => {
      const p = s.__analytics?.positioning;
      const angka = p?.available && p.ritel != null
        ? `Data hari ini: ${p.ritel.toFixed(1)}% akun ritel berposisi long${p.top != null ? `, sementara top trader ${p.top.toFixed(1)}%` : ''}.`
        : '';
      return [
        'Bursa berjangka mempublikasikan data yang jarang dilihat orang: berapa persen akun yang sedang long versus short, dipisah antara akun ritel dan akun trader terbesar.',
        '',
        'Kenapa ini menarik? Karena pasar berjangka adalah permainan berjumlah nol. Setiap long punya lawan short. Yang menentukan tekanan bukan siapa yang benar, tapi sisi mana yang lebih rapuh saat harga bergerak sedikit ke arah berlawanan.',
        '',
        angka,
        '',
        'Ketika satu sisi sangat ramai, likuidasi di sisi itu menjadi bahan bakar yang mempercepat pergerakan ke arah sebaliknya. Itu sebabnya konsentrasi posisi dibaca sebagai *ukuran risiko*, bukan sebagai suara mayoritas yang patut diikuti.',
        '',
        'Batasnya perlu dinyatakan: ini data satu bursa, dan rasio jumlah akun tidak sama dengan rasio nilai posisi. Seribu akun kecil di satu sisi bisa kalah besar dari sepuluh akun raksasa di sisi lain.'
      ].filter(Boolean).join('\n');
    }
  },
  {
    id: 'rezim',
    judul: 'Sinyal yang Sama Berarti Hal Berbeda di Rezim Berbeda',
    pemicu: () => false,
    isi: (s) => {
      const r = s.__analytics?.regime;
      const angka = r?.available ? `Dashboard hari ini membaca rezimnya sebagai *${r.label}*. ${r.ringkas}` : '';
      return [
        'Sebelum bertanya "arahnya ke mana", ada pertanyaan yang lebih dulu perlu dijawab: kita sedang berada di jenis pasar seperti apa.',
        '',
        'RSI 72 di tengah pasar yang sedang berekspansi dengan partisipasi luas adalah hal biasa — momentum kuat memang menghasilkan angka begitu. RSI 72 yang sama, muncul saat sebagian besar koin justru melemah dan volatilitas di atas kebiasaan, adalah anomali yang jauh lebih layak dicurigai.',
        '',
        'Angkanya identik. Artinya tidak.',
        '',
        angka,
        '',
        'Rezim di dashboard ini dibaca dari empat sumbu: tekanan volatilitas, lebar partisipasi, posisi terhadap puncak bulanan, dan ke mana modal berputar. Semuanya bersifat deskriptif — ia menamai kondisi yang sedang berlangsung, bukan memprediksi kondisi berikutnya.',
        '',
        'Satu hal yang sengaja TIDAK dilakukan: rezim tidak dimasukkan ke dalam perhitungan skor. Menambah variabel ke formula berarti seluruh rekam jejak yang sudah terkumpul tidak lagi sebanding dengan yang baru — dan rekam jejak yang tidak sebanding sama saja dengan tidak punya rekam jejak.'
      ].filter(Boolean).join('\n');
    }
  },
  {
    id: 'dry-powder',
    judul: 'Membaca Likuiditas Lewat Pasokan Stablecoin',
    pemicu: (s) => {
      const d = s.__analytics?.dryPowder;
      return !!(d?.available && d.change30d != null && Math.abs(d.change30d) > 2.5);
    },
    isi: (s) => {
      const d = s.__analytics?.dryPowder;
      const angka = d?.available
        ? `Saat ini total pasokan stablecoin ${formatCompact(d.total)}, ${d.change30d != null ? `${d.change30d >= 0 ? 'tumbuh' : 'menyusut'} ${Math.abs(d.change30d).toFixed(1)}% dalam 30 hari` : 'relatif datar'}.`
        : '';
      return [
        'Sebagian besar indikator kripto mengukur harga. Yang jauh lebih jarang diperhatikan adalah berapa banyak uang yang sedang berdiri di pinggir lapangan.',
        '',
        'Stablecoin adalah bentuk uang itu. Ketika seseorang memindahkan dana dari bank ke ekosistem kripto, jalurnya hampir selalu lewat stablecoin lebih dulu. Karena itu total pasokannya berfungsi sebagai proksi kasar untuk modal yang sudah masuk tapi belum dibelanjakan.',
        '',
        angka,
        '',
        'Pasokan yang tumbuh berarti amunisi bertambah. Pasokan yang menyusut berarti modal benar-benar ditarik keluar dari ekosistem, bukan sekadar berpindah antar aset di dalamnya — sinyal yang bergerak lambat tapi jarang berbohong.',
        '',
        'Yang tidak boleh disimpulkan: bahwa uang yang sudah ada akan otomatis masuk ke pasar. Stablecoin juga dipakai untuk menunggu tanpa batas waktu. Pertumbuhan pasokan menaikkan kapasitas, bukan kepastian.'
      ].filter(Boolean).join('\n');
    }
  }
];

/**
 * @param {object} state
 * @param {number} [paksaIndex] untuk tombol "ganti materi"
 */
export function buildEdukasi(state, paksaIndex){
  let topik;

  if (paksaIndex != null){
    topik = PUSTAKA_EDUKASI[((paksaIndex % PUSTAKA_EDUKASI.length) + PUSTAKA_EDUKASI.length) % PUSTAKA_EDUKASI.length];
  } else {
    // Prioritas 1: topik yang dipicu kondisi pasar hari ini (paling relevan
    // untuk dibaca member karena contohnya sedang terjadi di layar).
    const terpicu = PUSTAKA_EDUKASI.filter(t => {
      try{ return t.pemicu(state); }catch(e){ return false; }
    });
    if (terpicu.length){
      topik = terpicu[dayIndex() % terpicu.length];
    } else {
      const rotasi = PUSTAKA_EDUKASI.filter(t => {
        try{ return t.pemicu(state) === false; }catch(e){ return true; }
      });
      topik = rotasi[dayIndex() % rotasi.length];
    }
  }

  const L = [];
  L.push(`📚 *EDUKASI HARIAN*`);
  L.push(`${topik.judul}`);
  L.push(THIN);
  L.push('');
  L.push(topik.isi(state));
  L.push('');
  L.push('Ada yang mau ditanyakan soal ini? Tulis di bawah.');
  L.push('');
  L.push(DISCLAIMER);
  return L.join('\n');
}

export function jumlahTopikEdukasi(){ return PUSTAKA_EDUKASI.length; }

/* ============================================================
   FORMAT 6 — QUIZ HARIAN
   Dibangun dari angka yang BENAR-BENAR tampil hari ini, jadi member
   yang membaca brief pagi punya keuntungan menjawab. Itu disengaja —
   quiz adalah insentif supaya brief-nya dibaca, bukan sekadar hiburan.
   ============================================================ */
function acakOpsi(benar, salah, seed){
  const semua = [benar, ...salah];
  // Rotasi deterministik berdasarkan seed — posisi jawaban benar berpindah
  // tiap hari supaya tidak ketahuan polanya, tapi tetap bisa direproduksi.
  const geser = seed % semua.length;
  const hasil = semua.slice(geser).concat(semua.slice(0, geser));
  return { opsi: hasil, indexBenar: hasil.indexOf(benar) };
}

function bankQuiz(state){
  const { btc, fg, rsi1h, deriv, momentum, __classification: cls, __confidence: conf, __wccsResult: w } = state;
  const bank = [];

  if (rsi1h != null){
    bank.push({
      tanya: `RSI 1 jam BTC di dashboard hari ini ${rsi1h}. Apa arti angka ini yang paling tepat?`,
      benar: 'Momentum kenaikan mendominasi penurunan dalam 14 periode terakhir',
      salah: [
        'Harga BTC sudah kemahalan dan akan segera turun',
        'Volume perdagangan BTC sedang di atas rata-rata',
        'Ada 14% pelaku pasar yang sedang membeli'
      ],
      jelas: `RSI mengukur kecepatan dan besar perubahan harga, bukan kewajaran harga. Angka ${rsi1h} (${labelRSI(rsi1h)}) mendeskripsikan momentum, bukan vonis mahal/murah, dan tidak mengandung informasi volume sama sekali.`
    });
  }

  bank.push({
    tanya: `Fear & Greed hari ini ${fg.value} (${fgClassify(fg.value)}). Dalam kerangka WCCS, berapa bobot pilar sentimen?`,
    benar: '15% — bobot terkecil dari lima pilar',
    salah: ['40% — bobot terbesar karena sentimen menggerakkan pasar', '25% — sama besar dengan Price Action', '0% — sentimen hanya overlay, tidak masuk skor'],
    jelas: 'Sentimen diberi bobot 15%, terkecil dari lima pilar, karena ia paling lambat dan paling sering salah waktu. Yang benar-benar tidak masuk skor adalah Radar Konteks (TVL & berita), bukan sentimen.'
  });

  if (deriv){
    bank.push({
      tanya: `Funding rate BTC hari ini ${formatFundingRate(deriv.rate)}. Kalau funding positif tinggi, apa artinya?`,
      benar: 'Pemegang posisi long membayar biaya ke short — posisi long sedang ramai',
      salah: [
        'Pemegang posisi short membayar ke long — posisi short sedang ramai',
        'Exchange sedang menaikkan biaya transaksi spot',
        'Harga futures sedang lebih murah daripada harga spot'
      ],
      jelas: 'Funding positif = long bayar short, mekanisme yang menarik harga perpetual kembali ke spot. Makin ramai satu sisi, makin besar risiko likuidasi beruntun kalau harga berbalik — itu sebabnya Pilar E dibaca sebagai sinyal risiko, bukan konfirmasi arah.'
    });
  }

  bank.push({
    tanya: `Status confluence hari ini "${cls.label}" dengan keyakinan ${conf}%. Angka keyakinan itu paling utama dipengaruhi oleh apa?`,
    benar: 'Seberapa sepakat kelima pilar satu sama lain',
    salah: [
      'Seberapa besar skor WCCS-nya, makin besar makin yakin',
      'Berapa lama dashboard sudah dipakai',
      'Jumlah koin yang naik di tabel momentum'
    ],
    jelas: 'Confidence dibangun dari Agreement (kesepakatan antar pilar), Data Quality, dan Sample Adequacy. Skor besar tapi pilar saling bertentangan justru menghasilkan keyakinan rendah — itu memang perilaku yang diinginkan.'
  });

  const pilarTerkuat = Object.entries(state.__wccsResult.pillars)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  bank.push({
    tanya: `Pilar dengan kontribusi absolut terbesar hari ini adalah ${PILLAR_NAMES[pilarTerkuat[0]]} (${plusMinus(pilarTerkuat[1], 2)}). Apa yang TIDAK boleh disimpulkan dari fakta ini?`,
    benar: 'Bahwa pilar ini adalah indikator paling akurat dan pilar lain boleh diabaikan',
    salah: [
      'Bahwa pilar ini paling banyak menggerakkan skor hari ini',
      'Bahwa kalau pilar ini berbalik, klasifikasi kemungkinan berubah',
      'Bahwa pilar ini layak dipantau lebih ketat dari yang lain'
    ],
    jelas: 'Kontribusi terbesar hari ini hanya berarti komponen itu paling menyimpang dari kebiasaannya hari ini — bukan bahwa ia indikator yang lebih akurat secara umum. Besok bisa pilar lain yang dominan.'
  });

  if (momentum && momentum.length >= 3){
    bank.push({
      tanya: `${momentum[0].ticker} ada di puncak tabel momentum hari ini dengan skor ${momentum[0].score}. Apa arti skor momentum itu sebenarnya?`,
      benar: 'Kekuatan pergerakan belakangan relatif terhadap 100 koin lain di universe yang sama',
      salah: [
        'Peringkat koin terbaik untuk dibeli hari ini',
        'Perkiraan kenaikan harga dalam 24 jam ke depan',
        'Persentase kemungkinan koin ini naik'
      ],
      jelas: 'Skor momentum mencampur return 24 jam (40%), perubahan market cap (30%), dan rasio return terhadap volatilitasnya sendiri (30%). Semuanya pengukuran masa lalu terdekat — berguna untuk melihat ke mana perhatian pasar bergerak, bukan jaminan kelanjutan.'
    });
  }

  bank.push({
    tanya: 'Brier score sebuah sistem sinyal bernilai 0.12. Apa artinya?',
    benar: 'Tingkat keyakinan yang diklaim sistem cukup terkalibrasi dengan hasil sebenarnya',
    salah: [
      'Sistem itu benar 12% dari waktu',
      'Sistem itu salah 12% dari waktu',
      'Sistem itu sudah dievaluasi sebanyak 12 kali'
    ],
    jelas: 'Brier score mengukur kalibrasi, bukan akurasi. Nol = sempurna, satu = terburuk. Sistem yang bilang "yakin 90%" tapi benar cuma separuh waktu akan dihukum berat di metrik ini, meskipun hit rate-nya terlihat lumayan.'
  });

  bank.push({
    tanya: `BTC bergerak ${formatPercent(btc.change)} hari ini. Kenapa angka mentah ini diubah jadi z-score sebelum masuk perhitungan?`,
    benar: 'Supaya komponen dengan satuan berbeda bisa dibandingkan dalam skala yang adil',
    salah: [
      'Supaya angkanya terlihat lebih kecil dan tidak menakutkan',
      'Supaya perhitungannya lebih cepat diproses browser',
      'Supaya hasilnya selalu berada di antara 0 dan 100'
    ],
    jelas: 'Tanpa normalisasi, komponen yang satuannya besar (misal netflow dalam dolar) akan otomatis mendominasi komponen yang satuannya kecil (misal funding rate dalam basis poin), hanya karena besaran angkanya — bukan karena lebih penting.'
  });


  const an = state.__analytics || {};

  if (an.breadth?.available){
    bank.push({
      tanya: `Hari ini ${an.breadth.d24.pctNaik}% dari top-100 ditutup naik. Angka "lebar pasar" ini paling berguna untuk menjawab apa?`,
      benar: 'Apakah kenaikan melibatkan banyak koin atau hanya ditopang beberapa nama',
      salah: [
        'Berapa persen kemungkinan pasar naik besok',
        'Koin mana yang paling menguntungkan untuk dibeli',
        'Seberapa besar volume perdagangan hari ini'
      ],
      jelas: 'Breadth mengukur partisipasi, bukan arah masa depan. Indeks yang hijau karena tiga koin besar berbeda secara struktural dari indeks yang hijau karena delapan puluh koin ikut naik — yang pertama lebih rapuh karena bertumpu pada sedikit penopang.'
    });
  }

  if (an.correlation?.available){
    bank.push({
      tanya: `Rata-rata korelasi antar delapan koin teratas hari ini ${an.correlation.rataKorelasi}. Apa konsekuensi praktisnya untuk seseorang yang memegang kedelapannya?`,
      benar: 'Risikonya mendekati satu posisi besar, bukan delapan posisi yang saling menutupi',
      salah: [
        'Risikonya terbagi rata jadi seperdelapan',
        'Kedelapan koin itu akan memberi keuntungan yang sama',
        'Korelasi tinggi menjamin kedelapannya bergerak naik bersama'
      ],
      jelas: 'Diversifikasi hanya bekerja kalau aset bergerak berbeda. Korelasi tinggi berarti kedelapannya naik dan turun bersamaan, sehingga total eksposur lebih dekat ke penjumlahan semua posisi daripada ke rata-ratanya.'
    });
  }

  if (an.volatility?.available && an.volatility.persentil != null){
    bank.push({
      tanya: `Volatilitas terealisasi 7 hari ada di persentil ${an.volatility.persentil} dari sebulan terakhir. Apa yang bisa disimpulkan dari angka ini?`,
      benar: 'Seberapa liar pergerakan belakangan dibanding kebiasaannya sendiri — tanpa informasi arah',
      salah: [
        'Arah pasar dalam seminggu ke depan',
        `Kemungkinan ${an.volatility.persentil}% bahwa harga akan naik`,
        'Bahwa harga sedang terlalu mahal'
      ],
      jelas: 'Volatilitas terealisasi sepenuhnya deskriptif dan sama sekali tidak mengandung arah. Kegunaannya ada pada ukuran posisi dan jarak stop, bukan pada keputusan arah.'
    });
  }

  if (an.regime?.available){
    bank.push({
      tanya: `Dashboard membaca rezim pasar hari ini sebagai "${an.regime.label}". Apa peran label rezim dalam perhitungan WCCS?`,
      benar: 'Tidak berperan sama sekali — rezim adalah lensa untuk membaca skor, bukan bahan skor',
      salah: [
        'Menjadi pilar keenam dengan bobot 10%',
        'Mengalikan skor akhir sesuai arah rezim',
        'Menggantikan pilar sentimen saat rezim ekstrem'
      ],
      jelas: 'Bobot lima pilar tetap 25/20/15/20/20 seperti versi awal. Menambahkan variabel ke formula akan membuat seluruh rekam jejak lama tidak sebanding dengan yang baru — dan rekam jejak yang tidak sebanding sama saja dengan tidak punya rekam jejak.'
    });
  }

  if (an.positioning?.available && an.positioning.ritel != null){
    bank.push({
      tanya: `${an.positioning.ritel.toFixed(0)}% akun ritel sedang berposisi long. Bagaimana informasi ini sebaiknya dibaca?`,
      benar: 'Sebagai ukuran di mana bahan bakar likuidasi menumpuk, bukan sebagai suara mayoritas',
      salah: [
        'Sebagai konfirmasi bahwa arah naik lebih mungkin terjadi',
        'Sebagai jumlah uang yang sedang bertaruh naik',
        'Sebagai persentase koin yang sedang naik'
      ],
      jelas: 'Pasar berjangka berjumlah nol — setiap long punya lawan short. Sisi yang ramai adalah sisi yang paling murah untuk dilikuidasi kalau harga bergerak berlawanan. Perlu dicatat juga: rasio jumlah akun tidak sama dengan rasio nilai posisi.'
    });
  }

  if (an.levels?.available && an.levels.resistance[0]){
    bank.push({
      tanya: `Dashboard mendeteksi resistance di ${formatCurrency(an.levels.resistance[0].harga)} yang sudah ${an.levels.resistance[0].sentuhan}× teruji. Apa arti angka "teruji" itu?`,
      benar: 'Berapa kali harga pernah berbalik di zona itu dalam 30 hari terakhir',
      salah: [
        'Berapa persen kemungkinan harga tertahan di situ',
        'Berapa banyak order jual yang menumpuk di harga itu',
        'Berapa kali level itu sudah ditembus'
      ],
      jelas: 'Level di dashboard ini murni deskriptif: titik pivot tempat harga pernah berbalik, dikelompokkan dan diurutkan berdasarkan jumlah sentuhan. Ia mencatat sejarah, bukan memperkirakan kemungkinan.'
    });
  }

  return bank;
}

export function buildQuiz(state, paksaIndex){
  const bank = bankQuiz(state);
  if (!bank.length){
    return '📝 Data hari ini belum cukup untuk menyusun quiz yang berbasis angka riil.\n\n' + DISCLAIMER;
  }
  const idx = paksaIndex != null
    ? (((dayIndex() + paksaIndex) % bank.length) + bank.length) % bank.length
    : dayIndex() % bank.length;
  const q = bank[idx];
  const { opsi, indexBenar } = acakOpsi(q.benar, q.salah, dayIndex() + idx);
  const huruf = ['A', 'B', 'C', 'D'];

  const L = [];
  L.push('🧠 *QUIZ HARIAN ArgonPulse*');
  L.push(`${tanggalPendek()}`);
  L.push(THIN);
  L.push('');
  L.push(q.tanya);
  L.push('');
  opsi.forEach((o, i) => L.push(`${huruf[i]}. ${o}`));
  L.push('');
  L.push('Jawab di kolom komentar. Kunci jawaban diposting nanti sore 👇');
  L.push('');
  L.push('┅┅┅┅ KUNCI (jangan ikut di-paste) ┅┅┅┅');
  L.push(`Jawaban: ${huruf[indexBenar]} — ${q.benar}`);
  L.push('');
  L.push(`Penjelasan: ${q.jelas}`);
  L.push('┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅');
  L.push('');
  L.push('Catatan: quiz ini menguji pemahaman konsep, bukan kemampuan menebak arah pasar.');
  L.push('');
  L.push(DISCLAIMER);
  return L.join('\n');
}

export function jumlahQuiz(state){ return bankQuiz(state).length; }

/* ============================================================
   FORMAT 7 — POLL HARIAN
   Poll bukan tebak-tebakan harga. Dirancang untuk memancing member
   menyatakan *alasan*, bukan arah — itu yang memicu diskusi bermutu.
   ============================================================ */
function bankPoll(state){
  const { fg, __classification: cls, momentum, deriv } = state;

  const bank = [
    {
      t: `Dashboard hari ini bilang ${cls.label}. Dari lima pilar, mana yang menurut kamu paling layak dipercaya untuk kondisi pasar sekarang?`,
      o: ['Price Action — paling langsung', 'Momentum Teknikal', 'Sentimen (Fear & Greed)', 'Aliran On-Chain', 'Derivatives & funding']
    },
    {
      t: `Fear & Greed di ${fg.value} (${fgClassify(fg.value)}). Menurut kamu, sentimen ekstrem itu lebih sering jadi apa?`,
      o: ['Tanda arah akan berbalik', 'Konfirmasi tren sedang berjalan', 'Tidak berarti apa-apa sendirian', 'Tergantung pilar lain']
    },
    {
      t: 'Kalau sebuah sistem sinyal hit rate-nya 55%, menurut kamu itu:',
      o: ['Jelek, di bawah 70% tidak layak dipakai', 'Wajar, yang penting manajemen risikonya', 'Bagus, asal konsisten dan terukur', 'Belum bisa dinilai tanpa ukuran sampel']
    },
    {
      t: `Rutinitas kamu tiap pagi sebelum lihat chart, yang mana paling dekat?`,
      o: ['Cek berita dulu', 'Cek Fear & Greed / sentimen', 'Langsung buka chart', 'Cek posisi & risiko sendiri dulu', 'Tidak ada rutinitas tetap']
    },
    {
      t: `${momentum && momentum[0] ? momentum[0].ticker : 'Koin teratas'} lagi di puncak momentum. Kamu biasanya bagaimana menanggapi koin yang lagi ramai?`,
      o: ['Ikut karena momentum cenderung berlanjut', 'Justru menghindar karena sudah jauh naik', 'Tunggu koreksi dulu', 'Abaikan, fokus rencana sendiri']
    },
    {
      t: 'Materi edukasi apa yang paling kamu butuhkan di grup ini minggu depan?',
      o: ['Baca indikator teknikal', 'Manajemen risiko & ukuran posisi', 'Cara baca data on-chain', 'Derivatives, funding & likuidasi', 'Psikologi & disiplin']
    }
  ];

  if (deriv){
    bank.push({
      t: `Funding rate BTC hari ini ${formatFundingRate(deriv.rate)}. Menurut kamu funding ekstrem itu sinyal apa?`,
      o: ['Konfirmasi tren makin kuat', 'Peringatan risiko squeeze', 'Sekadar biaya, bukan sinyal', 'Belum paham, mau dijelaskan']
    });
  }

  return bank;
}

export function buildPoll(state, paksaIndex){
  const bank = bankPoll(state);
  const idx = paksaIndex != null
    ? (((dayIndex() + paksaIndex) % bank.length) + bank.length) % bank.length
    : dayIndex() % bank.length;
  const p = bank[idx];

  const L = [];
  L.push('📊 *POLL HARI INI*');
  L.push('');
  L.push(p.t);
  L.push('');
  p.o.forEach(o => L.push(`• ${o}`));
  L.push('');
  L.push('Pilih, lalu tulis alasannya di komentar — alasannya yang bikin diskusinya jalan.');
  L.push('');
  L.push(DISCLAIMER);
  return L.join('\n');
}

export function jumlahPoll(state){ return bankPoll(state).length; }

/* ============================================================
   FORMAT 8 — SCORECARD MINGGUAN
   Dihitung dari Historical Ledger nyata, bukan dikarang. Kalau datanya
   belum cukup, format ini mengatakannya dengan jelas — itu justru
   bahan konten yang bagus soal kejujuran statistik.
   ============================================================ */
export function buildWeeklyScorecard(state){
  const semua = getLedgerRaw();
  const batas = Date.now() - 7 * 86_400_000;
  const mingguIni = semua.filter(e => e.recordedAt >= batas);
  const terevaluasi = mingguIni.filter(e => e.evaluated && e.outcome && e.outcome.correct !== null);

  const L = [];
  L.push('🗓 *SCORECARD MINGGUAN ArgonPulse*');
  L.push(`Periode 7 hari terakhir · per ${tanggalPendek()}`);
  L.push(RULE);
  L.push('');

  if (mingguIni.length === 0){
    L.push('Belum ada sinyal tercatat di perangkat ini dalam 7 hari terakhir, jadi tidak ada yang bisa dilaporkan.');
    L.push('');
    L.push('Catatan: rekam jejak di dashboard ini bersifat personal per-perangkat (tersimpan di browser admin), bukan agregat dari semua pengguna. Kalau dashboard jarang dibuka, ledger-nya juga ikut kosong.');
    L.push('');
    L.push(DISCLAIMER);
    return L.join('\n');
  }

  // Distribusi klasifikasi minggu ini
  const hitung = {};
  mingguIni.forEach(e => { hitung[e.classification] = (hitung[e.classification] || 0) + 1; });
  const urut = Object.entries(hitung).sort((a, b) => b[1] - a[1]);
  const total = mingguIni.length;

  L.push('📈 SUASANA SEPEKAN');
  urut.forEach(([label, n]) => {
    const pct = Math.round((n / total) * 100);
    const bar = '█'.repeat(Math.max(1, Math.round(pct / 7)));
    L.push(`${label}`);
    L.push(`  ${bar} ${pct}%  (${n}/${total} pembacaan)`);
  });
  L.push('');

  const wccsList = mingguIni.map(e => e.wccs);
  const rata = wccsList.reduce((a, b) => a + b, 0) / wccsList.length;
  const tertinggi = Math.max(...wccsList);
  const terendah = Math.min(...wccsList);
  L.push(`WCCS rata-rata ${plusMinus(rata, 2)} · rentang ${plusMinus(terendah, 2)} s/d ${plusMinus(tertinggi, 2)}`);
  const ayun = tertinggi - terendah;
  L.push(ayun > 1.5
    ? 'Interpretasi: rentang selebar ini menunjukkan pekan yang berubah-ubah — pembacaan pagi dan malam bisa berbeda arah.'
    : 'Interpretasi: rentang yang relatif sempit — kondisi pekan ini cenderung stabil, tidak banyak pergantian arah.');
  L.push('');

  L.push('🎯 AKURASI YANG SUDAH TERUJI');
  if (terevaluasi.length >= 5){
    const benar = terevaluasi.filter(e => e.outcome.correct).length;
    const hit = Math.round((benar / terevaluasi.length) * 100);
    const brier = terevaluasi.reduce((s, e) => s + ((e.confidence / 100) - (e.outcome.correct ? 1 : 0)) ** 2, 0) / terevaluasi.length;
    L.push(`Hit rate ${hit}% dari ${terevaluasi.length} sinyal yang sudah lewat 24 jam`);
    L.push(`Brier score ${brier.toFixed(3)} (0 = kalibrasi sempurna, 1 = terburuk)`);
    L.push('');
    if (hit >= 55){
      L.push('Catatan: angka di atas 50% itu wajar dirayakan seperlunya, bukan dijadikan bukti sistem ini unggul. Ukuran sampel sekecil ini masih sangat mungkin dipengaruhi keberuntungan.');
    } else {
      L.push('Catatan: pekan ini akurasinya di bawah lemparan koin. Angka itu tetap ditampilkan apa adanya — sistem yang cuma menampilkan pekan bagusnya sendiri tidak layak dipercaya di pekan mana pun.');
    }
  } else {
    L.push(`Baru ${terevaluasi.length} sinyal yang sudah lewat masa evaluasi 24 jam — di bawah ambang minimum 5.`);
    L.push('');
    L.push('Catatan: menghitung persentase dari sampel sekecil ini akan menghasilkan angka yang terlihat meyakinkan tapi tidak berarti apa-apa secara statistik. Jadi belum ditampilkan.');
  }
  L.push('');

  const tr = state.__trackRecord;
  if (tr && tr.ready){
    L.push(`📊 Kumulatif sepanjang waktu: hit rate ${tr.hitRate}% dari ${tr.sampleSize} evaluasi.`);
    L.push('');
  }

  L.push('🔮 PEKAN DEPAN');
  L.push(`Kondisi terakhir: ${state.__classification.label} dengan keyakinan ${state.__confidence}%.`);
  L.push(`Yang perlu dipantau: ${potongKalimat(bersih(state.__narrative.invalidation), 200)}`);
  L.push('');
  L.push(RULE);
  L.push(DISCLAIMER);
  return L.join('\n');
}


/* ============================================================
   FORMAT 9 — LAPORAN STRUKTUR PASAR (v2.3)
   Postingan mingguan/tengah pekan yang membahas KERANGKA pasar, bukan
   arah harian: rezim, lebar partisipasi, rotasi modal, korelasi,
   volatilitas, dan level. Ini format yang paling membedakan grup yang
   membahas data dari grup yang membahas perasaan.
   ============================================================ */
export function buildStrukturPasar(state){
  const a = A(state);
  const L = [];

  L.push('📐 *LAPORAN STRUKTUR PASAR*');
  L.push(`${tanggalPendek()} · ${jamWIB()}`);
  L.push(RULE);
  L.push('');

  if (!a.regime && !a.breadth){
    L.push('Data analitik struktur belum terkumpul pada pengambilan ini. Buka dashboard setelah semua sumber selesai memuat, lalu bangun ulang laporan ini.');
    L.push('');
    L.push(DISCLAIMER);
    return L.join('\n');
  }

  if (a.regime?.available){
    L.push(`🧭 REZIM: ${a.regime.label}`);
    L.push(a.regime.ringkas);
    L.push('');
    L.push('Faktor pembentuknya:');
    a.regime.faktor.forEach(f => L.push(`• ${f.nama} — ${f.nilai} (${f.arah}): ${f.catatan}`));
    L.push('');
    L.push(`Implikasi membaca: ${a.regime.implikasi}`);
    L.push('');
    L.push(THIN);
    L.push('');
  }

  if (a.breadth?.available){
    const b = a.breadth;
    L.push('📊 LEBAR PASAR');
    L.push(`24 jam  ${b.d24.pctNaik}% naik (${b.d24.naik}↑/${b.d24.turun}↓) · median ${b.d24.median >= 0 ? '+' : ''}${b.d24.median.toFixed(2)}%`);
    if (b.d7) L.push(`7 hari  ${b.d7.pctNaik}% naik · median ${b.d7.median >= 0 ? '+' : ''}${b.d7.median.toFixed(2)}%`);
    if (b.d30) L.push(`30 hari ${b.d30.pctNaik}% naik · median ${b.d30.median >= 0 ? '+' : ''}${b.d30.median.toFixed(2)}%`);
    L.push('');
    L.push(b.tafsir);
    L.push('');
  }

  if (a.altseason?.available){
    L.push('🔄 ROTASI MODAL');
    L.push(`Indeks altseason ${a.altseason.indeks}/100 — ${a.altseason.label}`);
    if (a.altseason.btcDominance != null) L.push(`Dominansi BTC ${a.altseason.btcDominance.toFixed(1)}%`);
    if (a.altseason.pemimpin?.length){
      L.push(`Paling unggul atas BTC (30 hari): ${a.altseason.pemimpin.slice(0, 3).map(p => `${p.ticker} +${p.lebih.toFixed(0)}pt`).join(' · ')}`);
    }
    L.push('');
    L.push(a.altseason.tafsir);
    L.push('');
  }

  if (a.correlation?.available){
    L.push('🔗 KORELASI & DIVERSIFIKASI');
    L.push(`Rata-rata korelasi antar ${a.correlation.tickers.length} koin teratas: ${a.correlation.rataKorelasi}`);
    if (a.correlation.kembar.length){
      L.push('Pasangan yang praktis satu posisi:');
      a.correlation.kembar.slice(0, 3).forEach(k => L.push(`• ${k.a} & ${k.b} — ${k.r}`));
    } else {
      L.push('Tidak ada pasangan dengan korelasi di atas 0,85 — masih ada perbedaan perilaku antar aset.');
    }
    L.push('');
    L.push(a.correlation.tafsir);
    L.push('');
  }

  if (a.volatility?.available || a.drawdown?.available || a.levels?.available){
    L.push(THIN);
    L.push('');
    L.push('🛡 UKURAN RISIKO');
    if (a.volatility?.available){
      L.push(`Volatilitas 7 hari ${a.volatility.vol7 ?? a.volatility.vol30}% disetahunkan — ${a.volatility.label}${a.volatility.persentil != null ? `, persentil ${a.volatility.persentil}` : ''}`);
      L.push(`Rentang harian BTC yang wajar: ±${a.volatility.rentangHarianPct}% (sekitar ${formatCompact(a.volatility.rentangHarianUsd)})`);
    }
    if (a.drawdown?.available){
      L.push(`Jarak dari puncak 30 hari ${a.drawdown.sekarang.toFixed(1)}% · terdalam sebulan ${a.drawdown.terdalam.toFixed(1)}%`);
    }
    if (a.levels?.available){
      const r = a.levels.resistance[0], sp = a.levels.support[0];
      if (r) L.push(`Resistance terdekat ${formatCurrency(r.harga)} (${r.jarakPct >= 0 ? '+' : ''}${r.jarakPct.toFixed(1)}%, ${r.sentuhan}× teruji)`);
      if (sp) L.push(`Support terdekat ${formatCurrency(sp.harga)} (${sp.jarakPct.toFixed(1)}%, ${sp.sentuhan}× teruji)`);
    }
    L.push('');
    if (a.volatility?.available) L.push(a.volatility.tafsir);
    L.push('');
  }

  if (a.positioning?.available){
    L.push('⚖️ POSISI LEVERAGE');
    L.push(a.positioning.tafsir);
    L.push('');
  }

  if (a.dryPowder?.available){
    L.push('💧 LIKUIDITAS');
    L.push(a.dryPowder.tafsir);
    L.push('');
  }

  if (a.sessions?.available && a.sessions.tafsir){
    L.push('🕒 POLA SESI');
    L.push(a.sessions.tafsir);
    L.push('');
  }

  L.push(THIN);
  L.push('');
  L.push('Catatan metodologis: seluruh angka di atas adalah lapisan pembacaan, BUKAN bagian dari skor confluence. Bobot lima pilar tetap sama seperti sejak awal — menambah variabel ke dalam formula akan membuat rekam jejak lama tidak lagi sebanding dengan yang baru.');
  L.push('');

  const notes = catatanKejujuran(state);
  if (notes.length){
    L.push('⚠️ CATATAN KEJUJURAN DATA');
    notes.forEach(n => L.push(`• ${n}`));
    L.push('');
  }

  L.push(RULE);
  L.push(DISCLAIMER);
  return L.join('\n');
}

/* ============================================================
   FORMAT 10 — RENCANA KONTEN HARI INI (v2.4)
   Bukan teks untuk diposting — rencana kerja untuk ADMIN. Menjawab
   pertanyaan "hari ini aku harus posting apa, jam berapa" dari data
   yang sudah ada: jam pergerakan terbesar (heatmap sesi), materi edukasi
   adaptif hari ini, dan status delta untuk posting malam. Rekomendasi
   jam posting berbasis pola 30 hari — sampel pendek, bukan janji.
   ============================================================ */
export function buildRencanaKonten(state){
  const a = A(state);
  const L = [];

  L.push('🗓 *RENCANA KONTEN HARI INI*');
  L.push(`${tanggalPendek()} — disusun dari data dashboard, bukan tebakan`);
  L.push(RULE);
  L.push('');

  // Jam posting disarankan: sesi dengan pergerakan bersih terbesar 30 hari.
  let jamTerbaik = null;
  if (a.sessions?.available && Array.isArray(a.sessions.sesi) && a.sessions.sesi.length){
    const kuat = [...a.sessions.sesi].sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0];
    if (kuat) jamTerbaik = { label: kuat.label, jam: kuat.jamWib, nilai: kuat.value };
  }

  L.push('*PAGI — posting utama*');
  L.push('• Brief Lengkap (Telegram) + PNG screenshot');
  L.push('• Caption pendek kalau target WhatsApp');
  if (jamTerbaik){
    L.push(`• Jam paling aktif 30 hari terakhir: sesi ${jamTerbaik.label} (${jamTerbaik.jam}). Kalau bisa, posting brief sesaat SEBELUM sesi itu mulai — bukan sesudah pergerakannya lewat.`);
  }
  L.push('');

  L.push('*SIANG — edukasi*');
  try{
    const edu = buildEdukasi(state, null);
    const judul = edu.split('\n').find(x => x.trim() && !x.includes('*') && !x.includes('━')) || '';
    if (judul) L.push(`• Materi hari ini: "${judul.trim()}" — sudah otomatis dipilih karena relevan dengan kondisi sekarang`);
    else L.push('• Materi edukasi adaptif (lihat tab Edukasi di Brief Studio)');
  }catch(e){
    L.push('• Materi edukasi adaptif (lihat tab Edukasi di Brief Studio)');
  }
  L.push('');

  L.push('*SORE — pemancing interaksi*');
  L.push('• Quiz dibangun dari angka riil hari ini — member yang baca brief punya keuntungan menjawab');
  L.push('• Poll untuk memancing diskusi cara berpikir');
  L.push('');

  L.push('*MALAM — update*');
  const d = state.__delta;
  if (d && d.classificationChanged){
    L.push(`• WAJIB update intraday: klasifikasi berganti dari "${d.previousClassification}" ke "${state.__classification?.label}" — pembaca pagi perlu tahu.`);
  } else if (d && Math.abs(d.wccsDelta) >= 0.4){
    L.push(`• Update intraday disarankan: skor bergerak ${d.wccsDelta >= 0 ? '+' : ''}${d.wccsDelta.toFixed(2)} sejak brief pagi.`);
  } else {
    L.push('• Belum ada perubahan yang layak dibahas — tab Update Intraday akan memberi tahu kalau malam ini ada yang bergerak penting.');
  }
  L.push('');

  L.push('*PEKAN INI*');
  const hariWib = new Date(new Date().getTime() + 7 * 3600_000).getUTCDay(); // 0=Minggu
  L.push(hariWib === 0 || hariWib === 6
    ? '• Scorecard 7 hari cocok diposting hari ini (akhir pekan) — termasuk pekan yang jelek, apa adanya.'
    : '• Scorecard 7 hari: simpan untuk akhir pekan. Struktur Pasar cocok Selasa/Kamis.');
  L.push('');

  // Catatan kondisi yang memengaruhi rencana
  const catatan = [];
  const alarmBaru = getAlerts().filter(x => !x.ack);
  if (alarmBaru.length){
    catatan.push(`${alarmBaru.length} alarm Menara Pengawas belum dibaca — cek panelnya sebelum menyusun brief, biar tidak menulis di atas kondisi yang sudah bergeser.`);
  }
  const berita = (state.__newsHits || []).slice(0, 3);
  if (berita.length){
    catatan.push(`Berita hari ini menyentuh topik berdampak: ${berita.map(b => b.topik).join(', ')}. Pertimbangkan menyebutnya di brief kalau relevan.`);
  }
  catatanKejujuran(state).forEach(n => catatan.push(n));
  catatan.forEach(n => L.push(`⚠️ ${n}`));

  L.push('');
  L.push(THIN);
  L.push('Rencana ini alat bantu susun kerja, bukan kontrak. Kalau pasar berbalik di tengah hari, rencananya yang menyesuaikan — bukan sebaliknya.');
  L.push(DISCLAIMER);
  return L.join('\n');
}

/* ============================================================
   FORMAT 11 — LAPORAN PENGAWAS (v2.4)
   Rekap Menara Pengawas dalam bentuk teks: status delapan aturan,
   alarm yang belum dibaca, alarm harga aktif, dan berita berdampak.
   Berguna untuk admin kedua/co-admin: sekali tempel, dia tahu apa yang
   dijaga malam ini tanpa membuka dashboard.
   ============================================================ */
export function buildPengawas(state){
  const L = [];
  L.push('🗼 *LAPORAN PENGAWAS*');
  L.push(jamWIB() + ' · ' + tanggalPendek());
  L.push(RULE);
  L.push('');

  const alerts = getAlerts();
  const belumBaca = alerts.filter(x => !x.ack);
  L.push(`Status: ${alerts.length} alarm total · ${belumBaca.length} belum dibaca`);
  L.push('');

  L.push('*Kondisi terhadap ambang sekarang:*');
  const rsi = state.rsi1h;
  const crowded = state.__wccsResult?.components?.find(c => c.key === 'E1_funding_rate')?.isCrowded;
  const alt = state.__analytics?.altseason?.available ? state.__analytics.altseason.indeks : null;
  const baris = [
    `• Kategori skor: ${state.__classification?.label || '—'} (alarm saat berganti)`,
    `• Funding: ${crowded ? 'MASUK zona crowding' : 'normal'} (alarm saat masuk/keluar)`,
    `• RSI 1 jam: ${rsi != null ? rsi.toFixed(1) : '—'} (alarm seberang 70/30)`,
    `• Fear & Greed: ${state.fg?.value ?? '—'} (alarm seberang 75/25)`,
    `• BTC 24 jam: ${state.btc?.change != null ? (state.btc.change >= 0 ? '+' : '') + state.btc.change.toFixed(2) + '%' : '—'} (alarm |Δ| ≥ 5%)`,
    `• Altseason: ${alt != null ? alt + '/100' : '—'} (alarm seberang 60/40)`,
    `• Alarm harga aktif: ${getPriceAlerts().filter(p => p.active).length}`
  ];
  baris.forEach(x => L.push(x));
  L.push('');

  if (belumBaca.length){
    L.push('*Alarm belum dibaca:*');
    belumBaca.slice(-5).forEach(x => L.push(`• [${new Date(x.t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}] ${x.title}`));
    L.push('');
  }

  const berita = (state.__newsHits || []).slice(0, 3);
  if (berita.length){
    L.push('*Berita topik berdampak hari ini:*');
    berita.forEach(b => {
      const judul = b.title && b.title.length > 70 ? b.title.slice(0, 69) + '…' : (b.title || '');
      L.push(`• [${b.topik}] ${judul}`);
    });
    L.push('Pencocokan kata pada judul — baca isi beritanya sebelum menyimpulkan.');
    L.push('');
  }

  const notes = catatanKejujuran(state);
  if (notes.length){
    L.push('*Catatan kejujuran data:*');
    notes.forEach(n => L.push(`• ${n}`));
    L.push('');
  }

  L.push(THIN);
  L.push('Menara memantau transisi, bukan level — tidak ada alarm di sini berarti tidak ada yang MENYEBERANG ambang sejak terakhir dicek, bukan berarti tidak ada risiko.');
  L.push(DISCLAIMER);
  return L.join('\n');
}

/* ============================================================
   KATALOG FORMAT — dipakai komponen UI untuk membangun tab.
   ============================================================ */
export const FORMATS = [
  { id: 'tg',      label: '📣 Brief Lengkap',  hint: 'Telegram · postingan utama pagi',      limit: 4096, build: buildTelegramBrief },
  { id: 'wa',      label: '💬 Brief Ringkas',  hint: 'WhatsApp · muat jadi caption gambar',  limit: 1024, build: buildWhatsAppBrief },
  { id: 'caption', label: '🖼 Caption',        hint: 'Pasangan untuk screenshot PNG',        limit: 1024, build: buildCaption },
  { id: 'update',  label: '↻ Update Intraday', hint: 'Posting kedua · hanya yang berubah',   limit: 1024, build: buildUpdateIntraday },
  { id: 'edukasi', label: '📚 Edukasi',        hint: 'Adaptif ke kondisi pasar hari ini',    limit: 4096, build: buildEdukasi,  rotasi: true },
  { id: 'quiz',    label: '🧠 Quiz',           hint: 'Dibangun dari angka riil hari ini',    limit: 4096, build: buildQuiz,     rotasi: true },
  { id: 'poll',    label: '📊 Poll',           hint: 'Pemancing diskusi, bukan tebak harga', limit: 1024, build: buildPoll,     rotasi: true },
  { id: 'weekly',  label: '🗓 Scorecard',      hint: 'Rekap 7 hari dari ledger nyata',       limit: 4096, build: buildWeeklyScorecard },
  { id: 'struktur',label: '📐 Struktur Pasar',  hint: 'Laporan kerangka pasar · mingguan',    limit: 4096, build: buildStrukturPasar },
  { id: 'rencana', label: '🗓 Rencana Konten',  hint: 'Untuk admin · jadwal posting hari ini', limit: 4096, build: buildRencanaKonten },
  { id: 'pengawas',label: '🗼 Laporan Pengawas',hint: 'Rekap Menara Pengawas · untuk co-admin', limit: 4096, build: buildPengawas }
];

/** Bangun semua format sekaligus — dipakai tombol "unduh paket lengkap". */
export function buildAll(state){
  const out = {};
  FORMATS.forEach(f => {
    try{ out[f.id] = f.build(state); }
    catch(e){ out[f.id] = `(gagal membangun format ini: ${e.message})`; }
  });
  return out;
}
