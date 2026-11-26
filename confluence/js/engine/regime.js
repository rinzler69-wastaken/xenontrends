/**
 * engine/regime.js — DETEKTOR REZIM PASAR & PEMBACAAN POSISI.
 *
 * Pertanyaan yang lebih dulu perlu dijawab sebelum "arahnya ke mana" adalah
 * "kita sedang berada di jenis pasar seperti apa". Sinyal yang sama berarti
 * hal berbeda di rezim berbeda: RSI 72 dalam rezim ekspansi berisiko-on
 * adalah hal biasa; RSI 72 di tengah pasar yang sedang menurunkan risiko
 * adalah anomali.
 *
 * PENTING — BATAS METODOLOGIS YANG DISENGAJA:
 * Rezim TIDAK masuk ke dalam formula WCCS. Bobot lima pilar tetap persis
 * seperti v2.0 (25/20/15/20/20). Menambahkan variabel baru ke dalam skor
 * berarti mengubah arti seluruh rekam jejak historis yang sudah terkumpul —
 * hit rate dan Brier score lama jadi tidak sebanding dengan yang baru.
 * Karena itu semua analitik v2.3 berperan sebagai LENSA UNTUK MEMBACA skor,
 * bukan sebagai bahan skor. Satu-satunya pengecualian: label rezim ikut
 * dicatat ke ledger, supaya ke depan bisa dijawab pertanyaan "sistem ini
 * lebih akurat di rezim yang mana" — itu penambahan metadata, bukan
 * perubahan perhitungan.
 */
import { THRESHOLDS } from '../config.js';

/**
 * @param {object} inp {volatility, breadth, altseason, drawdown, global, correlation}
 */
export function detectRegime(inp){
  const { volatility: vol, breadth: br, altseason: alt, drawdown: dd, global: gl, correlation: corr } = inp || {};

  const punyaVol = vol && vol.available && vol.persentil != null;
  const punyaBr = br && br.available;
  if (!punyaVol && !punyaBr){
    return {
      available: false,
      label: 'Belum terbaca',
      tone: 'neutral',
      ringkas: 'Data pendukung rezim belum lengkap pada pengambilan ini.',
      faktor: []
    };
  }

  const faktor = [];

  // --- Sumbu 1: tekanan volatilitas ---
  let skorVol = 0;
  if (punyaVol){
    if (vol.persentil >= THRESHOLDS.volPercentileHigh){ skorVol = -1; faktor.push({ nama: 'Volatilitas', nilai: `persentil ${vol.persentil}`, arah: 'risiko', catatan: 'lebih liar dari kebiasaan sebulan' }); }
    else if (vol.persentil <= THRESHOLDS.volPercentileLow){ skorVol = 1; faktor.push({ nama: 'Volatilitas', nilai: `persentil ${vol.persentil}`, arah: 'tenang', catatan: 'lebih tenang dari kebiasaan sebulan' }); }
    else faktor.push({ nama: 'Volatilitas', nilai: `persentil ${vol.persentil}`, arah: 'netral', catatan: 'dalam rentang biasa' });
  }

  // --- Sumbu 2: partisipasi pasar ---
  let skorBr = 0;
  if (punyaBr){
    const p = br.d24.pctNaik;
    if (p >= THRESHOLDS.breadthBroad){ skorBr = 1; faktor.push({ nama: 'Partisipasi', nilai: `${p}% naik`, arah: 'luas', catatan: 'mayoritas koin ikut bergerak' }); }
    else if (p <= THRESHOLDS.breadthNarrow){ skorBr = -1; faktor.push({ nama: 'Partisipasi', nilai: `${p}% naik`, arah: 'sempit', catatan: 'sebagian besar koin tertinggal' }); }
    else faktor.push({ nama: 'Partisipasi', nilai: `${p}% naik`, arah: 'terbelah', catatan: 'pasar tidak serempak' });
  }

  // --- Sumbu 3: posisi terhadap puncak ---
  let skorDd = 0;
  if (dd && dd.available){
    if (dd.sekarang > -2){ skorDd = 1; faktor.push({ nama: 'Posisi vs puncak 30h', nilai: `${dd.sekarang.toFixed(1)}%`, arah: 'di puncak', catatan: 'harga di atau dekat puncak bulanan' }); }
    else if (dd.sekarang < -12){ skorDd = -1; faktor.push({ nama: 'Posisi vs puncak 30h', nilai: `${dd.sekarang.toFixed(1)}%`, arah: 'terbenam', catatan: 'jauh di bawah puncak bulanan' }); }
    else faktor.push({ nama: 'Posisi vs puncak 30h', nilai: `${dd.sekarang.toFixed(1)}%`, arah: 'netral', catatan: 'koreksi dalam batas wajar' });
  }

  // --- Sumbu 4: ke mana modal berputar ---
  let rotasi = null;
  if (alt && alt.available){
    rotasi = alt.indeks >= THRESHOLDS.altseasonThreshold ? 'alt'
           : alt.indeks <= (100 - THRESHOLDS.altseasonThreshold) ? 'btc' : null;
    faktor.push({
      nama: 'Rotasi modal',
      nilai: `${alt.indeks}% ungguli BTC`,
      arah: rotasi === 'alt' ? 'ke altcoin' : rotasi === 'btc' ? 'ke BTC' : 'belum jelas',
      catatan: rotasi === 'alt' ? 'modal menyebar keluar dari BTC'
             : rotasi === 'btc' ? 'modal berlindung di aset paling likuid' : 'tidak ada arah dominan'
    });
  }

  if (corr && corr.available){
    faktor.push({
      nama: 'Kohesi pasar',
      nilai: `korelasi rata ${corr.rataKorelasi}`,
      arah: corr.rataKorelasi >= 0.8 ? 'satu badan' : corr.rataKorelasi >= 0.55 ? 'cukup rapat' : 'menyebar',
      catatan: corr.rataKorelasi >= 0.8 ? 'diversifikasi antar koin nyaris tidak berlaku' : 'pemilihan aset masih berpengaruh'
    });
  }

  // --- Klasifikasi ---
  const total = skorVol + skorBr + skorDd;
  let label, tone, ringkas, implikasi;

  if (skorBr >= 1 && skorDd >= 0 && skorVol >= 0){
    label = 'EKSPANSI BERISIKO-ON';
    tone = 'bullish';
    ringkas = 'Partisipasi luas, harga dekat puncak bulanan, volatilitas belum meledak. Ini kombinasi yang biasanya menyertai fase ekspansi.';
    implikasi = 'Dalam rezim ini sinyal bullish dari WCCS cenderung punya dukungan struktural. Yang perlu diwaspadai justru rasa aman: ekspansi berakhir ketika partisipasi menyempit sementara harga masih naik.';
  } else if (skorBr <= -1 && skorDd <= -1){
    label = 'KONTRAKSI BERISIKO-OFF';
    tone = 'bearish';
    ringkas = 'Partisipasi sempit dan harga jauh di bawah puncak bulanan. Modal sedang ditarik, bukan diputar.';
    implikasi = 'Dalam rezim ini sinyal bullish jangka pendek lebih sering berupa pantulan teknikal daripada pembalikan tren. Bobot ekstra pantas diberikan pada konfirmasi dari pilar aliran dana.';
  } else if (skorVol <= -1 && Math.abs(skorBr) <= 0){
    label = 'GEJOLAK TANPA ARAH';
    tone = 'neutral';
    ringkas = 'Volatilitas di atas kebiasaan tapi partisipasi terbelah — pasar bergerak keras tanpa kesepakatan arah.';
    implikasi = 'Ini rezim dengan tingkat sinyal palsu tertinggi. Skor confluence yang tampak meyakinkan pun pantas dibaca dengan keyakinan yang dikurangi, karena komponennya sendiri sedang bising.';
  } else if (rotasi === 'alt' && skorBr >= 0){
    label = 'ROTASI KE ALTCOIN';
    tone = 'bullish-soft';
    ringkas = 'Modal berputar keluar dari BTC menuju aset berisiko lebih tinggi, dengan partisipasi yang belum menyempit.';
    implikasi = 'Rezim rotasi memperlebar sebaran hasil antar koin: rata-rata pasar bisa hijau sementara pilihan yang keliru tetap merah dalam. Pemilihan aset lebih menentukan daripada arah pasar di sini.';
  } else if (rotasi === 'btc' && skorDd <= 0){
    label = 'KONSOLIDASI DEFENSIF';
    tone = 'bearish-soft';
    ringkas = 'Modal terkonsentrasi di BTC sementara harga masih di bawah puncak — pola yang biasa muncul saat pasar menurunkan risiko tanpa panik.';
    implikasi = 'Aset di luar sepuluh besar cenderung tertinggal lebih dalam di rezim ini, meski BTC terlihat stabil. Angka "pasar hijau" perlu dicek ulang terhadap breadth.';
  } else if (skorVol >= 1 && Math.abs(skorBr) === 0){
    label = 'TENANG MENEKAN';
    tone = 'neutral';
    ringkas = 'Volatilitas di bawah kebiasaan dengan partisipasi terbelah — pasar sedang menahan napas.';
    implikasi = 'Periode volatilitas rendah berkepanjangan secara historis diikuti ekspansi volatilitas, tapi waktunya tidak bisa ditentukan dari kondisi tenang itu sendiri. Yang bisa disiapkan adalah ukuran posisi, bukan waktunya.';
  } else {
    label = 'CAMPURAN / TRANSISI';
    tone = 'neutral';
    ringkas = 'Faktor-faktor rezim saling bertentangan — tidak ada pola dominan yang bisa diberi nama dengan jujur.';
    implikasi = 'Rezim transisi adalah kondisi paling sering terjadi dan paling sering dipaksakan jadi cerita. Lebih aman memperlakukan setiap sinyal secara berdiri sendiri sampai satu pola menguat.';
  }

  return {
    available: true,
    label, tone, ringkas, implikasi, faktor,
    skor: total,
    rotasi,
    mcapChange24h: gl?.mcapChange24h ?? null,
    btcDominance: gl?.btcDominance ?? null
  };
}

/* ============================================================
   PEMBACAAN POSISI LEVERAGE — ritel vs trader besar
   ============================================================ */
export function readPositioning(ls){
  if (!ls || !ls.available){
    return { available: false, tafsir: 'Data rasio long/short tidak tersedia pada pengambilan ini.' };
  }

  const { retailLongPct: ritel, topLongPct: top, divergence: selisih } = ls;
  let tafsir, tanda = 'netral';

  if (selisih != null && Math.abs(selisih) >= 8){
    tanda = selisih > 0 ? 'ritel-lebih-long' : 'ritel-lebih-short';
    tafsir = selisih > 0
      ? `Akun ritel ${ritel.toFixed(1)}% long, sementara top trader ${top.toFixed(1)}% long — selisih ${Math.abs(selisih).toFixed(1)} poin. Ketika kelompok besar duduk lebih ringan daripada ritel, sisi yang ramai itulah yang jadi sumber likuidasi paling murah kalau harga bergerak berlawanan.`
      : `Akun ritel ${ritel.toFixed(1)}% long, top trader justru ${top.toFixed(1)}% long — top trader duduk lebih agresif di sisi long dibanding ritel (selisih ${Math.abs(selisih).toFixed(1)} poin). Ini kebalikan dari pola biasanya dan layak dicatat.`;
  } else if (ritel != null && ritel >= 70){
    tanda = 'long-ramai';
    tafsir = `${ritel.toFixed(1)}% akun berposisi long. Konsentrasi setinggi ini berarti bahan bakar likuidasi menumpuk di satu sisi — indikasi risiko squeeze, bukan konfirmasi arah.`;
  } else if (ritel != null && ritel <= 40){
    tanda = 'short-ramai';
    tafsir = `Hanya ${ritel.toFixed(1)}% akun berposisi long — sisi short sedang ramai. Kondisi ini secara historis rentan terhadap short squeeze kalau ada pemicu naik mendadak.`;
  } else if (ritel != null){
    tafsir = `Posisi relatif berimbang: ${ritel.toFixed(1)}% akun long${top != null ? `, top trader ${top.toFixed(1)}%` : ''}. Tidak ada konsentrasi mencolok di satu sisi.`;
  } else {
    tafsir = 'Sebagian data posisi tidak lengkap.';
  }

  return {
    available: true,
    ritel, top, selisih, tanda, tafsir,
    seriRitel: ls.retailSeries || [],
    seriTop: ls.topSeries || []
  };
}

/* ============================================================
   DRY POWDER — pasokan stablecoin sebagai amunisi yang menunggu
   ============================================================ */
export function readDryPowder(st){
  if (!st || !st.available){
    return { available: false, tafsir: 'Data pasokan stablecoin tidak tersedia pada pengambilan ini.' };
  }
  const c7 = st.change7d, c30 = st.change30d;
  let tafsir;

  if (c30 != null && c30 > 2){
    tafsir = `Pasokan stablecoin tumbuh ${c30.toFixed(1)}% dalam 30 hari. Stablecoin yang dicetak umumnya masuk lewat jalur yang sama dengan modal baru — pertumbuhannya sering dibaca sebagai bertambahnya amunisi yang belum dibelanjakan. Catatan penting: uang yang ada bukan berarti uang yang akan masuk.`;
  } else if (c30 != null && c30 < -2){
    tafsir = `Pasokan stablecoin menyusut ${Math.abs(c30).toFixed(1)}% dalam 30 hari — indikasi modal ditarik keluar dari ekosistem, bukan sekadar berpindah aset. Ini salah satu sinyal likuiditas yang bergerak lambat tapi jarang berbohong.`;
  } else {
    tafsir = `Pasokan stablecoin relatif datar dalam 30 hari (${c30 != null ? c30.toFixed(1) + '%' : 'perubahan kecil'}). Tidak ada aliran modal masuk atau keluar ekosistem yang mencolok.`;
  }
  if (c7 != null && Math.abs(c7) > 1){
    tafsir += ` Dalam sepekan terakhir pergerakannya ${c7 >= 0 ? '+' : ''}${c7.toFixed(2)}%.`;
  }

  return { available: true, total: st.total, change7d: c7, change30d: c30, series: st.series, tafsir };
}
