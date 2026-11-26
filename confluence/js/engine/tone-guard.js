/**
 * engine/tone-guard.js — PENJAGA NADA & ETIKA BAHASA.
 *
 * Dashboard ini boleh sejujur apa pun di angkanya, tapi begitu angka itu
 * berubah jadi kalimat yang diposting ke grup, risikonya berpindah: kalimat
 * bisa terbaca sebagai janji. Modul ini adalah lint untuk teks — bukan untuk
 * kode — yang memeriksa setiap konten sebelum admin menyalinnya ke grup.
 *
 * Tiga hal yang diperiksa:
 *   1. KATA TERLARANG  — bahasa yang menjanjikan kepastian atau memerintah
 *                        ("pasti", "dijamin", "all in", "buy now", "cuan").
 *   2. KATA PELEMBUT    — kehadiran bahasa probabilistik ("cenderung",
 *                        "indikasi", "berisiko"). Kalau nol, teks terbaca
 *                        terlalu asertif untuk data yang sebenarnya lunak.
 *   3. DISCLAIMER       — wajib ada di setiap output yang diposting.
 *
 * Filosofinya sama dengan Rekam Jejak: sistem yang memeriksa dirinya sendiri
 * dan menolak berpura-pura lebih yakin daripada yang sebenarnya.
 */

/* Pola dicocokkan dengan batas kata supaya "kepastian" atau "pastikan" tidak
   ikut tertangkap oleh pola "pasti". Yang dilarang adalah klaim, bukan akar
   katanya. */
const FORBIDDEN = [
  { re: /\bpasti\b/gi,                  why: 'menjanjikan kepastian arah' },
  { re: /\bdijamin\b|\bjaminan profit\b/gi, why: 'menjanjikan hasil' },
  { re: /\bbuy now\b|\bbeli sekarang\b/gi,  why: 'instruksi transaksi langsung' },
  { re: /\ball[- ]in\b/gi,              why: 'mendorong risiko tanpa batas' },
  { re: /\b\d+\s?x\s?(cuan|profit|gain)\b/gi, why: 'menjanjikan kelipatan' },
  { re: /\bto the moon\b|\bmoon(ing)?\b/gi,   why: 'hype tanpa dasar data' },
  { re: /\bcuan\s?(pasti|aman)\b/gi,    why: 'menjanjikan keuntungan' },
  { re: /\bsinyal\s?(beli|jual)\b/gi,   why: 'terbaca sebagai call, bukan edukasi' },
  { re: /\bentry\s?(sekarang|now)\b/gi, why: 'instruksi transaksi langsung' },
  { re: /\bauto\s?profit\b/gi,          why: 'menjanjikan hasil' },
  { re: /\btarget harga\b/gi,           why: 'prediksi harga spesifik' }
];

const HEDGES = [
  /\bcenderung\b/i, /\bindikasi\b/i, /\bprobabilitas\b/i, /\bwaspada\b/i,
  /\bperlu dipantau\b/i, /\bberisiko\b/i, /\bbelum tentu\b/i, /\bkemungkinan\b/i,
  /\bbukan kepastian\b/i, /\bcatatan:/i, /\binterpretasi:/i,
  // Penanda yang sama sahnya, ditambahkan setelah audit v2.3 menemukan
  // banyak teks edukasi yang sebenarnya sudah hati-hati tapi tidak memakai
  // satu pun kata di daftar awal. Daftar yang terlalu sempit menghasilkan
  // peringatan palsu, dan peringatan palsu membuat admin berhenti membacanya.
  /\btidak selalu\b/i, /\bbukan jaminan\b/i, /\bbukan berarti\b/i,
  /\bsecara historis\b/i, /\bbiasanya\b/i, /\bsering\b/i, /\brentan\b/i,
  /\bbatas(nya)?\b/i, /\bperlu dicatat\b/i, /\brelatif\b/i, /\bbukan ramalan\b/i
];

/**
 * Frasa terlarang yang DIINGKARI bukan pelanggaran — justru kebalikannya.
 * "Overbought bukan sinyal jual" adalah kalimat edukasi yang benar, dan
 * menandainya sebagai pelanggaran akan melatih admin mengabaikan peringatan.
 * Jendela dua kata di depan frasa cukup untuk menangkap pola pengingkaran
 * dalam Bahasa Indonesia tanpa ikut meloloskan klaim yang sebenarnya.
 */
const NEGASI = /\b(bukan|tidak|belum|jangan|tanpa|takkan|tak|mustahil)\s+(\S+\s+){0,2}$/i;

export const DISCLAIMER = '📚 Edukasi, bukan financial advice. DYOR.';

/**
 * @param {string} text
 * @returns {{ok:boolean, violations:Array<{word:string,why:string}>, hedgeCount:number, hasDisclaimer:boolean, notes:string[]}}
 */
export function checkTone(text){
  const violations = [];
  FORBIDDEN.forEach(rule => {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    const terlihat = new Set();
    let m;
    while ((m = re.exec(text)) !== null){
      if (m[0].length === 0){ re.lastIndex++; continue; }
      const sebelum = text.slice(Math.max(0, m.index - 40), m.index);
      if (NEGASI.test(sebelum)) continue;            // frasa diingkari — sah
      const kata = m[0].toLowerCase();
      if (terlihat.has(kata)) continue;
      terlihat.add(kata);
      violations.push({ word: kata, why: rule.why });
    }
  });

  const hedgeCount = HEDGES.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  const hasDisclaimer = /edukasi, bukan financial advice/i.test(text)
    || /bukan nasihat keuangan/i.test(text);

  const notes = [];
  // Caption dan poll memang pendek — menuntut bahasa probabilistik di teks
  // 3 baris justru membuat kalimatnya kaku tanpa menambah kejujuran apa pun.
  // Ambang 400 karakter memisahkan "ringkasan" dari "argumen".
  if (violations.length === 0 && hedgeCount === 0 && text.length > 400){
    notes.push('Tidak ada kata terlarang, tapi juga tidak ada bahasa probabilistik — teks ini terbaca lebih yakin daripada datanya. Pertimbangkan menambah "cenderung" atau "indikasi".');
  }
  if (!hasDisclaimer){
    notes.push('Disclaimer belum ada. Wajib ditambahkan sebelum diposting.');
  }

  return {
    ok: violations.length === 0 && hasDisclaimer,
    assertiveWarning: violations.length === 0 && hedgeCount === 0 && text.length > 400,
    violations,
    hedgeCount,
    hasDisclaimer,
    notes
  };
}

/** Ringkasan satu baris untuk badge di UI. */
export function toneSummary(result){
  if (result.violations.length > 0){
    return `⚠ ${result.violations.length} frasa perlu diganti`;
  }
  if (!result.hasDisclaimer) return '⚠ Disclaimer belum ada';
  if (result.assertiveWarning) return '◐ Aman, tapi terlalu asertif';
  if (result.hedgeCount === 0) return '✓ Lolos tone check';
  return `✓ Lolos tone check · ${result.hedgeCount} penanda probabilistik`;
}
