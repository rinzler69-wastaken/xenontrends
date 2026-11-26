# Perbaikan: Error 429 / "Failed to fetch" / Tabel Momentum Kosong (Cache Lama)

**Versi:** v2.3 · **Gejala:** tabel momentum (10 koin) tidak terisi, UI
menampilkan badge "● cached" terus-menerus, data terasa basi.

## Diagnosis

CoinGecko public API menerapkan *burst limit* per-IP yang ketat — menembak
beberapa endpoint CoinGecko secara bersamaan memicu HTTP 429 "Too Many
Requests". Masalah ini pernah diperbaiki sebelumnya (lihat riwayat perbaikan
versi sebelum v2.3), tapi **ikut hilang saat fitur-fitur baru v2.3
ditambahkan** (Brief Studio, Market Lab, Risk Lab, Scenario Lab, dan empat
sumber data tambahan di `api/market-extra.js`), karena `api/coingecko.js`
yang dipakai di v2.3 adalah versi lama (pre-perbaikan) tanpa retry/backoff.

Lebih parah lagi, v2.3 menambah **dua panggilan CoinGecko baru**
(`fetchGlobal()` dan `fetchBtcChart30d()` di `api/market-extra.js`), sehingga
total menjadi **tujuh endpoint CoinGecko** yang dulu ditembak bersamaan lewat
satu `Promise.allSettled` di `js/main.js`:

```js
// SEBELUM — 7 request ke api.coingecko.com ditembak dalam milidetik yang sama
await Promise.allSettled([
  fetchPrices(), fetchBtcChart1h(), fetchBtcChart4h(), fetchEthChart1h(),
  fetchMarkets(),                              // <- coingecko.js, 5 endpoint
  fetchFearGreed(), fetchOnChainFlow(), /* ... domain lain, aman ... */
  fetchGlobal(), fetchBtcChart30d(),            // <- market-extra.js, +2 endpoint CoinGecko
  fetchLongShortRatio(), fetchStablecoinSupply()
]);
```

`fetchMarkets()` (sumber tabel momentum, payload paling besar) paling sering
jadi korban karena biasanya diproses terakhir oleh server CoinGecko saat
limit sudah tersentuh oleh enam request lainnya. Begitu gagal, UI fallback
ke cache localStorage terakhir — persis gejala yang dilaporkan.

## Perbaikan yang diterapkan

### 1. `js/api/coingecko.js` — retry otomatis + diekspor untuk dipakai bersama

`fetchWithRetry()` sekarang **diekspor** (`export async function
fetchWithRetry`), bukan fungsi privat — supaya `api/market-extra.js` bisa
memakai logika penanganan 429 yang sama, bukan menulis `fetch()` polos
sendiri. Kalau kena 429: otomatis menunggu dengan exponential backoff
(1s → 2s → 4s), atau mengikuti header `Retry-After` dari server kalau ada,
maksimal 3x percobaan ulang. Sudah diuji dengan mock fetch yang mensimulasikan
429 di kedua jalur (langsung dan lewat market-extra.js) — keduanya bekerja
sesuai desain.

### 2. `js/api/market-extra.js` — `fetchGlobal()` dan `fetchBtcChart30d()` ikut menangani 429

`cachedJson()` (cache per-endpoint dengan TTL masing-masing, yang memang
sudah ada untuk fitur v2.3) sekarang punya parameter `isCoinGecko` — kalau
`true`, memakai `fetchWithRetry` dari `coingecko.js` alih-alih `fetch()`
polos. Endpoint non-CoinGecko (`fetchLongShortRatio` ke Binance,
`fetchStablecoinSupply` ke DefiLlama) tidak berubah — domain berbeda,
rate-limit independen, tidak perlu penanganan 429 khusus CoinGecko.

### 3. `js/main.js` — SEMUA 7 panggilan CoinGecko dijalankan berurutan

`fetchCoinGeckoSequential()` menjalankan ketujuh panggilan CoinGecko
(`prices`, `btc1h`, `btc4h`, `eth1h`, `markets`, `global`, `chart30d`) satu
per satu dengan jeda 400ms antar-panggilan (total ~2.4 detik tambahan).
Sumber dari domain lain (Alternative.me, Binance, DefiLlama, rss2json) tetap
paralel seperti sebelumnya. Bentuk hasil (`{status, value}` /
`{status, reason}`) dijaga identik dengan `Promise.allSettled` native, supaya
panel "Kesehatan Data" yang membaca `.status` tiap sumber tetap bekerja tanpa
perubahan lain.

### 4. `js/config.js` — dukungan Demo API Key opsional

Field `CONFIG.coingecko.apiKey` (default `null`). Kalau diisi dengan Demo
API Key gratis dari CoinGecko, kuota naik dari rate-limit publik yang ketat
menjadi 10.000 calls/bulan.

## Yang TIDAK diubah

Semua fitur analitik v2.3 (Brief Studio, Market Lab, Risk Lab, Scenario Lab,
breadth, correlation, regime, volatility, dst.) dan seluruh 5 pilar WCCS
beserta formulanya tidak tersentuh. Jumlah koin yang ditarik untuk momentum
tetap top-100. Cache per-endpoint di `market-extra.js` (TTL 2 menit untuk
global, 10 menit untuk chart 30 hari) tetap seperti semula — perbaikan ini
murni soal *bagaimana* dan *kapan* request CoinGecko dikirim.

## Kalau masih sering kena 429 setelah perbaikan ini

1. Pastikan hanya satu tab/jendela browser yang membuka dashboard secara
   bersamaan — tiap tab auto-refresh sendiri tiap 60 detik.
2. Daftar Demo API Key gratis CoinGecko (lihat README).
3. Kalau pakai jaringan seluler Indonesia dengan CGNAT, limit per-IP bisa
   habis duluan oleh pengguna lain di jaringan yang sama — API Key membantu
   karena kuotanya terikat ke akun, bukan ke IP.
