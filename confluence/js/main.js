/**
 * main.js — entry point. Menyatukan config → api → engine → components.
 * Ini adalah implementasi konkret dari diagram alir Bab 2.3 dokumen konsep:
 * Sumber Data → Normalisasi → Sign-Validation → Agregasi → Confidence →
 * Dekomposisi Naratif.
 */
import { CONFIG, BRAND, VERSION } from './config.js';
import { $ } from './utils/dom.js';
import { formatCurrency, formatCompact, formatPercent, formatDateID, fgClassify, formatFundingRate } from './utils/formatters.js';
import { calcRSIWilder } from './utils/rsi.js';
import { saveCache, loadCache } from './utils/cache.js';

import { fetchPrices, fetchBtcChart1h, fetchBtcChart4h, fetchEthChart1h, fetchMarkets } from './api/coingecko.js';
import { fetchFearGreed } from './api/fear-greed.js';
import { fetchOnChainFlow } from './api/onchain.js';
import { fetchFundingAndOI, fetchOIChange } from './api/derivatives.js';
import { fetchDefiTvl, fetchNews } from './api/context.js';
import { fetchGlobal, fetchBtcChart30d, fetchLongShortRatio, fetchStablecoinSupply, cacheAgeSec } from './api/market-extra.js';

import { computeWCCS, classifyWCCS } from './engine/wccs.js';
import { computeConfidence } from './engine/confidence.js';
import { buildDivergenceMatrix } from './engine/divergence.js';
import { buildNarrative } from './engine/narrative.js';
import { computeMomentumTop } from './engine/momentum.js';
import { scanMomentumDivergence } from './engine/divergence-scanner.js';
import { computeDelta } from './engine/delta.js';
import {
  recordSignal, evaluateReadyEntries, computeTrackRecord,
  computeBaselineProgress, extractSeriesFromLedger
} from './engine/ledger.js';
import { THRESHOLDS } from './config.js';

import { renderHeaderMeta, renderStatusBadge, renderSessionStrip, setLiveDot } from './components/header.js';
import { renderMetrics } from './components/metrics.js';
import {
  renderSignalBox, renderSignalTag, renderConfidenceInterval,
  renderBreakdown, renderPillarSummary, renderCrowdingBadge, renderTldr, toggleBreakdown
} from './components/confluence.js';
import { renderFlows } from './components/onchain.js';
import { renderDerivatives } from './components/derivatives.js';
import { renderMomentum } from './components/momentum.js';
import { renderContextRadar, toggleContextRadar } from './components/context-radar.js';
import { renderMethodologyPanel, toggleMethodologyPanel } from './components/methodology.js';
import { wireScreenshotButton } from './components/screenshot.js';
import { renderTrackRecord, toggleTrackRecord } from './components/track-record.js';
import { renderDeltaBanner } from './components/delta-banner.js';
import { renderDivergenceFlags } from './components/divergence-flags.js';
import { wireBriefStudio, refreshBriefStudioState } from './components/brief-studio.js';

// --- v2.3: lapisan analitik. Semuanya overlay untuk MEMBACA skor, bukan
// bahan skor — formula WCCS dan bobot lima pilar tidak disentuh sama sekali.
import { computeBreadth, computeAltseason, scanTurnoverAnomaly, buildMtfGrid } from './engine/breadth.js';
import { computeVolatility, computeDrawdown, detectLevels, computeSessionHeatmap } from './engine/volatility.js';
import { computeCorrelation } from './engine/correlation.js';
import { detectRegime, readPositioning, readDryPowder } from './engine/regime.js';
import {
  renderRegime, renderBreadth, renderAltseason, renderMtfGrid,
  renderCorrelation, renderAnomaly, wireLabTabs
} from './components/market-lab.js';
import {
  renderVolatility, renderDrawdown, renderLevels, renderSessions,
  renderPositioning, renderDryPowder, renderWccsHistory, renderDataHealth
} from './components/risk-lab.js';
import { wireScenarioLab, refreshScenarioLab } from './components/scenario-lab.js';

// --- v2.4: Menara Pengawas, Heatmap, Grafik besar, Pengaturan ---
import { evaluateWatchtower, getUnackCount, getAlerts } from './engine/watchtower.js';
import { scanNews } from './engine/news-scan.js';
import { getSetting, effectiveRefreshMs } from './engine/settings.js';
import { renderWatchBanner, renderWatchTower, announceAlerts, wireWatchTower } from './components/watchtower.js';
import { renderHeatmap } from './components/v24-panels.js';
import { renderBigChart } from './components/bigchart.js';
import { wireSettings, renderExperimentRow } from './components/settings.js';

let currentState = null;

/* ============================================================
   v2.4 — NOMOR BRIEF DINAMIS. Dulu konstanta 1 selamanya; sekarang
   dihitung dari hari pertama aplikasi dipakai di perangkat ini
   (disimpan di localStorage). Hari pertama = Brief #1, besok = #2, dst.
   Tidak penting secara metodologis, tapi admin yang posting harian
   akhirnya punya nomor yang berjalan tanpa mengedit apa pun.
   ============================================================ */
function briefNumberDinamis(){
  try{
    let t0 = Number(localStorage.getItem('ic_first_use_v1'));
    if (!t0){
      t0 = Date.now();
      localStorage.setItem('ic_first_use_v1', String(t0));
    }
    return Math.floor((Date.now() - t0) / 86_400_000) + 1;
  }catch(e){ return BRAND.briefNumber; }
}

/* ============================================================
   ORKESTRASI DATA — tarik semua 5 pilar, toleran kegagalan parsial
   ============================================================ */
/**
 * PERBAIKAN BUG 429/"Failed to fetch" (lihat CHANGELOG-FIX-429.md):
 * CoinGecko menerapkan burst-limit per-IP yang ketat. Di v2.3 ada TUJUH
 * panggilan ke domain api.coingecko.com per siklus (fetchPrices,
 * fetchBtcChart1h, fetchBtcChart4h, fetchEthChart1h, fetchMarkets dari
 * coingecko.js, ditambah fetchGlobal dan fetchBtcChart30d dari
 * market-extra.js). Dulu semuanya ditembak bersamaan lewat satu
 * Promise.allSettled — itu yang memicu 429 dan bikin tabel momentum
 * kosong / fallback ke cache.
 *
 * Perbaikan: ketujuh panggilan CoinGecko dijalankan SEQUENTIAL dengan jeda
 * singkat, dikelompokkan di sini. Sumber dari domain lain (Alternative.me,
 * Binance, DefiLlama, rss2json) rate-limit-nya independen per-domain, tetap
 * paralel seperti sebelumnya — tidak ada perubahan di situ.
 */
const COINGECKO_THROTTLE_MS = 400;
function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchCoinGeckoSequential(){
  const results = {};
  const steps = [
    ['prices', fetchPrices],
    ['btc1h', fetchBtcChart1h],
    ['btc4h', fetchBtcChart4h],
    ['eth1h', fetchEthChart1h],
    ['markets', fetchMarkets],
    ['global', fetchGlobal],
    ['chart30d', fetchBtcChart30d]
  ];
  for (let i = 0; i < steps.length; i++){
    const [key, fn] = steps[i];
    try{
      results[key] = { status: 'fulfilled', value: await fn() };
    }catch(e){
      results[key] = { status: 'rejected', reason: e };
    }
    if (i < steps.length - 1) await sleep(COINGECKO_THROTTLE_MS);
  }
  return results;
}

async function loadAllData(){
  // CoinGecko: sequential + throttle (lihat komentar di atas — perbaikan
  // bug 429). Sumber lain: tetap paralel, domain berbeda jadi aman.
  // fetchGlobal() dan fetchBtcChart30d() SUDAH tidak throw error mentah —
  // keduanya return objek {available:false, ...} saat gagal (lihat
  // market-extra.js), jadi aman dibungkus 'fulfilled' seperti di bawah.
  const [cg, fgR, onchainR, derivR, oiChangeR, tvlR, newsR, longShortR, stablesR] = await Promise.all([
    fetchCoinGeckoSequential(),
    Promise.allSettled([fetchFearGreed()]).then(r => r[0]),
    Promise.allSettled([fetchOnChainFlow()]).then(r => r[0]),
    Promise.allSettled([fetchFundingAndOI()]).then(r => r[0]),
    Promise.allSettled([fetchOIChange()]).then(r => r[0]),
    Promise.allSettled([fetchDefiTvl()]).then(r => r[0]),
    Promise.allSettled([fetchNews()]).then(r => r[0]),
    Promise.allSettled([fetchLongShortRatio()]).then(r => r[0]),
    Promise.allSettled([fetchStablecoinSupply()]).then(r => r[0])
  ]);

  const pricesR = cg.prices;
  const btc1hR = cg.btc1h;
  const btc4hR = cg.btc4h;
  const eth1hR = cg.eth1h;
  const marketsR = cg.markets;
  const globalR = cg.global;
  const chart30R = cg.chart30d;

  const val = (r, fallback) => r.status === 'fulfilled' ? r.value : fallback;

  const prices = val(pricesR, null);
  if (!prices) throw new Error('Gagal total mengambil harga — tanpa ini tidak ada yang bisa dihitung.');

  const btcChart1h = val(btc1hR, []);
  const btcChart4h = val(btc4hR, []);
  const ethChart1h = val(eth1hR, []);
  const markets = val(marketsR, []);
  const fgData = val(fgR, { today: { value: 50, cls: 'Netral' }, yesterday: null });
  const onchain = val(onchainR, { btc: { amount: 0, txCount: 0 }, eth: { amount: 0, txCount: 0 } });
  const deriv = derivR.status === 'fulfilled' ? derivR.value : null;
  const oiChangePct = val(oiChangeR, null);
  const tvl = val(tvlR, { current: null, series: [], available: false });
  const news = val(newsR, { items: [], available: false });

  const global = val(globalR, { available: false });
  const chart30d = val(chart30R, { available: false, prices: [], volumes: [] });
  const longShort = val(longShortR, { available: false });
  const stables = val(stablesR, { available: false });

  // --- Status tiap sumber, untuk panel Kesehatan Data. Dikumpulkan di sini
  //     karena hanya di titik ini kita tahu apa yang benar-benar berhasil. ---
  const dataHealth = { items: [
    { key: 'prices',  status: pricesR.status === 'fulfilled' ? 'ok' : 'failed' },
    { key: 'btc1h',   status: btc1hR.status === 'fulfilled' && btcChart1h.length ? 'ok' : 'failed' },
    { key: 'btc4h',   status: btc4hR.status === 'fulfilled' && btcChart4h.length ? 'ok' : 'failed' },
    { key: 'eth1h',   status: eth1hR.status === 'fulfilled' && ethChart1h.length ? 'ok' : 'failed' },
    { key: 'markets', status: markets.length >= 50 ? 'ok' : markets.length ? 'degraded' : 'failed',
      note: markets.length ? `${markets.length} koin` : null },
    { key: 'fng',     status: fgR.status === 'fulfilled' ? 'ok' : 'failed' },
    { key: 'onchain', status: CONFIG.onChain.provider === 'mock' ? 'degraded' : (onchainR.status === 'fulfilled' ? 'ok' : 'failed'),
      note: CONFIG.onChain.provider === 'mock' ? 'data simulasi — adapter whale belum diaktifkan' : null },
    { key: 'deriv',   status: !deriv ? 'failed' : deriv.usedPublicProxy ? 'degraded' : 'ok',
      note: deriv ? (deriv.usedPublicProxy ? 'lewat proxy publik, confidence didiskon' : `langsung dari ${deriv.exchange}`) : null },
    { key: 'oiChange',status: oiChangePct != null ? 'ok' : 'failed' },
    { key: 'tvl',     status: tvl.available ? 'ok' : 'failed' },
    { key: 'news',    status: news.available ? 'ok' : 'failed' },
    { key: 'global',  status: global.available ? 'ok' : 'failed' },
    { key: 'btc30d',  status: chart30d.available ? 'ok' : 'failed',
      note: chart30d.available ? `${chart30d.prices.length} titik · cache ${cacheAgeSec('btc30d') ?? 0}s` : null },
    { key: 'longShort', status: longShort.available ? 'ok' : 'failed' },
    { key: 'stables', status: stables.available ? 'ok' : 'failed' }
  ] };

  const src1h = btcChart4h.length >= 30 ? btcChart4h : btcChart1h;
  const src4h = chart30d.available && chart30d.prices.length >= 100 ? chart30d.prices : btcChart4h;
  const rsi1h = calcRSIWilder(src1h, CONFIG.rsiPeriod, 3600_000);
  const rsi4h = calcRSIWilder(src4h, CONFIG.rsiPeriod, 4 * 3600_000);

  const fg = {
    value: fgData.today.value,
    cls: fgData.today.cls,
    trendDelta: fgData.yesterday ? fgData.today.value - fgData.yesterday.value : null
  };

  const momentum = computeMomentumTop(markets, 10);

  return {
    // Ditandai eksplisit supaya Brief Studio bisa menyebutkan keterbatasan ini
    // di teks yang diposting, bukan cuma di UI dashboard (Bab 1.3 — kejujuran
    // soal batas data harus ikut ke mana pun angkanya dibawa).
    __onchainIsMock: CONFIG.onChain.provider === 'mock',
    btc: prices.btc, eth: prices.eth,
    btcChart1h, ethChart1h, rsi1h, rsi4h, fg,
    onchain, deriv, oiChangePct,
    momentum, markets, tvl, news,
    global, chart30d, longShort, stables, dataHealth
  };
}

/* ============================================================
   BANGUN INPUT WCCS DARI DATA MENTAH (Bab 3, 5)
   ============================================================ */
function buildPillarInputs(data){
  const { btc, eth, rsi1h, rsi4h, fg, onchain, deriv, oiChangePct } = data;

  const derivValidity = deriv ? deriv.validity : 0;
  const fundingRatePct = deriv?.rate != null ? deriv.rate * 100 : 0; // simpan dalam basis "persen" agar konsisten dgn baseline E1

  // Baseline live untuk A1 (BTC 24h return): tarik histori dari Historical
  // Ledger. Begitu cukup observasi terkumpul, resolveBaseline() otomatis
  // pakai ini alih-alih estimasi statis — implementasi konkret Bab 4.1/4.3.
  const a1LiveSeries = extractSeriesFromLedger(e => e.btcPriceAtSignal != null && e.outcome
    ? e.outcome.btcChangePct
    : null
  );

  return {
    A: [
      { key: 'A1_btc_24h_return', value: btc.change, validity: 1, liveSeries: a1LiveSeries.length >= 20 ? a1LiveSeries : null },
      { key: 'A2_eth_btc_relative', value: eth.change - btc.change, validity: 1 }
    ],
    B: [
      { key: 'B1_rsi_1h', value: rsi1h ?? 50, validity: rsi1h != null ? 1 : 0.3 },
      { key: 'B2_rsi_4h', value: rsi4h ?? 50, validity: rsi4h != null ? 1 : 0.3 }
    ],
    C: [
      { key: 'C1_fg_level', value: fg.value, validity: 1 },
      { key: 'C2_fg_delta', value: fg.trendDelta ?? 0, validity: fg.trendDelta != null ? 1 : 0.5 }
    ],
    D: [
      { key: 'D1_btc_netflow', value: onchain.btc.amount, validity: 0.7 }, // Bab 4.3: mock/proxy, validity awal didiskon
      { key: 'D2_eth_netflow', value: onchain.eth.amount, validity: 0.7 }
    ],
    E: [
      { key: 'E1_funding_rate', value: fundingRatePct, validity: derivValidity },
      { key: 'E2_oi_change', value: oiChangePct ?? 0, validity: oiChangePct != null ? derivValidity : 0.3 }
    ]
  };
}

/* ============================================================
   RENDER UTAMA
   ============================================================ */
function render(state, opts){
  opts = opts || {};
  currentState = state;

  renderHeaderMeta();
  renderMetrics(state);

  const pillarInputs = buildPillarInputs(state);
  // v2.4 — cache input pilar mentah untuk Mode Eksperimen Bobot (sandbox).
  // Komponen scoring-nya sama; eksperimen hanya mengganti bobot pilar
  // saat menghitung baris pembanding. Skor resmi di bawah TIDAK tersentuh.
  state.__pillarInputsCache = pillarInputs;
  const wccsResult = computeWCCS(pillarInputs);
  const classification = classifyWCCS(wccsResult.wccs);

  const meta = {
    onchainTxCount: state.onchain.btc.txCount + state.onchain.eth.txCount,
    derivativesSampleOk: !!state.deriv
  };
  const confidenceResult = computeConfidence(wccsResult.components, wccsResult.wccs, meta);

  // Divergence matrix (Bab 6) — pakai z-score A1/A2 vs D1/D2 dari hasil scoring
  const findZ = (key) => wccsResult.components.find(c => c.key === key)?.z ?? 0;
  const divergence = buildDivergenceMatrix({
    btcPrice: findZ('A1_btc_24h_return'),
    btcFlow: findZ('D1_btc_netflow'),
    ethPrice: findZ('A1_btc_24h_return') + findZ('A2_eth_btc_relative'),
    ethFlow: findZ('D2_eth_netflow')
  });

  // Crowding flag dari Pilar E
  const e1 = wccsResult.components.find(c => c.key === 'E1_funding_rate');
  const crowdingFlag = e1 && e1.isCrowded
    ? { isCrowded: true, direction: e1.rawZ > 0 ? 'long' : 'short' }
    : { isCrowded: false };

  const narrative = buildNarrative(wccsResult.components, classification, wccsResult.wccs, divergence, crowdingFlag);

  // --- Historical Ledger: evaluasi entri lama (24h+) dengan harga SAAT INI,
  //     lalu catat sinyal baru ini untuk dievaluasi di masa depan (Bab 10.3) ---
  // === LAPISAN ANALITIK v2.3 ===
  // Dihitung SEBELUM recordSignal karena label rezim ikut disimpan ke ledger.
  // Urutannya penting: rezim membutuhkan hasil empat engine di bawahnya.
  const breadth = computeBreadth(state.markets);
  const altseason = computeAltseason(state.markets, state.global);
  const anomaly = scanTurnoverAnomaly(state.markets);
  const mtf = buildMtfGrid(state.markets, state.momentum.slice(0, 10).map(m => m.ticker));
  const correlation = computeCorrelation(state.markets, 8);
  const volatility = computeVolatility(state.chart30d);
  const btcMarket = (state.markets || []).find(m => (m.symbol || '').toUpperCase() === 'BTC');
  const drawdown = computeDrawdown(state.chart30d, btcMarket?.ath_change_percentage);
  const levels = detectLevels(state.chart30d, state.btc.usd);
  const sessions = computeSessionHeatmap(state.chart30d);
  const positioning = readPositioning(state.longShort);
  const dryPowder = readDryPowder(state.stables);
  const regime = detectRegime({ volatility, breadth, altseason, drawdown, global: state.global, correlation });

  // --- v2.4: pemindai berita ---
  const newsHits = scanNews(state.news?.items || []);

  evaluateReadyEntries({ btc: state.btc.usd, eth: state.eth.usd });
  if (!opts.fromCache){
    recordSignal({
      wccs: wccsResult.wccs, classification: classification.label,
      confidence: confidenceResult.confidence, btcPrice: state.btc.usd, ethPrice: state.eth.usd,
      regime: regime.available ? regime.label : null
    });
  }
  const trackRecord = computeTrackRecord();
  const baselineProgress = computeBaselineProgress();

  // --- Delta Engine: apa yang berubah sejak snapshot terakhir ---
  const delta = computeDelta({
    wccs: wccsResult.wccs, classification: classification.label,
    confidence: confidenceResult.confidence, btcPrice: state.btc.usd, ethPrice: state.eth.usd,
    fgValue: state.fg.value
  });

  // --- Divergence Scanner multi-koin (di atas momentum top-10) ---
  const momentumFlags = scanMomentumDivergence(state.momentum, state.markets);

  // --- v2.4: MENARA PENGAWAS — evaluasi transisi vs siklus sebelumnya ---
  let watchFired = [];
  if (getSetting('watchEnabled') && !opts.fromCache){
    const watch = evaluateWatchtower({
      classification: classification.label,
      wccs: wccsResult.wccs,
      rsi1h: state.rsi1h,
      fgValue: state.fg.value,
      fundingCrowded: crowdingFlag.isCrowded,
      btcPrice: state.btc.usd,
      btcChange24h: state.btc.change,
      ethPrice: state.eth.usd,
      altseasonIndex: altseason.available ? altseason.indeks : null,
      newsHits
    });
    watchFired = watch.fired || [];
  } else if (!getSetting('watchEnabled')){
    renderWatchBanner([]);
  }

  // Simpan seluruh hasil ke objek state SEBELUM memanggil komponen UI
  state.__wccsResult = wccsResult;
  state.__classification = classification;
  state.__confidence = confidenceResult.confidence;
  state.__narrative = narrative;
  state.__trackRecord = trackRecord;
  state.__delta = delta;
  state.__momentumFlags = momentumFlags;
  state.__newsHits = newsHits;
  state.__watchFired = watchFired;
  state.__analytics = {
    regime, breadth, altseason, anomaly, mtf, correlation,
    volatility, drawdown, levels, sessions, positioning, dryPowder
  };

  // --- render semua ---
  renderSignalBox(narrative, classification);
  renderSignalTag(confidenceResult.confidence, wccsResult.wccs);
  renderStatusBadge(classification, confidenceResult.confidence);
  renderConfidenceInterval(wccsResult.wccs, confidenceResult.confidence);
  renderBreakdown(wccsResult.components);
  renderPillarSummary(wccsResult.pillars);
  renderCrowdingBadge(crowdingFlag);
  renderTldr(narrative, classification, confidenceResult.confidence);
  renderDeltaBanner(delta);
  renderTrackRecord(trackRecord, baselineProgress);
  renderExperimentRow(state); // hanya tampil kalau eksperimen bobot aktif

  renderFlows(state.onchain);

  if (state.deriv){
    renderDerivatives({
      rate: state.deriv.rate,
      oi: state.deriv.oi,
      oiChangePct: state.oiChangePct,
      exchange: state.deriv.exchange,
      usedPublicProxy: state.deriv.usedPublicProxy,
      isCrowded: crowdingFlag.isCrowded,
      crowdingDirection: crowdingFlag.direction
    });
  } else {
    renderDerivatives({ rate: null, oi: null, oiChangePct: null, exchange: null, usedPublicProxy: false, isCrowded: false });
  }

  renderMomentum(state.momentum);
  renderDivergenceFlags(momentumFlags);

  // --- render Lab Analitik v2.3 ---
  renderRegime(regime);
  renderBreadth(breadth);
  renderAltseason(altseason, state.global);
  renderMtfGrid(mtf);
  renderCorrelation(correlation);
  renderAnomaly(anomaly);
  renderVolatility(volatility);
  renderDrawdown(drawdown);
  renderLevels(levels, state.btc.usd);
  renderSessions(sessions);
  renderPositioning(positioning);
  renderDryPowder(dryPowder);
  renderWccsHistory();
  renderDataHealth(state.dataHealth);
  refreshScenarioLab(volatility);
  renderContextRadar(state.tvl, state.news);
  renderSessionStrip();

  // --- render panel v2.4 ---
  renderBigChart(state.chart30d, levels, state.btc.usd);
  renderHeatmap(state.markets);
  if (watchFired.length){
    renderWatchBanner(watchFired);
    announceAlerts(watchFired);
  }
  renderWatchTower(state);

  $('cacheBadge').classList.toggle('show', !!opts.fromCache);

  // Brief Studio selalu memakai state terbaru. Kalau modalnya sedang terbuka
  // saat auto-refresh 60 detik berjalan, isinya ikut diperbarui — kecuali
  // bagian yang sedang disunting admin, yang sengaja dipertahankan.
  refreshBriefStudioState(state);
}

/* ============================================================
   SIMULATOR "BAGAIMANA KALAU" (v2.3)

   Menjalankan ulang mesin WCCS yang sama persis dengan satu atau beberapa
   komponen digeser. Yang perlu dinyatakan jujur: pergeseran harga BTC juga
   ikut menggeser RSI, dan hubungan itu di sini DIDEKATI secara kasar
   (sekitar 2,2 poin RSI per 1% pergerakan harga, dibatasi 0-100) — bukan
   dihitung ulang dari deret harga hipotetis, karena deret itu tidak ada.
   Pendekatan ini cukup untuk menunjukkan SENSITIVITAS skor, yang memang
   tujuan alat ini, tapi tidak untuk diperlakukan sebagai ramalan.
   ============================================================ */
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

function simulateScenario(ov){
  if (!currentState || !currentState.__wccsResult) return null;
  const s = currentState;

  const dasar = {
    wccs: s.__wccsResult.wccs,
    classification: s.__classification,
    confidence: s.__confidence
  };

  const dBtc = ov.btcDeltaPct || 0;
  const dFg = ov.fgDelta || 0;
  const mFund = ov.fundingMult == null ? 1 : ov.fundingMult;

  const tiruan = {
    btc: { usd: s.btc.usd * (1 + dBtc / 100), change: s.btc.change + dBtc },
    eth: { usd: s.eth.usd, change: s.eth.change },
    rsi1h: s.rsi1h != null ? clamp(s.rsi1h + dBtc * 2.2, 0, 100) : null,
    rsi4h: s.rsi4h != null ? clamp(s.rsi4h + dBtc * 1.1, 0, 100) : null,
    fg: {
      value: clamp(s.fg.value + dFg, 0, 100),
      cls: s.fg.cls,
      trendDelta: (s.fg.trendDelta ?? 0) + dFg
    },
    onchain: s.onchain,
    deriv: s.deriv ? { ...s.deriv, rate: s.deriv.rate * mFund } : null,
    oiChangePct: s.oiChangePct
  };

  const w = computeWCCS(buildPillarInputs(tiruan));
  const cls = classifyWCCS(w.wccs);
  const conf = computeConfidence(w.components, w.wccs, {
    onchainTxCount: s.onchain.btc.txCount + s.onchain.eth.txCount,
    derivativesSampleOk: !!s.deriv
  });

  return {
    dasar,
    skenario: { wccs: w.wccs, classification: cls, confidence: conf.confidence }
  };
}

/* ============================================================
   EXTRACT ALL DATA — ringkasan teks lengkap untuk grup Telegram/WA,
   disimpan sebagai file .txt yang otomatis terunduh (bukan disalin ke
   clipboard). Formatnya naratif dan mudah dibaca, mencakup seluruh 5
   pilar + momentum top 10, dengan bahasa yang tenang dan tidak teknis
   berlebihan, konsisten dengan nada di seluruh dashboard.
   ============================================================ */
function buildExtractedText(state){
  const { btc, eth, fg, rsi1h, onchain, deriv, oiChangePct, momentum, tvl,
          __wccsResult, __classification, __confidence, __narrative, __trackRecord } = state;

  const lines = [];
  lines.push(`${BRAND.name} — ${BRAND.tagline}`);
  lines.push(`Confluence Brief #${BRAND.briefNumber} · ${formatDateID(new Date())}`);
  lines.push('═'.repeat(42));
  lines.push('');
  lines.push(`STATUS: ${__classification.label}`);
  lines.push(`Tingkat keyakinan: ${__confidence}%`);
  lines.push('');
  lines.push(__narrative.mainText.replace(/<[^>]+>/g, ''));
  if (__narrative.estimateDisclaimer){
    lines.push('');
    lines.push(__narrative.estimateDisclaimer);
  }
  lines.push('');
  lines.push(`Yang perlu dipantau selanjutnya: ${__narrative.invalidation}`);
  lines.push('');
  lines.push('─'.repeat(42));
  lines.push('HARGA & INDIKATOR UTAMA');
  lines.push('─'.repeat(42));
  lines.push(`BTC   ${formatCurrency(btc.usd)}   (${formatPercent(btc.change)})`);
  lines.push(`ETH   ${formatCurrency(eth.usd)}   (${formatPercent(eth.change)})`);
  lines.push(`Fear & Greed   ${fg.value} — ${fgClassify(fg.value)}`);
  lines.push(`RSI 1 Jam (BTC)   ${rsi1h ?? 'N/A'}`);
  if (deriv){
    lines.push(`Funding Rate (BTC)   ${formatFundingRate(deriv.rate)}`);
    lines.push(`Perubahan Open Interest 24 Jam   ${oiChangePct != null ? formatPercent(oiChangePct) : 'N/A'}`);
  }
  lines.push('');
  lines.push('─'.repeat(42));
  lines.push('RINGKASAN 5 PILAR SINYAL');
  lines.push('─'.repeat(42));
  const pillarNames = { A: 'Price Action', B: 'Momentum Teknikal', C: 'Sentimen', D: 'Aliran On-Chain', E: 'Derivatives' };
  Object.entries(__wccsResult.pillars).forEach(([key, val]) => {
    const arah = val > 0.1 ? 'condong bullish' : val < -0.1 ? 'condong bearish' : 'netral';
    lines.push(`${pillarNames[key]}   ${val >= 0 ? '+' : ''}${val.toFixed(2)}  (${arah})`);
  });
  lines.push('');
  lines.push('─'.repeat(42));
  lines.push('ALIRAN ON-CHAIN (indikasi whale, 24 jam)');
  lines.push('─'.repeat(42));
  lines.push(`BTC   ${formatCompact(onchain.btc.amount * 1_000_000)}   ${onchain.btc.amount >= 0 ? '(cenderung tekanan jual)' : '(cenderung akumulasi)'}`);
  lines.push(`ETH   ${formatCompact(onchain.eth.amount * 1_000_000)}   ${onchain.eth.amount >= 0 ? '(cenderung tekanan jual)' : '(cenderung akumulasi)'}`);
  lines.push('');
  lines.push('─'.repeat(42));
  lines.push('MOMENTUM — TOP 10 KOIN');
  lines.push('─'.repeat(42));
  momentum.forEach((m, i) => {
    const arrow = m.trend === 'up' ? '▲' : m.trend === 'down' ? '▼' : '➖';
    lines.push(`${String(i + 1).padStart(2)}. ${m.ticker.padEnd(8)} skor ${String(m.score).padStart(2)}   ${formatPercent(m.return24h)}  ${arrow}`);
  });
  if (tvl.available){
    lines.push('');
    lines.push('─'.repeat(42));
    lines.push(`TVL DeFi (konteks tambahan, di luar perhitungan skor): ${formatCompact(tvl.current)}`);
  }
  if (__trackRecord && __trackRecord.ready){
    lines.push('');
    lines.push('─'.repeat(42));
    lines.push(`Rekam jejak sinyal di perangkat ini: hit rate ${__trackRecord.hitRate}% dari ${__trackRecord.sampleSize} evaluasi.`);
  }
  lines.push('');
  lines.push('═'.repeat(42));
  lines.push('Edukasi, bukan nasihat keuangan. Selalu lakukan riset sendiri (DYOR)');
  lines.push('sebelum mengambil keputusan.');

  return lines.join('\n');
}

function buildExtractFilename(){
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `ArgonPulse-confluence-brief-${stamp}.txt`;
}

function downloadTextFile(filename, text){
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   PENYIAPAN CACHE — v2.3

   Sejak endpoint /coins/markets diperluas dengan `sparkline=true`, satu
   respons membawa ~100 koin × 168 titik harga. Snapshot cache membengkak
   dari ~0,09 MB jadi ~0,41 MB — belum menabrak kuota localStorage 5 MB,
   tapi localStorage menulis secara SINKRON dan memblokir thread utama, dan
   penulisan sebesar itu terjadi tiap 60 detik seumur halaman dibuka. Di
   perangkat kelas menengah ke bawah itu terasa sebagai tersendat berkala.

   Jadi sebelum disimpan, deret sparkline dan chart 30 hari dibuang. Keduanya
   hanya dipakai lapisan analitik yang boleh absen; harga, skor, dan momentum
   — yang benar-benar dibutuhkan agar dashboard tetap tampil saat jaringan
   putus — tetap utuh. Panel Lab akan menampilkan pesan "belum tersedia" apa
   adanya alih-alih angka basi yang menyamar sebagai data hidup.
   ============================================================ */
function leanForCache(data){
  return {
    ...data,
    markets: (data.markets || []).map(m => {
      const { sparkline_in_7d, ...sisanya } = m;
      return sisanya;
    }),
    chart30d: { available: false, prices: [], volumes: [] },
    dataHealth: null
  };
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function showToast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ============================================================
   INIT & OPERATIONAL LIFECYCLE
   ============================================================ */
function renderIdleState(){
  $('briefMeta').textContent = `Confluence Brief #${BRAND.briefNumber} · v${VERSION} · Siap dianalisis (klik RUN CONFLUENCE)`;
  setLiveDot('var(--text-3)');
  $('statusText').textContent = 'IDLE / READY';
  $('statusBadge').className = 'status-badge idle';
  $('confidenceFill').style.width = '0%';
  $('confidenceLabel').textContent = 'CONFIDENCE —%';
  $('tldrText').textContent = 'Klik RUN CONFLUENCE untuk memulai kalkulasi 5 pilar WCCS.';
  $('signalText').innerHTML = 'Kalkulasi Confluence menanti eksekusi. Klik <b>RUN CONFLUENCE</b> pada toolbar untuk menarik data pasar dan mengagregasi 5 pilar real-time.';
  $('invalidationText').textContent = 'Menanti eksekusi pertama…';

  // 4 metric cards in empty/prompt state
  ['Btc', 'Eth', 'Fg', 'Rsi'].forEach(key => {
    const emptyEl = $(`metricEmpty${key}`);
    const throbEl = $(`metricThrobber${key}`);
    const dataEl = $(`metricData${key}`);
    if (emptyEl) emptyEl.style.display = 'block';
    if (throbEl) throbEl.style.display = 'none';
    if (dataEl) dataEl.style.display = 'none';
  });

  // Momentum table idle
  const momRows = $('momRows');
  if (momRows) {
    momRows.innerHTML = '<tr><td colspan="5" class="empty" style="text-align:center;padding:28px;color:var(--text-3);font-family:var(--font-mono);font-size:11.5px;">Klik <b>RUN CONFLUENCE</b> untuk memuat ranking momentum 10 koin</td></tr>';
  }

  // Big chart & Heatmap idle
  const bigChart = $('bigChartContent');
  if (bigChart) {
    bigChart.innerHTML = '<div class="empty" style="text-align:center;padding:34px;color:var(--text-3);font-family:var(--font-mono);font-size:11.5px;">Grafik 30 hari siap dikalkulasi — klik <b>RUN CONFLUENCE</b></div>';
  }
  const heatmap = $('heatmapContent');
  if (heatmap) {
    heatmap.innerHTML = '<div class="empty" style="text-align:center;padding:34px;color:var(--text-3);font-family:var(--font-mono);font-size:11.5px;">Heatmap pasar Top 100 siap dimuat — klik <b>RUN CONFLUENCE</b></div>';
  }

  // Pillar summary idle
  const pSum = $('pillarSummary');
  if (pSum) {
    pSum.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:14px;color:var(--text-3);font-size:11px;font-family:var(--font-mono);">5 Pilar WCCS siap dianalisis — jalankan analisis untuk memetakan skor</div>';
  }

  // Hide delta & watch banners & cache badge
  const dBan = $('deltaBanner');
  if (dBan) dBan.classList.remove('show');
  const wBan = $('watchBanner');
  if (wBan) wBan.classList.remove('show');
  const cBadge = $('cacheBadge');
  if (cBadge) cBadge.style.display = 'none';
}

function showLoadingState(){
  // 4 metric cards show throbber during calculation
  ['Btc', 'Eth', 'Fg', 'Rsi'].forEach(key => {
    const emptyEl = $(`metricEmpty${key}`);
    const throbEl = $(`metricThrobber${key}`);
    const dataEl = $(`metricData${key}`);
    if (emptyEl) emptyEl.style.display = 'none';
    if (throbEl) throbEl.style.display = 'flex';
    if (dataEl) dataEl.style.display = 'none';
  });

  const momRows = $('momRows');
  if (momRows) {
    momRows.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:26px;color:var(--cyan);font-family:var(--font-mono);font-size:12px;"><span class="dot live active" style="display:inline-block;margin-right:6px;"></span>Mengambil data momentum & memindai 100 koin…</td></tr>';
  }
  const bigChart = $('bigChartContent');
  if (bigChart) {
    bigChart.innerHTML = '<div style="text-align:center;padding:32px;color:var(--cyan);font-family:var(--font-mono);font-size:12px;"><span class="dot live active" style="display:inline-block;margin-right:6px;"></span>Memuat grafik 30 hari & menghitung level pasar…</div>';
  }
  const heatmap = $('heatmapContent');
  if (heatmap) {
    heatmap.innerHTML = '<div style="text-align:center;padding:32px;color:var(--cyan);font-family:var(--font-mono);font-size:12px;"><span class="dot live active" style="display:inline-block;margin-right:6px;"></span>Menghitung matriks heatmap pasar multi-horizon…</div>';
  }
}

let isRunning = false;

async function runConfluence(isRefresh = false){
  if (isRunning) return;
  isRunning = true;

  const runBtn = $('runConfluenceBtn');
  const refreshBtn = $('refreshBtn');
  const progBox = $('engineProgress');

  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = '<span>⏳</span> <span>ANALYZING...</span>';
  }
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<span>↻</span> <span>Memuat…</span>';
  }
  if (progBox) {
    progBox.style.display = 'block';
    if ($('epStatusText')) $('epStatusText').textContent = 'Mengambil data pasar (CoinGecko, Alternative.me, Derivatif)...';
    if ($('epPhaseText')) $('epPhaseText').textContent = 'CALCULATING';
  }

  showLoadingState();

  $('statusText').textContent = 'MENGHITUNG';
  $('statusBadge').className = 'status-badge gold';
  setLiveDot('var(--gold)');
  $('briefMeta').textContent = `Confluence Brief #${BRAND.briefNumber} · v${VERSION} · Memuat data pasar…`;

  try {
    await init();
    scheduleRefresh();
    showToast(isRefresh ? 'Analisis Confluence berhasil diperbarui' : 'Analisis Confluence 5-Pilar selesai dihitung');
  } catch (e) {
    console.error('Confluence execution error:', e);
    showToast('Gagal memuat data Confluence');
  } finally {
    isRunning = false;
    if (progBox) progBox.style.display = 'none';
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.innerHTML = '<span>⚡</span> <span>RUN CONFLUENCE</span>';
    }
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<span>↻</span> <span>Refresh</span>';
    }
  }
}

async function init(){
  BRAND.briefNumber = briefNumberDinamis(); // v2.4 — nomor brief berjalan
  try{
    const data = await loadAllData();
    render(data, { fromCache: false });
    saveCache(CONFIG.cacheKey, leanForCache(data));
    setLiveDot('var(--up)');
  }catch(err){
    console.error('Fetch gagal, coba fallback ke cache', err);
    const cached = loadCache(CONFIG.cacheKey);
    if (cached && cached.data){
      render(cached.data, { fromCache: true });
      showToast('⚠️ Data delayed — pakai cache terakhir');
      setLiveDot('var(--gold)');
    } else {
      $('briefMeta').textContent = 'Gagal memuat data. Cek koneksi lalu klik Refresh.';
      setLiveDot('var(--down)');
      showToast('❌ Gagal mengambil data & tidak ada cache tersimpan');
    }
  }
}

/* ============================================================
   EVENTS
   ============================================================ */
function wireEvents(){
  // v2.4 — toggle panel Menara Pengawas (pakai class 'open' sesuai .context-radar-panel)
  const toggleWatchPanel = () => {
    const p = $('watchTowerPanel');
    const btn = $('watchTowerToggle');
    const isOpen = p.classList.toggle('open');
    if (btn){
      btn.textContent = isOpen ? 'Sembunyikan Menara Pengawas ↑' : '🗼 Menara Pengawas (alarm otomatis) →';
    }
    if (isOpen && currentState) renderWatchTower(currentState);
  };
  $('watchTowerToggle').addEventListener('click', toggleWatchPanel);
  $('watchTowerBtn').addEventListener('click', toggleWatchPanel);
  wireWatchTower(showToast);
  wireSettings(() => currentState, showToast);

  // Dedicated RUN CONFLUENCE button
  const runBtn = $('runConfluenceBtn');
  if (runBtn) runBtn.addEventListener('click', () => runConfluence(false));

  // v2.4 — shortcut keyboard: B brief studio, T ringkas, W menara,
  // S pengaturan, R refresh. Diabaikan saat sedang mengetik di input.
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    switch (e.key.toLowerCase()){
      case 'b': $('briefStudioBtn').click(); break;
      case 't': $('tldrBtn').click(); break;
      case 'w': toggleWatchPanel(); break;
      case 's': $('settingsBtn').click(); break;
      case 'r': runConfluence(true); break;
    }
  });

  $('extractBtn').addEventListener('click', () => {
    if (!currentState){ showToast('Data belum siap'); return; }
    try{
      const text = buildExtractedText(currentState);
      downloadTextFile(buildExtractFilename(), text);
      $('extractBtn').classList.add('copied');
      $('extractBtn').textContent = '✓ File Tersimpan!';
      showToast('Ringkasan lengkap tersimpan sebagai .txt — siap diunggah ke grup');
      setTimeout(() => {
        $('extractBtn').classList.remove('copied');
        $('extractBtn').textContent = '📤 Extract All Data';
      }, 2000);
    }catch(e){
      console.error(e);
      showToast('Gagal menyimpan file');
    }
  });

  $('tldrBtn').addEventListener('click', () => {
    document.body.classList.toggle('tldr-mode');
    const active = document.body.classList.contains('tldr-mode');
    $('tldrBtn').textContent = active ? '📖 Mode Lengkap' : '📝 Mode Ringkas';
  });

  $('refreshBtn').addEventListener('click', () => {
    runConfluence(true);
  });

  $('breakdownToggle').addEventListener('click', toggleBreakdown);
  $('contextRadarToggle').addEventListener('click', toggleContextRadar);
  $('trackRecordToggle').addEventListener('click', toggleTrackRecord);

  const openMethodology = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    renderMethodologyPanel();
    toggleMethodologyPanel();
  };
  if ($('methodologyLink')) $('methodologyLink').addEventListener('click', openMethodology);
  if ($('methodologyBtn')) $('methodologyBtn').addEventListener('click', openMethodology);
  $('methodologyClose').addEventListener('click', toggleMethodologyPanel);
  $('methodologyModal').addEventListener('click', (e) => {
    if (e.target.id === 'methodologyModal') toggleMethodologyPanel();
  });

  wireScreenshotButton(showToast);
  wireBriefStudio(() => currentState, showToast);
  wireLabTabs();
  wireScenarioLab(simulateScenario);
}

/* ============================================================
   BOOT
   ============================================================ */
// v2.4 — interval refresh kini mengikuti Pengaturan (localStorage).
// Dijadwalkan ulang setelah tiap siklus, jadi perubahan interval
// berlaku pada siklus berikutnya tanpa reload.
let refreshTimer = null;
function scheduleRefresh(){
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  const ms = effectiveRefreshMs(CONFIG.refreshMs);
  if (ms > 0 && currentState){
    refreshTimer = setTimeout(async () => {
      await runConfluence(true);
      scheduleRefresh();
    }, ms);
  }
}

async function boot(){
  wireEvents();
  renderSessionStrip();
  BRAND.briefNumber = briefNumberDinamis();

  // "Run first to see data": on initial load, show clean idle/placeholder state
  // identical to XT-QUANT screener architecture.
  renderIdleState();
}

boot();
