/**
 * engine/news-scan.js — PEMINDAI KATA KUNCI BERITA (v2.4).
 *
 * Radar Konteks sudah menampilkan berita sejak v2.0, tapi ia hanya menampilkan —
 * admin harus membaca satu per satu untuk tahu mana yang relevan. Modul ini
 * mencocokkan judul terhadap leksikon NEWS_KEYWORDS (config.js): topik yang
 * SECARA HISTORIS sering menggerakkan harga (ETF, insiden keamanan, regulasi,
 * kebijakan moneter, inflasi, likuidasi besar, dsb).
 *
 * Batas kejujuran yang ditegaskan di UI dan di output Brief Studio:
 * pencocokan STRING pada JUDUL saja — bukan analisis sentimen, bukan pembacaan
 * isi. Klaimnya sebatas "judul ini menyentuh topik yang sering berdampak",
 * tidak pernah "berita ini bullish/bearish".
 */

import { NEWS_KEYWORDS } from '../config.js';

/**
 * @param {Array<{title:string, link:string, pubDate:string}>} items daftar berita dari Radar Konteks
 * @returns {Array<{title, link, pubDate, topik, dampak}>} hanya yang cocok, urut terbaru
 */
export function scanNews(items){
  if (!Array.isArray(items)) return [];
  const hasil = [];
  for (const it of items){
    const judul = String(it.title || '').toLowerCase();
    if (!judul) continue;
    for (const aturan of NEWS_KEYWORDS){
      if (aturan.kata.some(k => judul.includes(k))){
        hasil.push({ title: it.title, link: it.link, pubDate: it.pubDate, topik: aturan.topik, dampak: aturan.dampak });
        break; // satu berita cukup dilaporkan sekali — pakai topik pertama yang cocok
      }
    }
  }
  return hasil;
}
