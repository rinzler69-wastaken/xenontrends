/**
 * config.js — satu sumber kebenaran untuk semua endpoint, fallback chain,
 * dan konstanta metodologi (bobot pilar, threshold, dsb).
 *
 * Struktur ini mengikuti Bab 9 (Arsitektur Data Real) dan Bab 5 (Skema
 * Pembobotan) dari dokumen konsep ArgonPulse v2 "The Confluence Engine".
 */

export const BRAND = {
  name: 'ArgonPulse⚡',
  tagline: 'The Confluence Engine',
  // Ditimpa saat runtime oleh ledgerBriefNumber() (main.js) — nomor brief
  // sekarang dihitung dari hari pemakaian pertama di perangkat ini, bukan
  // konstanta mati. Fallback 1 untuk pengguna baru.
  briefNumber: 1
};

// v2.4 — versi aplikasi, ditampilkan di header & footer.
export const VERSION = '2.4';

export const CONFIG = {
  refreshMs: 60_000,
  cacheKey: 'ic_cache_v2',
  cacheTtlMs: 90_000,
  rsiPeriod: 14,

  // ---------------------------------------------------------------
  // PILAR A/B — CoinGecko (harga, histori untuk RSI, market top-100)
  // ---------------------------------------------------------------
  coingecko: {
    // Opsional tapi SANGAT disarankan kalau sering kena error 429 "Too Many
    // Requests" atau tabel momentum sering kosong/pakai cache lama. Daftar
    // gratis di https://www.coingecko.com/en/developers/dashboard, generate
    // "Demo API Key", lalu isi string-nya di sini. Kuota naik dari rate-limit
    // publik yang sangat ketat menjadi 10.000 calls/bulan per akun.
    // Lihat README bagian "Mengatasi error 429 / Failed to fetch".
    // v2.4 — key sudah terpasang (Demo plan, 10.000 calls/bulan). JANGAN
    // sebarkan zip ini ke publik begitu key tertanam di dalamnya.
    apiKey: 'CG-a5CC1e3oVJxWMUZ9nSZkZ72z',
    price: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd&include_24hr_change=true',
    btcChart1h: 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1',
    btcChart4h: 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7',
    ethChart1h: 'https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=1',
    // v2.3 — endpoint yang sama, parameter diperluas. sparkline_in_7d dan
    // price_change_percentage multi-timeframe datang GRATIS dalam satu
    // panggilan yang sudah kita lakukan, jadi delapan fitur analitik baru
    // tidak menambah beban rate-limit sama sekali.
    markets: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=1h,24h,7d,30d',
    btcChart30d: 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=30',
    global: 'https://api.coingecko.com/api/v3/global'
  },

  // ---------------------------------------------------------------
  // PILAR C — Alternative.me Fear & Greed
  // ---------------------------------------------------------------
  // limit dinaikkan dari 2 ke 30: panggilan yang sama persis, tapi memberi
  // sejarah sentimen sebulan untuk sparkline & deteksi persistensi rezim.
  fearGreed: 'https://api.alternative.me/fng/?limit=30',

  // ---------------------------------------------------------------
  // PILAR D — On-chain flow (Bab 9.2). 'mock' aktif secara default;
  // ganti onChainProvider ke 'whalealert' + isi apiKey ketika siap.
  // ---------------------------------------------------------------
  onChain: {
    provider: 'mock',       // 'mock' | 'whalealert'
    whaleAlertApiKey: null,
    whaleAlertBase: 'https://api.whale-alert.io/v1/transactions'
  },

  // ---------------------------------------------------------------
  // PILAR E — Derivatives: funding rate + open interest (Bab 9.5).
  // Fallback 3-tingkat LANGSUNG (tanpa proxy): Binance → Bybit → OKX.
  // Tingkat 4/5 (reverse-proxy sendiri / CORS proxy publik) didefinisikan
  // terpisah di fallback.js supaya mudah diaudit & diganti.
  // ---------------------------------------------------------------
  derivatives: {
    binance: {
      funding: 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1',
      openInterest: 'https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT',
      openInterestHist: 'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=25',
      // v2.3 — posisi ritel vs top trader. Publik, tanpa key.
      globalLongShort: 'https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=24',
      topLongShort: 'https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=1h&limit=24'
    },
    bybit: {
      funding: 'https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=1',
      openInterest: 'https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=25'
    },
    okx: {
      funding: 'https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP',
      openInterest: 'https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP'
    }
  },

  // ---------------------------------------------------------------
  // RADAR KONTEKS (Bab 9.6) — TIDAK masuk skor WCCS, overlay saja
  // ---------------------------------------------------------------
  context: {
    defiLlamaTvl: 'https://api.llama.fi/v2/historicalChainTvl',
    newsRss2Json: 'https://api.rss2json.com/v1/api.json?rss_url=https://cointelegraph.com/rss',
    // v2.3 — pasokan stablecoin sebagai proksi "dry powder" (likuiditas
    // yang siap masuk pasar). DefiLlama, gratis, tanpa key.
    stablecoinChart: 'https://stablecoins.llama.fi/stablecoincharts/all'
  }
};

// =====================================================================
// SKEMA PEMBOBOTAN — Bab 5.1 dokumen konsep
// Bobot berjenjang: pilar dulu, lalu dibagi rata di dalam pilar.
// =====================================================================
export const WEIGHTS = {
  pillars: { A: 0.25, B: 0.20, C: 0.15, D: 0.20, E: 0.20 },
  components: {
    A1: 0.5, A2: 0.5,   // dalam Pilar A
    B1: 0.5, B2: 0.5,   // dalam Pilar B
    C1: 0.5, C2: 0.5,   // dalam Pilar C
    D1: 0.5, D2: 0.5,   // dalam Pilar D
    E1: 0.5, E2: 0.5    // dalam Pilar E
  }
};

// Rolling baseline window untuk z-score (Bab 4.1)
export const ZSCORE_WINDOW_DAYS = 90;

// Ambang divergensi (Bab 6.1) & crowding (Bab 4.5)
export const THRESHOLDS = {
  divergenceZ: 0.5,
  // v2.3 — ambang analitik overlay (TIDAK mengubah formula WCCS)
  breadthNarrow: 40,      // <40% koin naik = rally sempit
  breadthBroad: 65,       // >65% koin naik = partisipasi luas
  altseasonThreshold: 60, // >60% koin outperform BTC 30d = musim alt
  volPercentileHigh: 75,  // persentil realized vol yang dianggap tinggi
  volPercentileLow: 25,
  turnoverAnomalyZ: 1.8,  // z-score turnover yang dianggap tidak biasa
  correlationHigh: 0.85,  // di atas ini, dua aset praktis satu posisi
  crowdingZ: 1.5,
  crowdingPenaltyRate: 0.3,
  correlationRedundancy: 0.75,
  // v2.4 — ambang Menara Pengawas. Semua berbasis TRANSISI (keadaan sebelum
  // → sesudah), jadi alarm bunyi saat kondisi MENYEBERANG ambang, bukan saat
  // kondisi sedang berada di atasnya — itu yang membedakan penjaga dari alarm
  // yang menjerit terus-menerus.
  watchBtcMovePct: 5,     // pergerakan 24j BTC menyebret ±5%
  watchFgExtreme: 75      // F&G menyebret 75 / 25
};

// v2.4 — leksikon pemindai kata kunci berita. Pencocokan judul berita RSS
// terhadap topik yang SECARA HISTORIS sering menggerakkan harga. Ini
// pencocokan STRING, bukan analisis sentimen — klaimnya sebatas "judul ini
// menyentuh topik yang sering berdampak", bukan "berita ini bullish".
export const NEWS_KEYWORDS = [
  { kata: ['etf'], topik: 'ETF', dampak: 'aliran modal institusi' },
  { kata: ['hack', 'exploit', 'drain', 'berjar'], topik: 'Insiden keamanan', dampak: 'tekanan jual aset terdampak' },
  { kata: ['sec ', ' sec', 'sued', 'gugat', 'lawsuit'], topik: 'Regulasi/litigasi AS', dampak: 'ketidakpastian regulasi' },
  { kata: ['rate cut', 'rate hike', 'fed ', 'the fed', 'fomc', 'powell'], topik: 'Kebijakan moneter AS', dampak: 'likuiditas makro' },
  { kata: ['inflation', 'inflasi', 'cpi'], topik: 'Data inflasi', dampak: 'ekspektasi suku bunga' },
  { kata: ['approval', 'approve', 'disetujui'], topik: 'Persetujuan regulator', dampak: 'potensi aliran masuk' },
  { kata: ['ban', ' melarang', 'ban '], topik: 'Larangan', dampak: 'risiko akses pasar' },
  { kata: ['halving'], topik: 'Halving', dampak: 'dinamika pasokan BTC' },
  { kata: ['liquidation', 'likuidasi'], topik: 'Likuidasi besar', dampak: 'tekanan harga jangka pendek' },
  { kata: ['upgrade', 'mainnet', 'fork', 'shapella', 'dencun'], topik: 'Peningkatan jaringan', dampak: 'fundamental protokol' }
];
