# CHANGELOG v2.4 — "Genius Edition"

Semua perubahan terhadap v2.3. Prinsip yang dipegang sama seperti sejak v2.0:
**formula WCCS dan bobot lima pilar (25/20/15/20/20) TIDAK disentuh sama sekali.**
Semua fitur baru berperan sebagai lensa, penjaga, atau jembatan — bukan bahan skor.
Rekam jejak historis (hit rate, Brier score) tetap sebanding dari sinyal pertama
sampai hari ini.

---

## 🗼 1. Menara Pengawas — dashboard yang menjaga sendiri

Dashboard hanya berguna kalau diamati; admin grup tidak menatapnya 24 jam. Menara
Pengawas mengambil alih bagian itu: tiap siklus refresh (60 detik default — siklus
yang SAMA dengan yang sudah berjalan, **nol panggilan API tambahan**), kondisi pasar
dibandingkan dengan snapshot siklus sebelumnya, dan setiap transisi penting diubah
jadi alarm.

**Aturan bawaan** (semua berbasis TRANSISI — alarm bunyi saat kondisi
MENYEBERANG ambang, bukan saat berada di atasnya; alarm yang menjerit tiap menit
adalah alarm yang cepat diabaikan orang):

| # | Aturan | Pemicu |
|---|---|---|
| 1 | Klasifikasi confluence berganti | kategori berubah |
| 2 | WCCS menyeberang ±0,4 / ±1,2 | zona terlewati |
| 3 | Funding rate masuk/keluar zona crowding | transisi |
| 4 | RSI 1 jam menyeberang 70 / 30 | zona terlewati |
| 5 | Fear & Greed menyeberang 75 / 25 | zona terlewati |
| 6 | BTC 24 jam menyeberang ±5% | ambang dilampaui |
| 7 | Indeks altseason menyeberang 60 / 40 | zona terlewati |
| 8 | Berita menyentuh topik berdampak | judul baru (maks 3/siklus) |

*(Aturan #9 asli — "Premium harga lokal menyeberang ±1,5%" — dihapus bersama
fitur Radar Lokal; penomoran di atas sudah disesuaikan.)*

Plus **alarm harga kustom**: admin memasang level BTC/ETH sendiri (atas/bawah),
alarm berbunyi SEKALI saat tersentuh (one-shot), lalu ditandai terpicu.

Keluarannya: banner ringkas di bawah toolbar, riwayat alarm tersimpan lokal
(maks 120, bisa ditandai terbaca/dikosongkan), bunyi beep via Web Audio (tanpa
file), dan notifikasi desktop — yang hanya menyala kalau admin mengizinkannya
lewat Panel Pengaturan. Tidak pernah minta izin diam-diam.

Siklus pertama sengaja tidak menghasilkan alarm — belum ada pembanding. Menara
menyala mulai siklus kedua, dan panelnya jujur menyatakan itu.

## 🇮🇩 2. Radar Lokal — harga Indodax dalam Rupiah

> **⚠ DIHAPUS dari versi sekarang.** Panel Radar Lokal, ticker Indodax,
> kalkulator premium Rupiah, dan alarm premium lokal sudah dilepas seluruhnya
> (api/local.js, engine/local-premium.js, panel UI, aturan Menara, dan baris
> Laporan Pengawas). Catatan di bawah ini dipertahankan sebagai dokumentasi
> historis v2.4 saja.

Pertanyaan yang hanya bisa dijawab grup Indonesia: "harga di Indodax beda berapa
dari harga global?" Panel baru menampilkan BTC/IDR dan ETH/IDR dari Indodax
(gratis, tanpa key), premium/diskon terhadap harga global, dan tafsir satu
kalimat.

Teknis yang jujur: server Indodax tidak mengirim header CORS, jadi jalurnya
fetch langsung → rantai 5 proxy publik, dan SETIAP kali proxy terpakai, badge
"via proxy publik" tampil — pola disclosure yang sama dengan Pilar E sejak
v2.0. Kalau semua proxy gagal, panel bilang "belum tersedia" dan dashboard lain
tetap hidup.

Kurs USD→IDR yang dipakai adalah **kurs pasar implisit** — dihitung dari
panggilan `/simple/price` yang SAMA (vs_currencies diperluas jadi `usd,idr`),
jadi fitur ini nol panggilan API tambahan. Kursnya proksi pasar, bukan kurs
bank — cukup akurat untuk mengukur premium, dinyatakan eksplisit tidak untuk
konversi pembayaran.

## 🗺 3. Heatmap Pasar — peta perasaan 100 koin

Seratus koin teratas dalam sel berwarna, ukuran sel mengikuti kapitalisasi
(diperskala akar supaya koin kecil tetap terbaca), intensitas warna mengikuti
besarnya pergerakan. Toggle interaktif 1 jam / 24 jam / 7 hari / 30 hari.
Dibangun dari endpoint `/coins/markets` yang sama — nol panggilan tambahan.

## 📊 4. Grafik BTC 30 hari + level teruji overlay

Data chart 30 hari sudah diambil sejak v2.3 (untuk volatilitas/drawdown/level)
tapi belum pernah dilihat sebagai kurva. Sekarang digambar — murni SVG, tanpa
library — dengan garis putus-putus level support/resistance dari panel "Level
Otomatis" yang membaca sumber data yang sama persis. Angkanya tidak mungkin
berbeda antara grafik dan tabel.

## ⚙️ 5. Panel Pengaturan — tanpa edit file

API key CoinGecko, interval auto-refresh (30 detik–5 menit / matikan), izin
notifikasi, dan toggle Menara — semuanya bisa diubah dari UI, tersimpan di
localStorage, berlaku seketika. Yang sengaja TIDAK bisa diubah dari sini: bobot
resmi lima pilar.

**Mode Eksperimen Bobot** — satu-satunya "buangans" yang disengaja: geser bobot
pilar sesuka hati, sistem menghitung ulang WCCS hari ini di SANDBOX dan
menampilkannya sebagai baris pembanding berlabel jelas di bawah Signal Box.
Skor resmi, ledger, dan rekam jejak tidak pernah menyentuhnya. Gunanya:
menguji intuisi struktur bobot tanpa merusak sejarah.

## 📰 6. Pemindai kata kunci berita

Radar Konteks sudah menampilkan berita sejak v2.0, tapi admin harus membaca
satu per satu. Sekarang judulnya dicocokkan dengan leksikon 10 topik yang
secara historis sering menggerakkan harga (ETF, insiden keamanan, regulasi,
kebijakan moneter, inflasi, likuidasi besar, peningkatan jaringan, dst).
Klaimnya dibatasi eksplisit: pencocokan STRING pada JUDUL — bukan analisis
sentimen, bukan "berita ini bullish".

## 📋 7. Brief Studio: sebelas format (dari sembilan)

Dua format baru:

- **🗓 Rencana Konten** — bukan teks untuk diposting, tapi rencana kerja untuk
  admin: pagi (brief + jam paling aktif dari heatmap sesi 30 hari), siang
  (materi edukasi adaptif hari ini, judulnya diambil otomatis), sore (quiz +
  poll), malam (update intraday — WAJIB kalau klasifikasi berganti), dan
  pengingat scorecard akhir pekan.
- **🗼 Laporan Pengawas** — rekap Menara dalam teks siap-tempel untuk
  co-admin: status delapan aturan terhadap kondisi sekarang, alarm yang
  belum dibaca, alarm harga aktif, berita berdampak, dan catatan kejujuran
  data. Sekali tempel, dia tahu apa yang dijaga tanpa membuka dashboard.

## ⌨️ 8. Shortcut keyboard + nomor brief dinamis + versi

- `B` Brief Studio · `T` Mode Ringkas · `W` Menara · `S` Pengaturan ·
  `R` Refresh — diabaikan saat sedang mengetik di input.
- Nomor brief di header tidak lagi konstanta 1: dihitung dari hari pertama
  aplikasi dipakai di perangkat (hari pertama = #1, besok = #2, dst).
- Chip versi `v2.4` di toolbar + footer.

## 🩺 9. Perekam error boot

Sampai v2.3, kalau satu file modul gagal termuat (mis. ekstrak zip tidak
lengkap), dashboard mati diam-diam dan admin menyalahkan internet. Sekarang
error boot tampil sebagai banner merah dengan saran perbaikan.

## 🧾 10. Perbaikan kecil

- Satu baris kode mati di `wccs.js` (variabel `wComp` yang tak pernah dipakai)
  dihapus.
- `computeWCCS()` kini menerima parameter bobot opsional — SATU-SATUNYA
  konsumennya adalah Mode Eksperimen Bobot; jalur resmi tidak pernah mengirimnya
  (dinyatakan di docstring supaya tidak disalahpahami sebagai pintu belakang).
- Interval refresh dijadwalkan ulang setelah tiap siklus, jadi perubahan
  interval dari Panel Pengaturan berlaku pada siklus berikutnya tanpa reload.
- `dataHealth` menambahkan entri `indodax` (ok / degraded via-proxy / failed,
  dengan alasannya) — konsisten dengan prinsip "dashboard yang jujur bilang
  sedang pincang". *(Entri ini ikut dihapus bersama fitur Radar Lokal.)*

## Biaya data v2.4

| Sumber | Tambahan panggilan | Catatan |
|---|---|---|
| `/simple/price` | **0** | vs_currencies `usd` (dulu sempat `usd,idr` untuk kurs implisit Radar Lokal — sudah dikembalikan) |
| `/coins/markets` | **0** | Heatmap memakai endpoint yang sudah dipanggil |
| Indodax ticker ×2 | ~~+2~~ **dihapus** | ticker Indodax tidak lagi dipanggil sama sekali |
| Menara, berita, eksperimen, shortcut | **0** | murni dari state siklus yang ada |

## Yang TIDAK berubah (disengaja)

- Formula WCCS, bobot pilar 25/20/15/20/20, orientasi tanda, ambang klasifikasi.
- Ledger, hit rate, Brier score — semuanya tetap comparable sejak sinyal pertama.
- Mode Ringkas tetap menyembunyikan panel-panel baru (grafik, heatmap, banner
  alarm) supaya satu barisnya tetap satu baris.
