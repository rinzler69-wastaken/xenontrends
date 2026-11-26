/**
 * engine/volatility.js — RISIKO YANG BISA DIUKUR.
 *
 * Empat hal yang dihitung dari satu deret harga BTC 30 hari (granularitas
 * per jam dari CoinGecko, ~720 titik):
 *
 *   1. Realized volatility — seberapa bergejolak pasar SEBENARNYA, bukan
 *      seberapa bergejolak rasanya. Plus persentilnya terhadap sebulan
 *      terakhir, supaya "tinggi" punya pembanding.
 *   2. Drawdown — jarak dari puncak, termasuk kurva underwater.
 *   3. Level otomatis — support/resistance dari pivot yang benar-benar
 *      teruji harga, bukan garis yang ditarik sesuka hati.
 *   4. Heatmap sesi & hari — kapan pergerakan biasanya terjadi.
 *
 * Batas kejujuran yang perlu dinyatakan di muka: semuanya DESKRIPTIF.
 * Volatilitas yang terukur adalah volatilitas yang sudah terjadi; ia tidak
 * memberi tahu volatilitas besok. Level yang terdeteksi adalah tempat harga
 * pernah berbalik, bukan tempat harga pasti berbalik lagi.
 */
import { mean, stdDev } from './statistics.js';
import { THRESHOLDS } from '../config.js';

const JAM_PER_TAHUN = 24 * 365;

function closes(prices){
  return (prices || []).map(p => p[1]).filter(v => typeof v === 'number' && isFinite(v) && v > 0);
}

function logReturns(arr){
  const out = [];
  for (let i = 1; i < arr.length; i++) out.push(Math.log(arr[i] / arr[i - 1]));
  return out;
}

/* ============================================================
   1. REALIZED VOLATILITY (annualized) + PERSENTIL
   ============================================================ */
export function computeVolatility(chart30d){
  const c = closes(chart30d?.prices);
  if (c.length < 100) return { available: false };

  const r = logReturns(c);
  const annualize = (slice) => stdDev(slice) * Math.sqrt(JAM_PER_TAHUN) * 100;

  const vol7 = r.length >= 168 ? annualize(r.slice(-168)) : null;
  const vol30 = annualize(r);

  // Persentil: gulirkan jendela 7 hari sepanjang bulan, lalu lihat di mana
  // posisi vol saat ini berdiri di antara semua jendela itu. Ini yang
  // mengubah "vol 48%" jadi kalimat yang berarti.
  let persentil = null, distribusi = [];
  if (r.length >= 200){
    for (let i = 168; i <= r.length; i += 6){
      distribusi.push(annualize(r.slice(i - 168, i)));
    }
    if (distribusi.length > 5 && vol7 != null){
      const lebihRendah = distribusi.filter(v => v < vol7).length;
      persentil = Math.round((lebihRendah / distribusi.length) * 100);
    }
  }

  // Rentang harian tipikal — terjemahan volatilitas ke satuan yang
  // langsung berguna: "berapa dolar BTC biasanya bergerak dalam sehari".
  const harga = c[c.length - 1];
  const volHarianPct = vol7 != null ? vol7 / Math.sqrt(365) : vol30 / Math.sqrt(365);
  const rentangTipikal = harga * (volHarianPct / 100);

  let label, tafsir;
  if (persentil == null){
    label = 'Belum terukur';
    tafsir = 'Sampel belum cukup untuk menempatkan volatilitas hari ini dalam konteks sejarahnya sendiri.';
  } else if (persentil >= THRESHOLDS.volPercentileHigh){
    label = 'Bergejolak';
    tafsir = `Volatilitas 7 hari berada di persentil ${persentil} dari sebulan terakhir — pasar sedang lebih liar dari kebiasaannya. Konsekuensi praktisnya: ukuran posisi yang terasa wajar bulan lalu membawa risiko rupiah yang lebih besar sekarang, meski persentasenya sama.`;
  } else if (persentil <= THRESHOLDS.volPercentileLow){
    label = 'Tenang';
    tafsir = `Volatilitas 7 hari di persentil ${persentil} — pasar lebih tenang dari biasanya. Periode tenang berkepanjangan cenderung diikuti ekspansi volatilitas, meski waktunya tidak bisa ditentukan dari angka ini saja.`;
  } else {
    label = 'Normal';
    tafsir = `Volatilitas 7 hari di persentil ${persentil} — masih dalam rentang kebiasaan sebulan terakhir.`;
  }

  return {
    available: true,
    vol7: vol7 != null ? Number(vol7.toFixed(1)) : null,
    vol30: Number(vol30.toFixed(1)),
    persentil, label, tafsir,
    rentangHarianPct: Number(volHarianPct.toFixed(2)),
    rentangHarianUsd: rentangTipikal,
    distribusi
  };
}

/* ============================================================
   2. DRAWDOWN — jarak dari puncak
   ============================================================ */
export function computeDrawdown(chart30d, athChangePct){
  const c = closes(chart30d?.prices);
  if (c.length < 50) return { available: false };

  let puncak = -Infinity;
  const underwater = c.map(v => {
    if (v > puncak) puncak = v;
    return ((v - puncak) / puncak) * 100;
  });

  const sekarang = underwater[underwater.length - 1];
  const terdalam = Math.min(...underwater);
  const puncak30d = Math.max(...c);
  const lembah30d = Math.min(...c);

  // Berapa lama sudah terbenam (jam berturut-turut di bawah puncak)
  let jamTerbenam = 0;
  for (let i = underwater.length - 1; i >= 0; i--){
    if (underwater[i] < -0.15) jamTerbenam++;
    else break;
  }

  return {
    available: true,
    sekarang: Number(sekarang.toFixed(2)),
    terdalam: Number(terdalam.toFixed(2)),
    puncak30d, lembah30d,
    dariAth: typeof athChangePct === 'number' ? Number(athChangePct.toFixed(1)) : null,
    jamTerbenam,
    underwater: underwater.filter((_, i) => i % 3 === 0), // dijarangkan untuk render
    tafsir: sekarang > -1
      ? 'BTC sedang berada di atau sangat dekat dengan puncak 30 harinya.'
      : `BTC ${Math.abs(sekarang).toFixed(1)}% di bawah puncak 30 hari, sudah ${jamTerbenam >= 24 ? Math.round(jamTerbenam / 24) + ' hari' : jamTerbenam + ' jam'} tidak menyentuh puncak itu lagi.`
  };
}

/* ============================================================
   3. LEVEL OTOMATIS — support & resistance dari pivot teruji
   Metodenya sengaja sederhana dan bisa diaudit: cari titik yang lebih
   tinggi (atau rendah) dari k titik di kiri-kanannya, kelompokkan yang
   berdekatan, lalu urutkan berdasarkan BERAPA KALI harga menyentuhnya.
   Level yang sering disentuh lebih berarti daripada level yang cuma
   disentuh sekali — itu satu-satunya klaim yang dibuat di sini.
   ============================================================ */
export function detectLevels(chart30d, hargaSekarang){
  const c = closes(chart30d?.prices);
  if (c.length < 120 || !hargaSekarang) return { available: false, resistance: [], support: [] };

  const k = 8;
  const pivots = [];
  for (let i = k; i < c.length - k; i++){
    const kiri = c.slice(i - k, i), kanan = c.slice(i + 1, i + 1 + k);
    if (c[i] > Math.max(...kiri) && c[i] > Math.max(...kanan)) pivots.push({ harga: c[i], tipe: 'high' });
    if (c[i] < Math.min(...kiri) && c[i] < Math.min(...kanan)) pivots.push({ harga: c[i], tipe: 'low' });
  }
  if (pivots.length < 3) return { available: false, resistance: [], support: [] };

  // Gabungkan pivot yang jaraknya < 0.8% jadi satu zona
  const toleransi = 0.008;
  const zona = [];
  pivots.sort((a, b) => a.harga - b.harga).forEach(p => {
    const z = zona.find(z => Math.abs(z.harga - p.harga) / z.harga < toleransi);
    if (z){
      z.sentuhan++;
      z.harga = (z.harga * (z.sentuhan - 1) + p.harga) / z.sentuhan;
    } else {
      zona.push({ harga: p.harga, sentuhan: 1 });
    }
  });

  const beri = (z) => ({
    harga: z.harga,
    sentuhan: z.sentuhan,
    jarakPct: ((z.harga - hargaSekarang) / hargaSekarang) * 100,
    kekuatan: z.sentuhan >= 4 ? 'kuat' : z.sentuhan >= 2 ? 'sedang' : 'lemah'
  });

  const resistance = zona.filter(z => z.harga > hargaSekarang * 1.001).map(beri)
    .sort((a, b) => a.jarakPct - b.jarakPct).slice(0, 3);
  const support = zona.filter(z => z.harga < hargaSekarang * 0.999).map(beri)
    .sort((a, b) => b.jarakPct - a.jarakPct).slice(0, 3);

  return {
    available: true,
    resistance, support,
    totalZona: zona.length,
    catatan: 'Level di atas adalah tempat harga pernah berbalik dalam 30 hari terakhir, diurutkan dari yang terdekat. Angka "sentuhan" menunjukkan berapa kali zona itu teruji — bukan seberapa besar kemungkinannya bertahan.'
  };
}

/* ============================================================
   4. HEATMAP SESI & HARI
   Pasar kripto buka 24 jam, tapi likuiditas dan pelakunya tidak merata.
   Rata-rata pergerakan per sesi selama 30 hari memberi gambaran kapan
   pergerakan biasanya terjadi — informasi praktis untuk admin grup yang
   perlu memutuskan jam berapa brief-nya paling berguna diposting.
   ============================================================ */
const SESI = [
  { nama: 'Asia',    dari: 0,  sampai: 7,  jamWib: '07–14 WIB' },
  { nama: 'Eropa',   dari: 7,  sampai: 13, jamWib: '14–20 WIB' },
  { nama: 'Amerika', dari: 13, sampai: 21, jamWib: '20–04 WIB' },
  { nama: 'Malam',   dari: 21, sampai: 24, jamWib: '04–07 WIB' }
];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function computeSessionHeatmap(chart30d){
  const p = chart30d?.prices || [];
  if (p.length < 100) return { available: false };

  const emberSesi = SESI.map(s => ({ label: s.nama, jamWib: s.jamWib, ret: [] }));
  const emberHari = HARI.map(h => ({ label: h, ret: [] }));

  for (let i = 1; i < p.length; i++){
    const [ts, harga] = p[i];
    const sebelum = p[i - 1][1];
    if (!sebelum || !harga) continue;
    const ret = ((harga - sebelum) / sebelum) * 100;
    const d = new Date(ts);
    const jamUtc = d.getUTCHours();

    const idxSesi = SESI.findIndex(s => jamUtc >= s.dari && jamUtc < s.sampai);
    if (idxSesi >= 0) emberSesi[idxSesi].ret.push(ret);
    // Hari dihitung dalam WIB, karena pembacanya orang Indonesia
    const hariWib = new Date(ts + 7 * 3600_000).getUTCDay();
    emberHari[hariWib].ret.push(ret);
  }

  // Dijumlahkan, bukan dirata-rata: yang menarik adalah kontribusi total
  // sesi itu terhadap pergerakan sebulan, bukan rata-rata per jam yang
  // angkanya terlalu kecil untuk dibaca.
  const sesi = emberSesi.map(e => ({
    label: e.label, jamWib: e.jamWib,
    value: e.ret.reduce((a, b) => a + b, 0),
    n: e.ret.length
  }));
  const hari = emberHari.map(e => ({
    label: e.label,
    value: e.ret.reduce((a, b) => a + b, 0),
    n: e.ret.length
  }));

  const terkuat = [...sesi].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];

  return {
    available: true,
    sesi, hari,
    tafsir: terkuat
      ? `Dalam 30 hari terakhir, sesi ${terkuat.label} (${terkuat.jamWib}) menyumbang pergerakan bersih terbesar: ${terkuat.value >= 0 ? '+' : ''}${terkuat.value.toFixed(1)}%. Catatan: ini pola masa lalu dari satu bulan sampel — terlalu pendek untuk disebut kebiasaan permanen, cukup untuk jadi bahan pertimbangan jam posting.`
      : ''
  };
}
