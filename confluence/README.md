# ArgonPulse⚡ — The Confluence Engine

Dashboard crypto morning-brief generasi kedua: bukan lagi kartu-kartu data
terpisah, tapi **Weighted Composite Confluence Score (WCCS)** — skor komposit
tertimbang dari 5 pilar sinyal (Price Action, Momentum Teknikal, Sentimen,
On-Chain Flow, Derivatives & Leverage), dibangun mengikuti kerangka metodologis
OECD/JRC *Handbook on Constructing Composite Indicators*.

Implementasi penuh dari dokumen konsep `LIQUIDITY_WAVES_V2_CONCEPT.md` (rev.2)
— rebranded total menjadi ArgonPulse⚡, tanpa jejak nama produk kompetitor
manapun.

## 🆕 Yang baru di v2.4 — "Genius Edition"

Formula WCCS dan bobot lima pilar **tetap beku** — semua fitur baru berperan
sebagai lensa, penjaga, atau jembatan. Rincian lengkap di **`CHANGELOG-V2.4.md`**;
ringkasannya:

1. **🗼 Menara Pengawas** — dashboard yang menjaga sendiri. Delapan aturan
   alarm berbasis *transisi* (bunyi saat kondisi MENYEBERANG ambang, bukan saat
   berada di atasnya) dievaluasi tiap siklus refresh yang sama — nol panggilan
   API tambahan. Banner alarm, riwayat lokal, bunyi beep, notifikasi desktop
   (dengan izin), plus alarm harga kustom one-shot yang kamu pasang sendiri.
2. **🗺 Heatmap Pasar** — 100 koin dalam sel berwarna seukuran kapitalisasi,
   toggle interaktif 1j/24j/7h/30h. Dari endpoint yang sudah dipanggil.
3. **📊 Grafik BTC 30 hari** — kurva harga + garis putus-putus level
   support/resistance teruji, dari sumber data yang sama persis dengan panel
   "Level Otomatis".
4. **⚙️ Panel Pengaturan** — API key CoinGecko, interval refresh, notifikasi,
   dan suara diatur dari UI (localStorage), tanpa edit file. Termasuk **Mode
   Eksperimen Bobot**: geser bobot pilar di sandbox, lihat pembandingnya di
   bawah Signal Box — skor resmi, ledger, dan rekam jejak tidak tersentuh.
5. **📰 Pemindai kata kunci berita** — judul berita dicocokkan dengan 10 topik
   yang historis sering menggerakkan harga (ETF, hack, regulasi, Fed, CPI,
   likuidasi…). Pencocokan string pada judul, bukan analisis sentimen.
6. **Brief Studio kini 11 format** — plus **🗓 Rencana Konten** (jadwal posting
   harian untuk admin: brief pagi + jam paling aktif dari heatmap sesi, materi
   adaptif siang, quiz sore, update malam) dan **🗼 Laporan Pengawas** (rekap
   Menara siap-tempel untuk co-admin).
7. **⌨️ Shortcut keyboard**: `B` Brief Studio, `T` Mode Ringkas, `W` Menara,
   `S` Pengaturan, `R` Refresh. Nomor brief di header kini berjalan otomatis
   dari hari pemakaian pertama. Chip versi `v2.4` di toolbar.
8. **🩺 Perekam error boot** — kalau ada file modul yang gagal termuat, banner
   merah menjelaskan masalahnya di layar, bukan mati diam-diam di console.

## Menjalankan secara lokal

File ini pakai ES Modules (`<script type="module">`) — wajib lewat server,
tidak bisa dibuka langsung via `file://`.

```bash
cd ArgonPulse
python3 -m http.server 8080
```

Buka **http://localhost:8080**

## Struktur folder

```
ArgonPulse/
├── index.html
├── css/
│   ├── base.css          reset, variabel warna, tipografi
│   ├── layout.css        grid, breakpoint responsive
│   ├── components.css    kartu, badge, panel, breakdown bars, modal metodologi
│   ├── brief-studio.css  modal Brief Studio
│   ├── lab.css           Lab Analitik v2.3
│   └── v24.css           v2.4 — Menara, Heatmap, Pengaturan
├── js/
│   ├── main.js            orkestrator utama — orkestrasi 5 pilar → WCCS → render
│   ├── config.js           semua endpoint, fallback chain, bobot pilar, ambang
│   ├── utils/
│   │   ├── formatters.js   format mata uang/persen/tanggal/funding rate
│   │   ├── rsi.js           RSI Wilder's Smoothing (bukan SMA)
│   │   ├── dom.js            helper DOM kecil
│   │   ├── svg.js            sparkline, histogram, gauge, heatmap, ruler,
│   │   │                     v2.4: priceChart (grafik 30 hari + level S/R)
│   │   └── cache.js          localStorage + TTL, fallback saat API gagal
│   ├── engine/            — INI JANTUNG METODOLOGI (Bab 2-10 dokumen konsep)
│   │   ├── statistics.js    z-score, winsorization, korelasi, crowdingIntensity()
│   │   ├── baselines.js     baseline (μ,σ) per komponen — statis + live dari ledger
│   │   ├── sign-validation.js  orientasi tanda tiap komponen + status validasi
│   │   ├── wccs.js           agregasi komposit tertimbang (rumus inti)
│   │   ├── confidence.js     Agreement + DataQuality + SampleAdequacy
│   │   ├── divergence.js     deteksi divergensi harga vs on-chain flow (BTC/ETH)
│   │   ├── divergence-scanner.js  pemindaian divergensi di seluruh momentum top-10
│   │   ├── narrative.js      dekomposisi skor → kalimat + falsifiability
│   │   ├── momentum.js       skor momentum token riil (bukan random)
│   │   ├── ledger.js         Historical Ledger — self-backtesting, hit rate, Brier score
│   │   ├── delta.js          "sejak terakhir dibuka" — bandingkan snapshot
│   │   ├── settings.js       v2.4 — pengaturan bertahan-antar-sesi (localStorage)
│   │   ├── watchtower.js     v2.4 — mesin 8 aturan alarm berbasis transisi
│   │   └── news-scan.js      v2.4 — pencocokan kata kunci berita
│   ├── api/
│   │   ├── coingecko.js     harga, chart RSI, market top-100 (Pilar A/B)
│   │   ├── fear-greed.js    Alternative.me (Pilar C)
│   │   ├── onchain.js       mock + adapter Whale Alert (Pilar D)
│   │   ├── derivatives.js   funding+OI, fallback Binance→Bybit→OKX→proxy (Pilar E)
│   │   └── context.js       TVL DeFi + berita (Radar Konteks, non-skor)
│   ├── vendor/
│   │   └── html2canvas.min.js   di-bundle lokal, bukan CDN eksternal
│   └── components/
│       ├── header.js        meta, status badge, session strip, versi
│       ├── metrics.js       4 kartu utama: BTC, ETH, F&G, RSI
│       ├── confluence.js    signal box, breakdown, confidence interval, crowding badge
│       ├── onchain.js       panel aliran on-chain
│       ├── derivatives.js   panel funding rate + OI
│       ├── momentum.js      tabel momentum top-10
│       ├── divergence-flags.js  daftar peringatan dari divergence-scanner
│       ├── track-record.js  panel rekam jejak (hit rate, Brier score, progress baseline)
│       ├── delta-banner.js  banner "sejak terakhir dibuka"
│       ├── context-radar.js panel TVL & berita (overlay non-skor)
│       ├── methodology.js   modal metodologi (bobot, orientasi, rekam jejak, disclaimer)
│       ├── brief-studio.js  modal pabrik konten grup (11 format, editable, tone guard)
│       ├── market-lab.js    v2.3 — panel rezim, breadth, altseason, MTF, korelasi, anomali
│       ├── risk-lab.js      v2.3 — volatilitas, drawdown, level, sesi, posisi, dry powder, kesehatan data
│       ├── scenario-lab.js  v2.3 — simulator what-if + kalkulator ukuran posisi
│       ├── watchtower.js    v2.4 — UI Menara Pengawas: banner, riwayat, alarm harga, beep & notifikasi
│       ├── v24-panels.js    v2.4 — Heatmap Pasar
│       ├── bigchart.js      v2.4 — grafik BTC 30 hari + overlay level
│       ├── settings.js      v2.4 — Panel Pengaturan + baris eksperimen bobot
│       └── screenshot.js    simpan gambar halaman sebagai PNG
└── assets/
```

## Lima Pilar WCCS

| Pilar | Bobot | Komponen | Sumber |
|---|---|---|---|
| A — Price Action | 25% | Return BTC 24h, kekuatan relatif ETH/BTC | CoinGecko |
| B — Momentum Teknikal | 20% | RSI 1H, RSI 4H (Wilder's Smoothing) | CoinGecko OHLC |
| C — Sentimen | 15% | Level F&G, delta 24h | Alternative.me |
| D — On-Chain Flow | 20% | Netflow BTC/ETH ke exchange | Whale Alert (mock default) |
| E — Derivatives & Leverage | 20% | Funding rate, perubahan OI | Binance→Bybit→OKX |

Pilar E memakai transformasi non-linear (`crowdingIntensity()`) karena funding
rate bersifat **kontrarian/mean-reverting**, bukan trend-following seperti
pilar lain — funding ekstrem = sinyal risiko crowding, bukan konfirmasi arah.

## Ketersediaan data — status per hari ini

| Data | Status | Catatan |
|---|---|---|
| Harga, RSI, momentum | ✅ Real, live | CoinGecko, tanpa key |
| Fear & Greed | ✅ Real, live | Alternative.me, tanpa key |
| Funding rate + OI | ✅ Real, live | Binance→Bybit→OKX, tanpa key. Fallback proxy publik dengan disclosure |
| On-chain flow (whale) | 🟡 Mock, adapter siap | Isi API key Whale Alert di `config.js` → `onChain.whaleAlertApiKey`, ganti provider ke `'whalealert'`, lengkapi `fetchWhaleAlert()` di `api/onchain.js` |
| TVL DeFi, berita | ✅ Real, live | DefiLlama + rss2json, non-skor (overlay saja) |
| Rezim, breadth, korelasi, MTF, anomali | ✅ Real, live | Diperas dari `/coins/markets` — nol panggilan tambahan |
| Volatilitas, drawdown, level, sesi | ✅ Real, live | CoinGecko chart 30 hari, cache 10 menit |
| Dominansi & kapitalisasi global | ✅ Real, live | CoinGecko `/global`, tanpa key |
| Rasio long/short | ✅ Real, live | Binance Futures publik, tanpa key |
| Pasokan stablecoin | ✅ Real, live | DefiLlama, tanpa key |
| Konten grup (Brief Studio) | ✅ Turunan penuh | Dibangun dari state render yang sama — tidak ada angka yang dihitung ulang atau dikarang |

## Mengatasi error 429 / "Failed to fetch" / tabel momentum kosong

Kalau tabel momentum sering kosong atau badge "● cached" terus muncul,
penyebabnya hampir pasti rate-limit CoinGecko (HTTP 429) — makin mungkin
terjadi di v2.3 karena jumlah endpoint CoinGecko yang dipanggil tiap siklus
bertambah jadi tujuh (lima dari dashboard inti, dua dari Lab Analitik:
dominansi global & chart 30 hari). Lihat penjelasan lengkap akar masalah dan
perbaikannya di **`CHANGELOG-FIX-429.md`**.

Sejak perbaikan ini, aplikasi otomatis retry dengan backoff dan menjalankan
ketujuh request CoinGecko berurutan (bukan serentak), jadi masalah ini
seharusnya jarang terjadi. Kalau masih sering muncul:

1. **Tutup tab/jendela dashboard lain** yang mungkin masih terbuka — tiap tab
   punya auto-refresh sendiri tiap 60 detik, dua tab aktif = dua kali lipat
   request dari IP yang sama.
2. **Daftar Demo API Key gratis CoinGecko** (opsional tapi disarankan kalau
   sering kena limit):
   - Buka [CoinGecko Developer Dashboard](https://www.coingecko.com/en/developers/dashboard), daftar akun gratis
   - Generate "Demo API Key"
   - Buka `js/config.js`, isi di `coingecko.apiKey`:
     ```js
     coingecko: {
       apiKey: 'CG-xxxxxxxxxxxxxxxxxxxxxxxx', // ganti null jadi key-mu
       // ...
     }
     ```
   - Kuota naik dari rate-limit publik yang ketat menjadi 10.000 calls/bulan
3. Kalau pakai internet seluler Indonesia, banyak operator memakai **CGNAT**
   (satu IP publik dipakai bersama banyak pengguna) — limit CoinGecko per-IP
   bisa habis duluan oleh orang lain di jaringan yang sama. API Key membantu
   karena kuotanya terikat ke akun, bukan ke IP.

## Resiliensi jaringan (Pilar E)

Fallback 5-tingkat sesuai Bab 9.7 dokumen konsep:

1. Binance `fapi` langsung
2. Bybit langsung
3. OKX langsung
4. *(roadmap v2.1 — reverse-proxy sendiri, belum diimplementasi)*
5. CORS proxy publik (`corsproxy.io`, `api.allorigins.win`) — **hanya kalau 1-3 semua gagal**, dan setiap kali dipakai, UI menampilkan badge "⚠ jalur data tidak-utama" + confidence otomatis didiskon. Berbeda dari kompetitor yang memakai proxy publik diam-diam tanpa indikasi ke pengguna.

## Transparansi metodologi

Klik **"ⓘ Metodologi"** di toolbar untuk melihat:
- Bobot tiap pilar & alasan strukturnya
- Orientasi tanda tiap komponen (bullish/bearish arahnya ke mana) + status validasi
- Disclaimer batas kejujuran intelektual

Ini bukan hiasan — setiap kali orientasi/bobot diubah, catat di changelog metodologi
terpisah (lihat Bab 12 dokumen konsep) supaya sejarah keputusan bisa diaudit.

## Fitur baru: sistem yang mengevaluasi dirinya sendiri

Empat fitur di bawah ini menjawab pertanyaan yang selama ini tidak dijawab
dashboard sejenis manapun: *"seberapa akurat sistem ini sebenarnya, dan
apakah dia membaik seiring waktu?"*

### 📊 Rekam Jejak Sinyal (self-backtesting)

Setiap kali dashboard menghitung dan menampilkan sinyal, sistem mencatatnya
ke `localStorage` beserta harga BTC/ETH saat itu. Begitu 24 jam berlalu dan
kamu membuka dashboard lagi, sistem otomatis mengecek: apakah arah yang
diprediksi (bullish/bearish) sesuai dengan pergerakan harga yang sebenarnya
terjadi? Dari situ dihasilkan dua angka:

- **Hit rate** — persentase sinyal yang arahnya benar
- **Brier score** — seberapa "terkalibrasi" tingkat keyakinan sistem (0 = sempurna, 1 = terburuk)

Klik **"📊 Rekam Jejak Sinyal →"** untuk melihatnya. Minimal 5 sinyal
terevaluasi dibutuhkan sebelum angka ini ditampilkan — di bawah itu, sistem
jujur bilang "belum cukup data" alih-alih memaksakan statistik dari sampel
terlalu kecil. Ini murni personal per-perangkat (localStorage browser kamu),
bukan agregat dari pengguna lain.

### 🎯 Baseline yang belajar sendiri seiring waktu

Baseline pembanding untuk z-score awalnya memakai estimasi statis (lihat
`engine/baselines.js`). Begitu cukup observasi historis terkumpul di Rekam
Jejak (≥20 untuk komponen harga BTC), sistem **otomatis** beralih memakai
baseline yang dihitung dari data riil hasil pemakaian aplikasi ini sendiri —
tanpa perlu diaktifkan manual. Progress menuju ini terlihat di panel Rekam
Jejak maupun panel Metodologi.

### ↻ "Sejak terakhir dibuka" (Delta Engine)

Banner ungu di bawah toolbar (kalau ada perubahan berarti) menunjukkan apa
yang bergeser sejak kunjungan sebelumnya — status confluence, pergerakan
BTC/ETH, atau perubahan Fear & Greed — supaya kamu yang cek dashboard
beberapa kali sehari tidak perlu membaca ulang semuanya dari nol.

### 🔍 Pemindaian pola di seluruh 10 koin momentum

Selain deteksi divergensi harga-vs-flow untuk BTC/ETH (Bab 6), sistem
sekarang juga memindai seluruh tabel momentum untuk dua pola yang secara
statistik lebih rentan berbalik arah: kenaikan harga yang belum diikuti
partisipasi pasar luas, dan pergerakan yang whipsaw tinggi (naik-turun liar)
meski skor momentumnya tinggi. Muncul sebagai catatan ringan di bawah tabel
momentum, bukan alarm besar — sekadar hal tambahan untuk diperhatikan.

## 🔬 Lab Analitik (v2.3) — delapan belas pembacaan tambahan

Semua fitur di bawah ini dibangun dari sumber data yang **gratis dan tanpa API
key**, dan — ini bagian yang penting — hampir semuanya tidak menambah beban
rate-limit sama sekali.

### Biaya data: dua panggilan, delapan belas fitur

| Sumber | Tambahan panggilan | Catatan |
|---|---|---|
| `/coins/markets` | **0** | Parameter diperluas jadi `sparkline=true&price_change_percentage=1h,24h,7d,30d`. Endpoint yang sama, sudah dipanggil sejak v2.0 — kini memberi 168 titik harga per koin plus empat horizon return, gratis. Ini yang menyalakan breadth, korelasi, grid MTF, altseason, dan anomali turnover sekaligus. |
| `/fng/?limit=30` | **0** | Naik dari `limit=2`. Panggilan yang sama persis, tapi memberi sejarah sentimen sebulan. |
| `/global` | +1 | Dominansi BTC/ETH, kapitalisasi total. Cache 2 menit. |
| `/coins/bitcoin/market_chart?days=30` | +1 | ~720 titik per jam. **Cache 10 menit** — data sebulan tidak berubah dalam hitungan menit, jadi efektifnya ~0,1 panggilan/menit. |
| Binance long/short ratio | +2 | Kuota terpisah dari CoinGecko. Cache 5 menit. |
| DefiLlama stablecoin | +1 | Kuota terpisah. Cache 30 menit. |

### Yang ditambahkan

**1. Detektor Rezim Pasar.** Menamai kondisi pasar dari empat sumbu —
tekanan volatilitas, lebar partisipasi, posisi terhadap puncak bulanan, dan
arah rotasi modal — jadi salah satu dari: *Ekspansi Berisiko-On, Kontraksi
Berisiko-Off, Gejolak Tanpa Arah, Rotasi ke Altcoin, Konsolidasi Defensif,
Tenang Menekan,* atau *Campuran/Transisi*. Ini menjawab pertanyaan yang
seharusnya datang **sebelum** "arahnya ke mana": RSI 72 dalam rezim ekspansi
adalah hal biasa; RSI 72 yang sama saat mayoritas koin melemah adalah anomali.
Angkanya identik, artinya tidak.

**2. Lebar Pasar (breadth).** Persentase koin top-100 yang ikut naik di 24 jam,
7 hari, dan 30 hari, plus histogram sebaran return dan angka dispersi. Ini yang
memisahkan "indeks hijau karena tiga nama besar" dari "indeks hijau karena
delapan puluh koin ikut bergerak" — dua kondisi yang terlihat identik di grafik
BTC tapi berbeda jauh kerapuhannya.

**3. Barometer Altseason.** Berapa persen dari top-50 yang mengungguli BTC
dalam 30 hari, dengan gauge dan daftar pemimpin rotasi. Ditampilkan bersama
dominansi BTC/ETH dan kapitalisasi total.

**4. Grid Multi-Timeframe.** Return 1 jam / 24 jam / 7 hari / 30 hari untuk
sepuluh koin momentum, sebagai heatmap, plus jarak masing-masing dari ATH-nya.
Koin yang keempat horizonnya searah ditandai — keselarasan lintas waktu adalah
bentuk konfluensi juga, hanya pada sumbu yang berbeda.

**5. Matriks Korelasi & Diversifikasi Semu.** Korelasi Pearson antar delapan
koin teratas, dihitung dari 168 titik harga per jam yang ikut datang di
`sparkline_in_7d`. Pasangan dengan korelasi ≥0,85 ditandai eksplisit sebagai
"praktis satu posisi yang sama". Ini informasi yang biasanya hanya ada di
terminal berbayar, dan ia membongkar kesalahan mahal: merasa terdiversifikasi
karena memegang delapan koin yang ternyata bergerak identik.

**6. Pemindai Anomali Turnover.** Volume dibagi kapitalisasi, di-log-transform
lalu di-z-score terhadap seluruh universe. Yang paling berharga adalah tanda
**"ramai tapi harga diam"**: perpindahan tangan jauh di atas kebiasaan
sementara harga hampir tidak bergerak.

**7. Volatilitas Terealisasi + Persentil.** Disetahunkan dari return per jam,
dengan jendela 7 hari digulirkan sepanjang sebulan untuk menghasilkan
persentil. Yang mengubah "volatilitas 52%" jadi kalimat yang berarti. Plus
terjemahan praktisnya: berapa dolar pergerakan harian BTC yang masih tergolong
kebisingan normal.

**8. Drawdown + Kurva Underwater.** Jarak dari puncak 30 hari, terdalam
sebulan, jarak dari ATH, dan berapa lama sudah terbenam.

**9. Level Otomatis.** Support/resistance dari pivot yang benar-benar teruji
harga: cari titik yang lebih tinggi/rendah dari 8 titik di kiri-kanannya,
kelompokkan yang berjarak <0,8%, urutkan berdasarkan **jumlah sentuhan**.
Metodenya sederhana dan bisa diaudit — dan klaimnya terbatas: ini tempat harga
pernah berbalik, bukan tempat harga akan berbalik.

**10. Heatmap Sesi & Hari.** Kontribusi pergerakan per sesi (Asia/Eropa/
Amerika/Malam, dengan jam WIB) dan per hari dalam sepekan, dari 30 hari data
per jam. Berguna praktis untuk admin grup: jam berapa brief paling relevan
diposting.

**11. Posisi Leverage — Ritel vs Top Trader.** Rasio long/short dari data
publik Binance Futures, dipisah antara akun ritel dan akun trader terbesar.
Selisih keduanya adalah angka paling menarik di sini: saat kelompok besar
duduk lebih ringan daripada ritel, sisi yang ramai jadi bahan bakar likuidasi
paling murah.

**12. Dry Powder — Pasokan Stablecoin.** Total stablecoin beredar dan
perubahannya 7/30 hari, dari DefiLlama. Proksi untuk modal yang sudah masuk
ekosistem tapi belum dibelanjakan.

**13. Simulator "Bagaimana Kalau".** Geser harga BTC, sentimen, atau funding,
lalu lihat WCCS dihitung ulang seketika **dengan mesin yang sama persis**.
Gunanya bukan meramal — tapi membuat sensitivitas skor jadi terlihat. Setelah
menggeser slider tiga kali kamu tahu seberapa jauh harga harus bergerak sebelum
kategorinya berubah, dan itu pemahaman yang tidak bisa diberikan angka diam.

**14. Kalkulator Ukuran Posisi.** Aritmetika manajemen risiko, bukan saran.
Jarak stop terisi otomatis dari volatilitas terealisasi hari ini. Menampilkan
ukuran posisi, kerugian bila stop kena, leverage setara, **matematika
pemulihan** (rugi 50% butuh naik 100%), dan berapa kerugian beruntun sebelum
modal terpangkas separuh.

**15. Panel Kesehatan Data.** Status 15 sumber data: hidup, terbatas, atau
gagal — beserta alasannya. Ada karena dashboard yang tetap terlihat rapi saat
separuh sumbernya mati lebih berbahaya daripada dashboard yang jujur bilang
sedang pincang.

**16. Riwayat Skor WCCS.** Sparkline skor sistem ini sendiri selama 7 hari dari
ledger lokal, plus berapa kali klasifikasi berganti — ukuran kestabilan
pembacaan.

**17. Akurasi per Rezim.** Rekam jejak kini dipecah berdasarkan rezim pasar
saat sinyal dicatat. Pertanyaan yang jauh lebih berguna daripada hit rate
tunggal: bukan "seberapa akurat sistem ini", tapi "di kondisi seperti apa
sistem ini bisa dipercaya". Ditahan sampai tiap rezim punya minimal 5 sampel.

**18. Format konten ke-9: Laporan Struktur Pasar.** Postingan tengah pekan yang
membahas kerangka pasar alih-alih arah harian — rezim, breadth, rotasi modal,
korelasi, volatilitas, level, posisi, likuiditas. Plus enam materi edukasi dan
enam soal quiz baru yang dibangun dari data ini, semuanya masuk ke Brief Studio.

### Keputusan metodologis yang paling penting di v2.3

**Tidak satu pun dari delapan belas fitur di atas masuk ke dalam formula WCCS.**
Bobot lima pilar tetap persis 25/20/15/20/20 seperti sejak v2.0.

Ini bukan kemalasan — ini konsekuensi dari punya rekam jejak. Menambahkan
variabel ke dalam skor berarti seluruh hit rate dan Brier score yang sudah
terkumpul tidak lagi sebanding dengan yang baru, dan rekam jejak yang tidak
sebanding sama saja dengan tidak punya rekam jejak. Jadi semua analitik v2.3
berperan sebagai **lensa untuk membaca skor, bukan bahan skor**.

Satu-satunya pengecualian adalah penambahan *metadata*: label rezim ikut
dicatat ke ledger, supaya ke depan bisa dijawab pertanyaan "sistem ini lebih
akurat di rezim yang mana". Perhitungannya tidak berubah sedikit pun.

### Tone Guard sekarang sadar negasi

Audit v2.3 menemukan Tone Guard menandai kalimat edukasi yang benar sebagai
pelanggaran — "Overbought **bukan sinyal jual**" ditolak karena mengandung
frasa "sinyal jual". Peringatan palsu seperti itu melatih admin mengabaikan
peringatan, yang justru membatalkan gunanya.

Sekarang guard memeriksa 40 karakter sebelum tiap frasa: kalau didahului
*bukan / tidak / belum / jangan / tanpa / tak / mustahil* dalam jendela dua
kata, itu pengingkaran dan bukan pelanggaran. Daftar penanda probabilistik juga
diperluas dari 11 ke 22 pola. Diuji dengan sepuluh kasus batas — termasuk
memastikan "Tidak ada yang bisa menjamin, tapi ini pasti naik" **tetap**
tertangkap.

## 📣 Brief Studio — dari dashboard ke grup dalam satu klik

Dashboard ini sudah menghitung semuanya dengan jujur. Tapi yang dibutuhkan admin
grup tiap pagi bukan dashboard — melainkan **teks yang tinggal ditempel**. Brief
Studio menutup jarak terakhir itu.

Klik **"📣 Brief Studio"** di toolbar untuk membuka sebelas format konten yang
dibangun dari pengambilan data yang sama persis dengan yang sedang tampil di
layar. Artinya teks yang kamu posting tidak akan pernah berbeda dari screenshot
yang menyertainya — masalah klasik ketika admin menyalin angka manual sambil
data di-refresh di latar belakang.

| Format | Untuk apa | Batas |
|---|---|---|
| 📣 **Brief Lengkap** | Postingan utama pagi di Telegram — 5 pilar dibuka semua | 4096 |
| 💬 **Brief Ringkas** | WhatsApp, muat jadi caption gambar | 1024 |
| 🖼 **Caption** | Pasangan teks untuk PNG dari tombol screenshot | 1024 |
| ↻ **Update Intraday** | Posting kedua/ketiga — hanya yang berubah, dari Delta Engine | 1024 |
| 📚 **Edukasi** | Materi harian yang dipilih **adaptif** ke kondisi pasar hari ini | 4096 |
| 🧠 **Quiz** | Pertanyaan yang dibangun dari angka riil hari ini + kunci & penjelasan | 4096 |
| 📊 **Poll** | Pemancing diskusi — soal cara berpikir, bukan tebak arah harga | 1024 |
| 🗓 **Scorecard** | Rekap 7 hari dari Historical Ledger yang nyata | 4096 |
| 📐 **Struktur Pasar** | Laporan kerangka pasar dari Lab Analitik · mingguan | 4096 |
| 🗓 **Rencana Konten** *(v2.4)* | Jadwal posting hari ini untuk admin — jam aktif dari heatmap sesi, materi adaptif, update wajib | 4096 |
| 🗼 **Laporan Pengawas** *(v2.4)* | Rekap Menara Pengawas siap-tempel untuk co-admin | 4096 |

### Yang membedakannya dari sekadar template

**Edukasi memilih dirinya sendiri.** Pustakanya berisi 18 materi, dan yang
ditampilkan bukan urutan acak — melainkan yang paling relevan dengan apa yang
sedang terjadi di layar. Funding rate masuk zona crowded hari ini? Materinya
otomatis jadi "Funding Rate Tinggi Bukan Berarti Tren Makin Kuat", lengkap
dengan angka hari ini sebagai contoh. RSI di atas 70? Materinya berganti ke
"Overbought Bukan Sinyal Jual". Kalau tidak ada pemicu khusus, ia jatuh ke
rotasi harian deterministik. Member belajar konsep yang contohnya sedang
terjadi di depan mata — bukan teori generik.

**Quiz-nya memakai angka hari ini.** Pertanyaan disusun dari RSI, funding rate,
Fear & Greed, dan skor confluence yang benar-benar tampil pagi itu. Member yang
membaca brief punya keuntungan menjawab — itu disengaja, quiz adalah insentif
supaya brief-nya dibaca sampai habis.

**Rotasi harian bersifat deterministik.** Materi berganti tiap hari tapi bisa
direproduksi: buka dashboard tiga kali dalam sehari, kamu dapat materi yang
sama, bukan undian baru tiap refresh. Tombol 🔀 tersedia kalau kamu ingin
menggeser ke materi lain secara manual.

**Ketidakjujuran data ikut terbawa ke teks.** Kalau on-chain masih memakai data
simulasi, atau derivatives lewat jalur cadangan, peringatan itu muncul di
postingan — bukan cuma di UI dashboard yang tidak ikut ter-copy. Batas kejujuran
tidak berhenti di layar admin.

### 🛡 Tone Guard — lint untuk bahasa, bukan untuk kode

Angka boleh sejujur apa pun, tapi begitu ia jadi kalimat yang diposting ke grup,
risikonya berpindah: kalimat bisa terbaca sebagai janji. Tone Guard memeriksa
setiap teks sebelum disalin:

1. **Kata terlarang** — "pasti", "dijamin", "all in", "buy now", "target harga",
   "sinyal beli/jual", dan pola sejenis. Yang ditandai adalah klaim, bukan akar
   katanya: "kepastian" dan "pastikan" lolos, "pasti" tidak.
2. **Bahasa probabilistik** — kalau nol penanda ("cenderung", "indikasi",
   "berisiko") di teks panjang, Studio memberi tahu bahwa teksnya terbaca lebih
   yakin daripada datanya.
3. **Disclaimer** — wajib ada, dicek keberadaannya.

Teks bisa **disunting langsung di Studio**, dan Tone Guard berjalan ulang setiap
kali kamu mengetik — jadi kalau kamu menambahkan kalimat yang menjanjikan
sesuatu, peringatannya muncul seketika, bukan setelah terlanjur diposting.
Tone Guard tidak pernah memblokir apa pun; keputusan akhir tetap di tangan admin.

### Alur pagi yang disarankan

1. Buka dashboard, biarkan datanya selesai memuat
2. **🖼 Simpan Gambar Halaman** → dapat PNG
3. **📣 Brief Studio** → tab *Caption* → salin → posting PNG + caption
4. Tab *Brief Lengkap* → salin → posting sebagai pesan kedua, pin
5. Tab *Edukasi* atau *Quiz* → posting siang/sore sebagai pemancing diskusi
6. Sore hari: buka lagi → tab *Update Intraday* → posting apa yang berubah
7. Akhir pekan: tab *Scorecard* → rekap 7 hari apa adanya, termasuk pekan yang jelek

Tombol **📦 Unduh paket lengkap (.md)** menyimpan semuanya sekaligus dalam satu
file — berguna kalau kamu menyiapkan konten sehari penuh sekali duduk. Suntingan
yang sudah kamu buat di Studio ikut terbawa ke paket, bukan draf mentahnya.

## Extract All Data (simpan .txt)

Tombol **"📤 Extract All Data"** di toolbar men-generate ringkasan teks lengkap
(harga, status confluence, 5 pilar, aliran on-chain, momentum top-10) dan
otomatis menyimpannya sebagai file `.txt` — bukan disalin ke clipboard —
supaya bisa langsung diunggah ke grup Telegram/WhatsApp sebagai lampiran.
Nama file otomatis: `ArgonPulse-confluence-brief-YYYYMMDD-HHMM.txt`.

## Simpan gambar halaman (screenshot)

Tombol **"🖼 Simpan Gambar Halaman"** di paling bawah men-generate file PNG dari
seluruh dashboard (via `html2canvas`, di-bundle lokal di `js/vendor/`, bukan
CDN eksternal — supaya tidak bergantung uptime pihak ketiga saat dijalankan
dari `python -m http.server` di jaringan lokal). Hasilnya otomatis terunduh
dengan nama `ArgonPulse-confluence-brief-YYYYMMDD-HHMM.png`, siap diunggah ke
grup selain teks yang tersimpan dari "Extract All Data".

Kalau Mode Ringkas sedang aktif, screenshot mengikuti tampilan Mode Ringkas
(bukan dashboard lengkap) — karena html2canvas menangkap apa yang benar-benar
terlihat di layar saat itu, bukan konten yang sedang disembunyikan CSS.

## Kustomisasi cepat

- **Ganti bobot pilar**: `js/config.js` → `WEIGHTS.pillars` *(atau uji dulu di sandbox: ⚙️ Pengaturan → Mode Eksperimen Bobot — tanpa menyentuh skor resmi)*
- **API key CoinGecko tanpa edit file**: klik **⚙️ Pengaturan** di toolbar (tersimpan di browser) — atau cara lama di `js/config.js` → `coingecko.apiKey`
- **Aturan & ambang Menara Pengawas**: `js/config.js` → `THRESHOLDS` (`watchBtcMovePct`, `watchFgExtreme`) + aturan di `js/engine/watchtower.js`
- **Topik kata kunci berita**: `js/config.js` → `NEWS_KEYWORDS`
- **Interval refresh & notifikasi**: klik **⚙️ Pengaturan** — berlaku seketika
- **Ganti ambang crowding/divergensi**: `js/config.js` → `THRESHOLDS`
- **Aktifkan on-chain real**: lihat komentar di `js/api/onchain.js`
- **Ganti baseline z-score**: `js/engine/baselines.js` → `STATIC_BASELINES`
- **Tambah materi edukasi**: `js/engine/content-generator.js` → `PUSTAKA_EDUKASI` (isi `pemicu` dengan kondisi yang membuat materi itu relevan, atau `() => false` kalau cukup lewat rotasi)
- **Tambah soal quiz**: `js/engine/content-generator.js` → `bankQuiz()`
- **Tambah/ubah kata terlarang**: `js/engine/tone-guard.js` → `FORBIDDEN` (pengingkaran ditangani otomatis lewat `NEGASI`)
- **Ambang analitik v2.3**: `js/config.js` → `THRESHOLDS` (`breadthNarrow`, `altseasonThreshold`, `volPercentileHigh`, `turnoverAnomalyZ`, `correlationHigh`)
- **Aturan klasifikasi rezim**: `js/engine/regime.js` → `detectRegime()`

## Batas kejujuran

WCCS tidak memprediksi pasar. Ia cara yang lebih disiplin dan transparan untuk
merangkum informasi publik yang sudah tersedia. Edukasi, bukan financial advice.
DYOR.
