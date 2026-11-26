/* ════════════════════════════════════════════════════════════════
   CRYPTO SCAN LITE — QUANTUM v3.0 — app.js
   ════════════════════════════════════════════════════════════════
   ALUR:
   1. fetchCoins()          → CoinGecko markets (harga + sparkline 7d)
   2. fetchFunding()        → Binance Futures premiumIndex (fallback: skip)
   3. fetchOpenInterest()   → Binance Futures openInterest per simbol top-N
   4. runCoinEngines()×N    → {QE} 40+ engine per koin (10 famili)
   5. finalizePopulation()  → {QE} statistik robust median/MAD + persentil
   6. runMarketEngines()    → {QE} jaringan korelasi, MP bound, absorption, MQS v2
   7. scoreCore() + metaEnsemble() → skor inti v2 + ensemble Bayesian 16-vote
   8. renderResults()       → Top 10 Bullish/Bearish + dashboard + matrix
   9. buildTxt()            → SAVE ALL .TXT (laporan kuantitatif lengkap)
   ════════════════════════════════════════════════════════════════ */

/* ── KONFIGURASI ── */
const CG_BASE = 'https://api.coingecko.com/api/v3';
const FAPI_BASE = 'https://fapi.binance.com';
const FAPI_MIRRORS = ['https://fapi.binance.com', 'https://fapi1.binance.com', 'https://fapi2.binance.com'];
const TOP_N = 10; // jumlah coin ditampilkan per panel

const STABLES = new Set([
  'usdt', 'usdc', 'dai', 'busd', 'tusd', 'usdd', 'fdusd', 'pyusd', 'usde', 'usdp',
  'gusd', 'frax', 'lusd', 'susd', 'eurs', 'eurt', 'usdj', 'ust'
]);

const N_ENGINE = QE.ENGINE_REGISTRY.length;

/* ── STATE ── */
let coins = [];
let fundingMap = {};   // SYMBOL(no USDT) -> {rate, markPrice}
let oiMap = {};        // SYMBOL -> {oi}
let lastResult = null; // hasil scan lengkap — dipakai Save ALL TXT / CSV / Image
let scanProgress = { phase: '', pct: 0 };

/* ══════════════════════════════════════════════════════════════════
   FETCH LAYER (CoinGecko + Binance)
   ══════════════════════════════════════════════════════════════════ */

async function safeFetchJSON(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    clearTimeout(id);
    return null;
  }
}

async function fetchCoins(n) {
  setDot('dotCG', 'spin');
  const pages = Math.ceil(n / 250);
  const reqs = [];
  for (let p = 1; p <= pages; p++) {
    reqs.push(safeFetchJSON(
      `${CG_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc` +
      `&per_page=250&page=${p}&sparkline=true&price_change_percentage=1h,24h,7d`
    ));
  }
  const results = await Promise.all(reqs);
  if (!results[0]) { setDot('dotCG', 'bad'); throw new Error('CoinGecko gagal — kemungkinan rate limit. Tunggu 60 detik.'); }
  const flat = results.filter(Boolean).flat().slice(0, n);
  setDot('dotCG', 'ok');
  return flat;
}

async function fetchFunding() {
  setDot('dotBN', 'spin');
  for (const base of FAPI_MIRRORS) {
    const data = await safeFetchJSON(`${base}/fapi/v1/premiumIndex`, 8000);
    if (data && Array.isArray(data) && data.length > 10) {
      const map = {};
      data.filter(d => d.symbol.endsWith('USDT') && d.lastFundingRate !== undefined)
        .forEach(d => {
          const sym = d.symbol.replace('USDT', '');
          map[sym] = {
            rate: parseFloat(d.lastFundingRate) * 100,
            markPrice: parseFloat(d.markPrice) || 0,
          };
        });
      setDot('dotBN', 'ok');
      return map;
    }
  }
  setDot('dotBN', 'bad');
  return {};
}

async function fetchOpenInterest(symbols) {
  const map = {};
  const batchSize = 15;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    await Promise.all(batch.map(async sym => {
      for (const base of FAPI_MIRRORS) {
        const d = await safeFetchJSON(`${base}/fapi/v1/openInterest?symbol=${sym}USDT`, 4000);
        if (d && d.openInterest !== undefined) {
          map[sym] = { oi: parseFloat(d.openInterest) };
          return;
        }
      }
    }));
    if (i + batchSize < symbols.length) await new Promise(r => setTimeout(r, 60));
  }
  return map;
}

/* ══════════════════════════════════════════════════════════════════
   ENGINE #1 — CORE COMPOSITE v2 (z-score lintas-populasi)
   (logika sama dengan versi sebelumnya; sekarang juga menyimpan
   komponen z untuk dipakai ensemble Bayesian & Fisher gabungan)
   ══════════════════════════════════════════════════════════════════ */

function calcRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return null;
  const p = prices.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < p.length; i++) {
    const d = p[i] - p[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;
  return Math.round(100 - 100 / (1 + gains / losses));
}

function calcRSISmooth(prices) {
  const r14 = calcRSI(prices, 14);
  const r24 = calcRSI(prices, 24);
  if (r14 === null && r24 === null) return null;
  if (r14 === null) return r24;
  if (r24 === null) return r14;
  return Math.round(r14 * 0.6 + r24 * 0.4);
}

function calcATRPercent(prices, period = 14) {
  if (!prices || prices.length < period + 2) return null;
  const p = prices.slice(-(period + 2));
  const trs = [];
  for (let i = 1; i < p.length; i++) trs.push(Math.abs(p[i] - p[i - 1]));
  const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
  const lastPrice = p[p.length - 1];
  return lastPrice > 0 ? (atr / lastPrice) * 100 : null;
}

function calcEMACrossSignal(prices) {
  if (!prices || prices.length < 25) return null;
  const ema = (arr, period) => {
    const k = 2 / (period + 1);
    let e = arr[0];
    const out = [e];
    for (let i = 1; i < arr.length; i++) { e = arr[i] * k + e * (1 - k); out.push(e); }
    return out;
  };
  const fast = ema(prices, 9);
  const slow = ema(prices, 21);
  const n = fast.length;
  const diffNow = fast[n - 1] - slow[n - 1];
  const diffPrev = fast[n - 2] - slow[n - 2];
  return {
    bullish: diffNow > 0,
    freshCross: (diffPrev <= 0 && diffNow > 0) || (diffPrev >= 0 && diffNow < 0),
    strength: slow[n - 1] > 0 ? (diffNow / slow[n - 1]) * 100 : 0,
  };
}

function isStable(coin) {
  const sym = (coin.symbol || '').toLowerCase();
  if (STABLES.has(sym) || /^pc\d{4,}/i.test(sym)) return true;
  // heuristik tambahan: harga menempel $1 ±3% + identitas "usd" di simbol/nama
  // (menangkap stablecoin baru seperti USDF, USDX, USD1, dll yang belum ada di daftar)
  const p = coin.current_price;
  if (p && p > 0.97 && p < 1.03) {
    const nm = (coin.name || '').toLowerCase();
    if (sym.includes('usd') || nm.includes('stable') || nm.includes('usd')) return true;
  }
  return false;
}

function calcDeceleration(prices) {
  if (!prices || prices.length < 48) return null;
  const n = prices.length;
  const last24Rate = (prices[n - 1] - prices[n - 25]) / Math.max(1e-9, Math.abs(prices[n - 25])) * 100 / 24;
  const full7dRate = (prices[n - 1] - prices[0]) / Math.max(1e-9, Math.abs(prices[0])) * 100 / n;
  if (Math.abs(full7dRate) < 1e-6) return null;
  const sameSign = Math.sign(last24Rate) === Math.sign(full7dRate);
  const ratio = last24Rate / full7dRate;
  return { last24Rate, full7dRate, ratio, decelerating: sameSign && ratio > 0 && ratio < 0.5, reversing: !sameSign && Math.abs(last24Rate) > 0.05 };
}

function calcPopulationStats(values) {
  const v = values.filter(x => x !== null && !isNaN(x));
  if (v.length < 10) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length;
  const std = Math.sqrt(variance) || 1e-9;
  return { mean, std, n: v.length };
}

function zScore(value, stats) {
  if (value === null || value === undefined || !stats) return null;
  return (value - stats.mean) / stats.std;
}

function precomputePopulationStats(coins) {
  const momRaws = [], rsis = [];
  const cache = new Map();

  for (const c of coins) {
    const prices = c.sparkline_in_7d?.price;
    if (!prices || prices.length < 25) continue;
    const hasInvalid = prices.some(p => !Number.isFinite(p) || p <= 0);
    if (hasInvalid) continue;
    const rsi = calcRSISmooth(prices);
    const atrPct = calcATRPercent(prices);
    const chg1h = c.price_change_percentage_1h_in_currency || 0;
    const chg24h = c.price_change_percentage_24h_in_currency || 0;
    const chg7d = c.price_change_percentage_7d_in_currency || 0;
    const momRawPct = chg1h * 0.15 + chg24h * 0.35 + chg7d * 0.50;
    const momAdj = atrPct ? momRawPct / Math.max(atrPct, 0.5) : momRawPct;
    cache.set(c.id, { prices, rsi, atrPct, momRawPct, momAdj, chg1h, chg24h, chg7d });
    if (rsi !== null) rsis.push(rsi);
    if (momAdj !== null && !isNaN(momAdj)) momRaws.push(momAdj);
  }

  const fundings = [];
  for (const sym in fundingMap) {
    const r = fundingMap[sym].rate;
    if (r !== undefined && !isNaN(r)) fundings.push(r);
  }

  return {
    cache,
    momStats: calcPopulationStats(momRaws),
    rsiStats: calcPopulationStats(rsis),
    fundStats: calcPopulationStats(fundings),
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function scoreCore(c, btc7dChange, pop) {
  const d = pop.cache.get(c.id);
  if (!d) return null;

  const { rsi, atrPct, momRawPct, momAdj, chg1h, chg24h, chg7d } = d;
  const sym = (c.symbol || '').toUpperCase();
  const fd = fundingMap[sym];
  const od = oiMap[sym];

  const reasons = [];
  const components = {};
  let raw = 0, available = 0;
  const signs = [];

  // 1. Momentum volatility-adjusted (bobot 30)
  let momScore = 0;
  const momZ = zScore(momAdj, pop.momStats);
  components.momZ = momZ;
  if (momZ !== null) {
    available++;
    momScore = Math.tanh(momZ / 2.2) * 30;
    raw += momScore;
    signs.push(Math.abs(momZ) > 0.35 ? Math.sign(momScore) : 0);
    if (Math.abs(momZ) > 1.4) {
      reasons.push(`Momentum ${momRawPct >= 0 ? '+' : ''}${momRawPct.toFixed(1)}% (ATR-adj z=${momZ.toFixed(1)}) — jauh ${momZ > 0 ? 'di atas' : 'di bawah'} rata-rata pasar`);
    }
  }

  // 2. RSI z-score (bobot 18)
  let rsiScore = 0;
  const rsiZ = zScore(rsi, pop.rsiStats);
  components.rsiZ = rsiZ;
  const decel = calcDeceleration(d.prices);
  if (rsiZ !== null) {
    available++;
    rsiScore = Math.tanh(-rsiZ / 1.8) * 18;
    const rsiOpposesMomentum = momZ !== null && Math.sign(rsiScore) !== 0 &&
      Math.sign(rsiScore) !== Math.sign(momZ) && Math.abs(momZ) > 1.2;
    const trendHealthy = decel && !decel.decelerating && !decel.reversing;
    if (rsiOpposesMomentum && trendHealthy) rsiScore *= 0.45;
    raw += rsiScore;
    signs.push(Math.abs(rsiZ) > 0.35 ? Math.sign(rsiScore) : 0);
    if (Math.abs(rsiZ) > 1.4) {
      reasons.push(`RSI ${rsi} (z=${rsiZ.toFixed(1)} vs populasi) — ${rsiZ < 0 ? 'lebih oversold' : 'lebih overbought'} dari rata-rata`);
    }
  }

  // 3. EMA cross (bobot 10)
  const emaSig = calcEMACrossSignal(d.prices);
  let emaScore = 0;
  if (emaSig) {
    available++;
    emaScore = clamp(emaSig.strength * 4, -10, 10);
    if (emaSig.freshCross) emaScore *= 1.3;
    emaScore = clamp(emaScore, -13, 13);
    raw += emaScore;
    signs.push(Math.abs(emaScore) > 1.5 ? Math.sign(emaScore) : 0);
    if (emaSig.freshCross) reasons.push(`EMA 9/21 baru saja ${emaSig.bullish ? 'golden cross' : 'death cross'}`);
  }

  // 4. Funding z-score + discount OI (bobot 27)
  let fundScore = 0;
  let fundReliability = 1;
  if (fd && fd.rate !== undefined && !isNaN(fd.rate) && pop.fundStats) {
    available++;
    const fz = zScore(fd.rate, pop.fundStats);
    components.fundZ = fz;
    let base = Math.tanh(-fz / 1.6) * 27;
    if (od && od.oi > 0) {
      const oiUsd = od.oi * (fd.markPrice || c.current_price || 0);
      if (oiUsd < 5e6) fundReliability = 0.4;
      else if (oiUsd < 2e7) fundReliability = 0.7;
      else fundReliability = 1.0;
    } else fundReliability = 0.6;
    fundScore = base * fundReliability;
    raw += fundScore;
    signs.push(Math.abs(fz) > 0.35 ? Math.sign(fundScore) : 0);
    if (Math.abs(fz) > 1.0) {
      reasons.push(`Funding ${fd.rate.toFixed(3)}% (z=${fz.toFixed(1)}) — ${fz < 0 ? 'short crowded, potensi squeeze' : 'long crowded, potensi flush'}`);
    }
  }

  // 5. Relative strength vs BTC (bobot 12)
  let rsScore = 0;
  if (btc7dChange !== null && sym !== 'BTC') {
    available++;
    const rsRaw = chg7d - btc7dChange;
    const rsZapprox = pop.momStats ? (rsRaw / Math.max(0.1, pop.momStats.std)) : null;
    components.rsZ = rsZapprox;
    const rsAdj = atrPct ? rsRaw / Math.max(atrPct * 2, 1) : rsRaw * 0.3;
    rsScore = clamp(rsAdj * 6, -12, 12);
    raw += rsScore;
    signs.push(Math.abs(rsScore) > 1.5 ? Math.sign(rsScore) : 0);
    if (Math.abs(rsRaw) > 4) {
      reasons.push(`${rsRaw >= 0 ? 'Outperform' : 'Underperform'} BTC ${rsRaw >= 0 ? '+' : ''}${rsRaw.toFixed(1)}% (7d)`);
    }
  }

  // (a) Penalti exhaustion berbasis deceleration
  let exhaustionPenalty = 0;
  if (decel && Math.abs(momScore) > 3) {
    const trendSign = Math.sign(momScore);
    if (decel.reversing) {
      exhaustionPenalty = Math.min(18, Math.abs(momScore) * 0.5);
      raw -= trendSign * exhaustionPenalty;
      reasons.unshift('⚠ Momentum 24 jam terakhir berbalik arah dari tren 7 hari');
    } else if (decel.decelerating) {
      exhaustionPenalty = Math.min(10, Math.abs(momScore) * 0.3);
      raw -= trendSign * exhaustionPenalty;
      reasons.unshift('⚠ Laju pergerakan melambat dibanding rata-rata 7 hari');
    }
  }

  // (b) Bonus konfluensi
  const posCount = signs.filter(s => s > 0).length;
  const negCount = signs.filter(s => s < 0).length;
  const dominant = posCount >= negCount ? posCount : negCount;
  const totalSigned = signs.filter(s => s !== 0).length;
  if (totalSigned >= 3 && dominant === totalSigned && exhaustionPenalty === 0) {
    const confluenceBonus = Math.min(16, 8 + (dominant - 3) * 2);
    raw += (posCount >= negCount ? 1 : -1) * confluenceBonus;
    reasons.unshift(`✓ ${dominant}/${totalSigned} komponen konfirmasi searah — konfluensi kuat`);
  }

  // (c) [UPGRADE] Smart Volume Turnover Filter (konfirmasi arus uang vs rawan fakeout)
  const turnover = (c.market_cap > 0 && c.total_volume > 0) ? (c.total_volume / c.market_cap) : null;
  if (turnover !== null && Math.abs(raw) > 15) {
    if (turnover >= 0.18 && exhaustionPenalty === 0) {
      raw *= 1.10; // boost 10% bila didukung volume transaksi deras
      reasons.push(`💧 Likuiditas deras (Turnover ${(turnover * 100).toFixed(0)}%/24j) — pergerakan didukung volume`);
    } else if (turnover < 0.02) {
      raw *= 0.82; // diskon 18% bila volume terlalu sepi (rawan manipulasi/fakeout)
      reasons.push(`⚠ Volume tipis (Turnover ${(turnover * 100).toFixed(1)}%/24j) — waspada spread/fakeout`);
    }
  }

  if (available === 0) return null;
  const score = clamp(raw, -100, 100);
  if (!Number.isFinite(score)) return null;

  const finalSign = score >= 0 ? 1 : -1;
  const agreeCount = signs.filter(s => s === finalSign).length;
  const dataCompleteness = available / 5;
  const directionalAgreement = totalSigned > 0 ? agreeCount / totalSigned : 0;
  const confidence = Math.round((dataCompleteness * 0.4 + directionalAgreement * 0.6) * 100);

  return {
    coin: c,
    score: Math.round(Math.abs(score)),
    rawScore: score,
    direction: score >= 0 ? 'LONG' : 'SHORT',
    confidence,
    rsi, chg1h, chg24h, chg7d, atrPct,
    funding: fd ? fd.rate : null,
    components,
    reasons: reasons.slice(0, 3),
  };
}

/* ══════════════════════════════════════════════════════════════════
   ORKESTRASI SCAN — 5 FASE dengan progress
   ══════════════════════════════════════════════════════════════════ */

function setProgress(phase, pct) {
  scanProgress = { phase, pct };
  const el = document.getElementById('engineProgress');
  if (el) {
    el.style.display = pct >= 100 ? 'none' : 'block';
    el.querySelector('.ep-bar').style.width = pct + '%';
    el.querySelector('.ep-label').textContent = phase;
  }
}

async function runScan() {
  const btn = document.getElementById('syncBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> <span>SCANNING...</span>';
  document.getElementById('errBox').innerHTML = '';
  showLoadingState();

  const t0 = performance.now();
  try {
    const n = parseInt(document.getElementById('nCoins').value, 10);

    setProgress('FASE 1/6 · Mengambil data CoinGecko...', 5);
    coins = await fetchCoins(n);

    setProgress('FASE 2/6 · Funding & Open Interest Binance...', 20);
    fundingMap = await fetchFunding();
    const symsWithFunding = Object.keys(fundingMap).slice(0, 200);
    oiMap = symsWithFunding.length ? await fetchOpenInterest(symsWithFunding) : {};

    const btcCoin = coins.find(c => (c.symbol || '').toLowerCase() === 'btc');
    const btc7d = btcCoin ? (btcCoin.price_change_percentage_7d_in_currency || 0) : null;
    const btcPrices = btcCoin ? btcCoin.sparkline_in_7d?.price : null;
    const btcReturns = btcPrices && btcPrices.length > 60 ? (() => {
      const out = [];
      for (let i = 1; i < btcPrices.length; i++) {
        if (btcPrices[i] > 0 && btcPrices[i - 1] > 0) out.push(Math.log(btcPrices[i] / btcPrices[i - 1]));
      }
      return out;
    })() : null;

    const activeCoins = coins.filter(c => !isStable(c));
    const pop = precomputePopulationStats(activeCoins);

    // ── FASE 3: jalankan seluruh suite engine per koin ──
    setProgress(`FASE 3/6 · Menjalankan ${N_ENGINE} engine kuantitatif per koin...`, 35);
    const bundles = [];
    const list = activeCoins.filter(c => pop.cache.has(c.id));
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const cache = pop.cache.get(c.id);
      const sym = (c.symbol || '').toUpperCase();
      bundles.push(QE.runCoinEngines({
        id: c.id, sym,
        prices: cache.prices,
        chg1h: cache.chg1h, chg24h: cache.chg24h, chg7d: cache.chg7d,
        volumeUsd: c.total_volume || 0, mcapUsd: c.market_cap || 0,
        btcReturns, fundingRatePct: fundingMap[sym]?.rate ?? null,
      }));
      if (i % 12 === 0) {
        setProgress(`FASE 3/6 · ${N_ENGINE} engine × ${i + 1}/${list.length} koin (${sym}...)`, 35 + (35 * i / list.length));
        await new Promise(r => setTimeout(r, 0)); // yield UI thread
      }
    }
    const bundleById = new Map(bundles.map(b => [b.id, b]));

    // ── FASE 4: statistik populasi robust + engine pasar ──
    setProgress('FASE 4/6 · Statistik populasi (median/MAD) + jaringan korelasi...', 72);
    await new Promise(r => setTimeout(r, 0));
    const qpop = QE.finalizePopulation(bundles);
    const fundingRates = Object.values(fundingMap).map(f => f.rate).filter(v => Number.isFinite(v));
    const market = QE.runMarketEngines(activeCoins, bundleById, { fundingRates });

    // ── FASE 5: core v2 + ensemble Bayesian + ranking final ──
    setProgress('FASE 5/6 · Ensemble Bayesian + Fisher gabungan...', 84);
    await new Promise(r => setTimeout(r, 0));
    const scored = [];
    for (const c of list) {
      const core = scoreCore(c, btc7d, pop);
      const b = bundleById.get(c.id);
      if (!core || !b) continue;
      const meta = QE.metaEnsemble(b, core, qpop);
      scored.push({ core, bundle: b, meta });
    }

    // ── FASE 6: ranking final + Monte Carlo (20 Long & 20 Short teratas) + basket ──
    setProgress('FASE 6/6 · Basket portofolio + event radar + cluster map...', 93);
    await new Promise(r => setTimeout(r, 0));
    const { longs, shorts } = rankScored(scored);

    // Pastikan seluruh Top 20 Bullish & Top 20 Bearish selalu punya Monte Carlo
    longs.slice(0, 20).forEach(s => QE.attachMonteCarlo(s.bundle));
    shorts.slice(0, 20).forEach(s => QE.attachMonteCarlo(s.bundle));
    const extras = buildMarketExtras(scored, longs, shorts, market, qpop);

    renderResults(scored, longs, shorts, market, qpop, extras, t0);
    setProgress('Selesai', 100);

  } catch (e) {
    document.getElementById('errBox').innerHTML =
      `<div class="err-box">⚠ ${e.message || 'Gagal memuat data'}</div>`;
    document.getElementById('longList').innerHTML = '<div class="empty">Gagal memuat</div>';
    document.getElementById('shortList').innerHTML = '<div class="empty">Gagal memuat</div>';
    setProgress('', 100);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🔄</span> <span>RUN SCANNER</span>';
  }
}

function showLoadingState() {
  const ld = '<div class="loading"><div class="ld"></div>Mengambil data & menjalankan engine...</div>';
  document.getElementById('longList').innerHTML = ld;
  document.getElementById('shortList').innerHTML = ld;
}

/* ══════════════════════════════════════════════════════════════════
   RANKING + ENGINE PASAR TINGKAT LANJUT (batch 2)
   ══════════════════════════════════════════════════════════════════ */

function rankScored(scored) {
  // blend final: 60% ensemble + 40% core v2 + Smart Quality Multiplier (OOS & Chop filter)
  for (const s of scored) {
    const ensSigned = s.meta ? (s.meta.pUp - 0.5) * 200 : 0;
    let blend = 0.6 * ensSigned + 0.4 * s.core.rawScore;

    // [UPGRADE] Penalti koin yang gagal total di Walk-Forward OOS & bonus yang 100% tembus
    const wf = s.bundle?.replay?.wf;
    if (wf && wf.n >= 2) {
      if (wf.hitRate === 1) blend *= 1.08;
      else if (wf.hitRate === 0) blend *= 0.82;
    }

    // [UPGRADE] Penalti pasar sideways ekstrem (Choppiness > 65) agar grup tidak terjebak market kocokan
    const chop = s.bundle?.econ?.chop?.chop;
    if (Number.isFinite(chop) && chop > 65) blend *= 0.90;

    s.blend = clamp(blend, -100, 100);
    s.finalDir = s.blend >= 0 ? 'LONG' : 'SHORT';
    s.finalScore = Math.round(Math.abs(s.blend));
    s.rankVal = s.finalScore * Math.sqrt(Math.max(0.05, s.core.confidence / 100));

    // [UPGRADE] Hitung referensi Trade Plan kuantitatif (Entry, SL, TP1, TP2 berbasis ATR/GARCH)
    const price = s.core.coin.current_price || 0;
    const hourlyVol = s.bundle?.vol?.garch?.nextPct || (s.core.atrPct ? s.core.atrPct * 0.6 : 1.2);
    const swingPct = clamp(hourlyVol * Math.sqrt(24) * 0.85, 1.8, 14.0); // estimasi ayunan 24 jam (%)
    const dirSign = s.finalDir === 'LONG' ? 1 : -1;
    s.tradePlan = price > 0 ? {
      entryLo: price * (1 - dirSign * (swingPct * 0.15) / 100),
      entryHi: price * (1 + dirSign * (swingPct * 0.05) / 100),
      sl: price * (1 - dirSign * (swingPct * 0.75) / 100),
      tp1: price * (1 + dirSign * (swingPct * 1.15) / 100),
      tp2: price * (1 + dirSign * (swingPct * 2.00) / 100),
      slPct: (swingPct * 0.75).toFixed(1),
      tp1Pct: (swingPct * 1.15).toFixed(1),
      tp2Pct: (swingPct * 2.00).toFixed(1),
    } : null;
  }
  const longs = scored.filter(s => s.finalDir === 'LONG').sort((a, b) => b.rankVal - a.rankVal);
  const shorts = scored.filter(s => s.finalDir === 'SHORT').sort((a, b) => b.rankVal - a.rankVal);
  return { longs, shorts };
}

function toLogRets(prices) {
  const out = [];
  if (!prices || prices.length < 26) return out;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) out.push(Math.log(prices[i] / prices[i - 1]));
  }
  return out;
}

function buildMarketExtras(scored, longs, shorts, market, qpop) {
  // Portfolio basket: 6 long + 6 short terbaik, bobot invers-volatilitas
  const cands = [];
  longs.slice(0, 6).forEach(s => cands.push({
    sym: s.bundle.sym, dir: 1, rets: toLogRets(s.bundle._prices),
    beta: s.bundle.port?.btc?.beta,
  }));
  shorts.slice(0, 6).forEach(s => cands.push({
    sym: s.bundle.sym, dir: -1, rets: toLogRets(s.bundle._prices),
    beta: s.bundle.port?.btc?.beta,
  }));
  const portfolio = QE.buildPortfolio(cands);

  // Event radar lintas seluruh koin
  const radar = QE.eventRadar(scored.map(s => ({
    sym: s.bundle.sym, bundle: s.bundle, core: s.core,
    squeezeThr: qpop.thresholds ? qpop.thresholds.squeeze : null,
  })));

  // Cluster korelasi (dari matriks return top-40 milik network engine)
  const clusters = market.rets ? QE.clusterCoins(market.rets.rets, market.rets.syms, 0.72) : null;

  // Riwayat scan (localStorage)
  const hist = compareWithHistory(longs, shorts);
  saveHistory(scored, longs, shorts);

  return { portfolio, radar, clusters, hist };
}

/* ── RIWAYAT SCAN (localStorage — perbandingan antar scan) ── */
const HIST_KEY = 'qscan_history_v1';

function loadPrevHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || 'null'); } catch (e) { return null; }
}

function compareWithHistory(longs, shorts) {
  const prev = loadPrevHistory();
  if (!prev || !prev.byId) return null;
  const deltas = {};
  for (const id in prev.byId) {
    deltas[id] = { prevRank: prev.byId[id].rank, prevBlend: prev.byId[id].blend, prevDir: prev.byId[id].dir, sym: prev.byId[id].sym };
  }
  // tandai koin yang ada di scan ini (rank baru diisi oleh pemanggil via currentRank)
  const exitedBull = (prev.topBull || []).filter(id => !longs.some(s => s.core.coin.id === id))
    .map(id => (prev.byId[id] && prev.byId[id].sym) || id);
  const exitedBear = (prev.topBear || []).filter(id => !shorts.some(s => s.core.coin.id === id))
    .map(id => (prev.byId[id] && prev.byId[id].sym) || id);
  return { when: prev.ts ? new Date(prev.ts) : null, deltas, exitedBull, exitedBear };
}

function saveHistory(scored, longs, shorts) {
  try {
    const byId = {};
    const ranked = scored.slice().sort((a, b) => b.rankVal - a.rankVal);
    ranked.forEach((s, i) => {
      byId[s.core.coin.id] = {
        sym: s.bundle.sym, rank: i + 1,
        blend: Math.round(s.blend * 10) / 10, dir: s.finalDir,
      };
    });
    localStorage.setItem(HIST_KEY, JSON.stringify({
      ts: new Date().toISOString(),
      byId,
      topBull: longs.slice(0, TOP_N).map(s => s.core.coin.id),
      topBear: shorts.slice(0, TOP_N).map(s => s.core.coin.id),
    }));
  } catch (e) { /* storage diblokir/penuh — fitur riwayat di-skip diam-diam */ }
}

/* ══════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════ */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function fmtPrice(p) {
  if (!Number.isFinite(p)) return '-';
  if (p >= 1000) return '$' + p.toLocaleString('en', { maximumFractionDigits: 0 });
  if (p >= 1) return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  return '$' + p.toPrecision(3);
}

function fx(v, d) { // format angka aman utk tampilan singkat
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  return v.toFixed(d === undefined ? 2 : d);
}

function renderResults(scored, longs, shorts, market, qpop, extras, t0) {
  const topLongs = longs.slice(0, TOP_N);
  const topShorts = shorts.slice(0, TOP_N);

  renderList('longList', topLongs, 'long', extras.hist);
  renderList('shortList', topShorts, 'short', extras.hist);
  document.getElementById('longCnt').textContent = topLongs.length + ' kandidat';
  document.getElementById('shortCnt').textContent = topShorts.length + ' kandidat';

  const mqs = market.mqs || { score: 50, zone: 'YELLOW', label: 'Data tidak cukup', breadthPct: 50, components: {} };
  const durS = ((performance.now() - t0) / 1000).toFixed(1);
  lastResult = {
    longs: topLongs, shorts: topShorts, all: scored, mqs, market, qpop,
    radar: extras.radar, portfolio: extras.portfolio, clusters: extras.clusters,
    hist: extras.hist,
    ts: new Date(), nEngines: N_ENGINE, durationSec: durS,
    coinsScanned: scored.length,
  };

  // kartu MQS + dashboard pasar
  const mqsCard = document.getElementById('mqsCard');
  mqsCard.style.display = 'flex';
  const colorMap = { GREEN: 'var(--green)', YELLOW: 'var(--accent)', RED: 'var(--red)' };
  document.getElementById('mqsNum').textContent = mqs.score;
  document.getElementById('mqsNum').style.color = colorMap[mqs.zone];
  document.getElementById('mqsZone').textContent = `${mqs.zone} — ${mqs.label.split(' — ')[0]}`;
  document.getElementById('mqsZone').style.color = colorMap[mqs.zone];
  document.getElementById('mqsNote').textContent =
    `${mqs.label}. Breadth 24h: ${mqs.breadthPct}% coin naik · Regime pasar: ${market.regime || '-'}`;

  renderMarketDashboard(market, scored);
  renderEngineMatrix(scored, qpop);
  renderEventRadar(extras.radar);
  renderPortfolio(extras.portfolio, extras.clusters);

  document.getElementById('lastUpdate').textContent =
    `Terakhir scan: ${new Date().toLocaleTimeString('id-ID')} · ${scored.length} koin · ${N_ENGINE} engine selesai dalam ${durS}s`;

  document.getElementById('imgBtn').disabled = false;
  document.getElementById('txtBtn').disabled = false;
  document.getElementById('csvBtn').disabled = false;

  showToast(`Scan selesai: ${scored.length} koin dianalisis oleh ${N_ENGINE} engine dalam ${durS}s`, 'success');
}

function renderEventRadar(radar) {
  const el = document.getElementById('eventRadar');
  if (!el) return;
  if (!radar || !radar.length) {
    el.innerHTML = '<div class="empty-ev">Tidak ada event ekstrem yang terdeteksi di seluruh engine saat ini.</div>';
    el.style.display = 'block';
    return;
  }
  el.innerHTML = radar.map(r => `
    <div class="ev-item">
      <span class="ev-sym">${esc(r.sym)}</span>
      <span class="ev-tags">${r.events.map(e => `<span class="ev-tag">${esc(e)}</span>`).join('')}</span>
    </div>`).join('');
  el.style.display = 'block';
}

function renderPortfolio(pf, clusters) {
  const el = document.getElementById('pfGrid');
  if (!el) return;
  let html = '';
  if (pf && pf.weights && pf.weights.length) {
    const rows = pf.weights.map(w => `
      <div class="w-row">
        <span class="w-sym">${esc(w.sym)}</span>
        <span class="w-dir ${w.dir === 'LONG' ? 'pos' : 'neg'}">${w.dir}</span>
        <span class="w-val">${fx(w.wPct, 1)}%</span>
      </div>`).join('');
    html += `<div class="pf-card">
      <div class="em-head" style="color:var(--accent)">⚖ BASKET LONG-SHORT · BOBOT INVERS-VOLATILITAS</div>
      <div class="pf-weights">${rows}</div>
      <div class="em-row">Vol basket 24j: ${fx(pf.dailyVolPct, 2)}% · VaR95 harian: ${fx(pf.var95DailyPct, 2)}%</div>
      <div class="em-row">Net beta vs BTC: ${fx(pf.netBeta, 2)} · korelasi rata²: ${fx(pf.avgPairCorr, 2)} · diversifikasi ${fx(pf.diversification * 100, 0)}%</div>
      <div class="em-row">Gross 100% long + 100% short — net exposure ±0 (market-neutral)</div>
    </div>`;
  }
  if (clusters && clusters.clusters && clusters.clusters.length > 1) {
    html += `<div class="pf-card">
      <div class="em-head" style="color:var(--blue)">🧬 CLUSTER KORELASI · THRESHOLD ${Math.round(clusters.threshold * 100)}%</div>
      ${clusters.clusters.slice(0, 12).map(c =>
        `<div class="cl-row"><span class="cl-n">${c.syms.length}</span> ${c.syms.map(esc).join(' · ')} <span class="cl-c">ρ̄ ${fx(c.avgCorr, 2)}</span></div>`).join('')}
      <div class="em-row">${clusters.nClusters} cluster — koin dalam cluster yang sama itu redundan; pilih salah satu saja untuk diversifikasi.</div>
    </div>`;
  }
  if (!html) { el.style.display = 'none'; return; }
  el.innerHTML = html;
  el.style.display = 'grid';
}

function renderMarketDashboard(market, scored) {
  const el = document.getElementById('marketDash');
  if (!el) return;
  const N = market.network, X = market.cross;
  const items = [];
  if (X && Number.isFinite(X.breadth)) items.push(['Breadth 24h', Math.round(X.breadth * 100) + '% naik', X.breadth > 0.55 ? 'pos' : X.breadth < 0.4 ? 'neg' : '']);
  if (X && Number.isFinite(X.dispersion)) items.push(['Dispersi σ 24h', fx(X.dispersion, 1) + '%', '']);
  if (X && Number.isFinite(X.mcOsc)) items.push(['Adv/Decl 1j', (X.mcOsc >= 0 ? '+' : '') + Math.round(X.mcOsc * 100) + '%', X.mcOsc >= 0 ? 'pos' : 'neg']);
  if (N) {
    items.push(['Korelasi rata²', fx(N.avgCorr, 2), Math.abs(N.avgCorr) > 0.6 ? 'neg' : '']);
    items.push(['λ₁ pasar', fx(N.lam1Share * 100, 0) + '% var', '']);
    items.push(['MP bound λ₊', fx(N.mpPlus, 2) + (N.aboveMP ? ' (λ₁>noise)' : ' (di bawah noise!)'), N.aboveMP ? '' : 'neg']);
    items.push(['Absorption ratio', fx(N.absorption, 2), N.absorption > 0.45 ? 'neg' : 'pos']);
  }
  const garchAgg = scored.map(s => s.bundle?.vol?.garch?.nextPct).filter(Number.isFinite);
  if (garchAgg.length > 5) items.push(['GARCH σ 1j median', fx(QE.median(garchAgg), 2) + '%', '']);
  items.push(['Regime', market.regime || '-', market.regime && market.regime.includes('CRISIS') ? 'neg' : market.regime && market.regime.includes('RISK-ON') ? 'pos' : '']);
  el.innerHTML = items.map(([k, v, cls]) =>
    `<div class="md-item"><div class="md-k">${esc(k)}</div><div class="md-v ${cls}">${esc(v)}</div></div>`).join('');
  el.style.display = 'grid';
}

function renderEngineMatrix(scored, qpop) {
  const el = document.getElementById('engineMatrix');
  if (!el) return;
  const T = qpop.thresholds || {};
  const cnt = (fn) => scored.filter(fn).length;
  const leaders = (key, dir, m) => scored
    .map(s => ({ s, v: s.bundle['_' + key] }))
    .filter(x => Number.isFinite(x.v))
    .sort((a, b) => dir * (b.v - a.v)).slice(0, 3);

  const fam = [
    {
      name: 'FRACTAL & PERSISTENSI', color: 'var(--blue)',
      rows: [
        `Trending kuat (H>p85): ${cnt(s => s.bundle._hurst != null && T.trending != null && s.bundle._hurst > T.trending)} koin`,
        `Mean-revert kuat (H<p15): ${cnt(s => s.bundle._hurst != null && T.meanRevert != null && s.bundle._hurst < T.meanRevert)} koin`,
        `VR(4) momentum signifikan (|z|>1.96): ${cnt(s => s.bundle.meanRev?.vr && Math.abs(s.bundle.meanRev.vr.z4 || 0) > 1.96)} koin`,
        `Stasioner (DF t<−2.88): ${cnt(s => s.bundle.meanRev?.ou?.stationary)} koin`,
      ],
      lead: leaders('hurst', 1).map(x => `${x.s.core.coin.symbol.toUpperCase()} ${fx(x.v, 2)}`),
      leadLabel: 'Hurst tertinggi',
    },
    {
      name: 'VOLATILITAS & GARCH', color: 'var(--accent)',
      rows: [
        `Vol expanding (ratio>1.25): ${cnt(s => s.bundle.vol?.garch?.ratio > 1.25)} koin`,
        `Squeeze Bollinger (BW<p10): ${cnt(s => T.squeeze != null && s.bundle._bollBw != null && s.bundle._bollBw < T.squeeze)} koin`,
        `Vol tinggi (σ1j>p90): ${cnt(s => T.highVol != null && s.bundle._garchNext != null && s.bundle._garchNext > T.highVol)} koin`,
        `Persistence GARCH>0.97: ${cnt(s => s.bundle.vol?.garch?.persist > 0.97)} koin`,
      ],
      lead: leaders('garchNext', 1).map(x => `${x.s.core.coin.symbol.toUpperCase()} ${fx(x.v, 2)}%`),
      leadLabel: 'σ GARCH 1j tertinggi',
    },
    {
      name: 'INFORMASI & CHAOS', color: 'var(--green)',
      rows: [
        `Autokorelasi signifikan (LB p<0.05): ${cnt(s => s.bundle.econ?.lb?.p < 0.05)} koin`,
        `Ekor gemuk (Hill α<3): ${cnt(s => s.bundle.mom?.hill?.alpha < 3)} koin`,
        `Chaotic (λ Lyapunov>0.02): ${cnt(s => s.bundle.mom?.lyap?.lambda > 0.02)} koin`,
        `Non-Gaussian (JB p<0.05): ${cnt(s => s.bundle.mom?.jb?.jbP < 0.05)} koin`,
      ],
      lead: leaders('lyap', 1).map(x => `${x.s.core.coin.symbol.toUpperCase()} ${fx(x.v, 3)}`),
      leadLabel: 'Lyapunov tertinggi',
    },
    {
      name: 'PORTOFOLIO & RISIKO', color: 'var(--red)',
      rows: [
        `Beta>1.5 vs BTC: ${cnt(s => s.bundle.port?.btc?.beta > 1.5)} koin`,
        `Alpha harian >0: ${cnt(s => (s.bundle.port?.btc?.alphaPerDayPct || 0) > 0)} koin`,
        `Kelly f*>0 (long edge): ${cnt(s => s.bundle.port?.kelly?.kelly > 0)} koin`,
        `Tail-dep atas λU>0.5 dgn BTC: ${cnt(s => s.bundle.port?.tail?.lamU > 0.5)} koin`,
      ],
      lead: leaders('kelly', 1).map(x => `${x.s.core.coin.symbol.toUpperCase()} ${fx(x.v, 2)}`),
      leadLabel: 'Kelly f* terbesar',
    },
  ];
  el.innerHTML = fam.map(f => `
    <div class="em-card">
      <div class="em-head" style="color:${f.color}">${esc(f.name)}</div>
      ${f.rows.map(r => `<div class="em-row">${esc(r)}</div>`).join('')}
      <div class="em-lead"><span class="em-lead-k">${esc(f.leadLabel)}:</span> ${f.lead.map(esc).join(' · ') || '–'}</div>
    </div>`).join('');
  el.style.display = 'grid';
}

function renderList(elId, items, kind, hist) {
  const el = document.getElementById(elId);
  if (!items.length) {
    el.innerHTML = `<div class="empty">Tidak ada kandidat ${kind === 'long' ? 'bullish' : 'bearish'} yang cukup kuat saat ini.</div>`;
    return;
  }
  el.innerHTML = items.map((s, i) => {
    const c = s.core.coin;
    const chgCls = s.core.chg24h >= 0 ? 'pos' : 'neg';
    const scoreCls = kind === 'long' ? 'score-long' : 'score-short';
    const img = c.image ? `<img class="coin-img" src="${esc(c.image)}" loading="lazy" onerror="this.style.visibility='hidden'">` : '<div class="coin-img"></div>';
    const confCls = s.core.confidence >= 70 ? 'conf-high' : s.core.confidence >= 40 ? 'conf-mid' : 'conf-low';
    const confLabel = s.core.confidence >= 70 ? 'Data kuat' : s.core.confidence >= 40 ? 'Data cukup' : 'Data tipis';
    const b = s.bundle;
    const mini = [
      b._hurst != null ? `H ${fx(b._hurst, 2)}` : null,
      b.vol?.garch?.nextPct != null ? `s1j ${fx(b.vol.garch.nextPct, 2)}%` : null,
      b.port?.btc?.beta != null ? `B ${fx(b.port.btc.beta, 2)}` : null,
      s.meta ? `p_up ${Math.round(s.meta.pUp * 100)}%` : null,
    ].filter(Boolean).join(' · ');
    // badge perbandingan riwayat scan
    let deltaHtml = '';
    const hd = hist && hist.deltas ? hist.deltas[c.id] : null;
    if (hd) {
      const rankNow = i + 1;
      const rd = hd.prevRank - rankNow;
      if (hd.prevDir && hd.prevDir !== s.finalDir) {
        deltaHtml = `<span class="rd flip" title="Arah berubah vs scan sebelumnya (dulu ${hd.prevDir})">⇄ ${esc(hd.prevDir)}</span>`;
      } else if (rd > 0) {
        deltaHtml = `<span class="rd up" title="Naik ${rd} peringkat dari scan sebelumnya (#${hd.prevRank})">▲${rd}</span>`;
      } else if (rd < 0) {
        deltaHtml = `<span class="rd dn" title="Turun ${-rd} peringkat dari scan sebelumnya (#${hd.prevRank})">▼${-rd}</span>`;
      }
    }
    return `
      <div class="coin-row" data-cid="${esc(c.id)}" onclick="openCoinModal('${esc(c.id)}')" title="Klik untuk detail ${N_ENGINE} engine">
        <span class="coin-rank">${i + 1}</span>
        ${img}
        <div class="coin-main">
          <div class="coin-sym">${esc((c.symbol || '').toUpperCase())}</div>
          <div class="coin-name">${esc(c.name || '')}</div>
          <div class="coin-mini">${esc(mini)}</div>
        </div>
        <div class="coin-stats">
          <div class="coin-price">${fmtPrice(c.current_price || 0)}</div>
          <div class="coin-chg ${chgCls}">${s.core.chg24h >= 0 ? '+' : ''}${s.core.chg24h.toFixed(1)}% (24h)</div>
        </div>
        <div class="coin-score-wrap">
          <div class="coin-score ${scoreCls}">${s.finalScore}</div>
          ${deltaHtml}
          <div class="conf-badge ${confCls}" title="Confidence ${s.core.confidence}% · agreement ensemble ${s.meta ? s.meta.agreePct + '%' : '-'}">${confLabel}</div>
        </div>
      </div>
    `;
  }).join('');
}

function setDot(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'dot' + (state === 'ok' ? ' ok' : state === 'bad' ? ' bad' : state === 'spin' ? ' spin' : '');
}

/* ══════════════════════════════════════════════════════════════════
   MODAL DETAIL ENGINE PER KOIN
   ══════════════════════════════════════════════════════════════════ */

function findScanItem(cid) {
  if (!lastResult) return null;
  return lastResult.all.find(s => s.core.coin.id === cid);
}

function openCoinModal(cid) {
  const s = findScanItem(cid);
  if (!s) return;
  const el = document.getElementById('engineModal');
  const c = s.core.coin;
  const b = s.bundle;
  const pct = lastResult.qpop?.pctRank?.[b.sym] || {};

  const rows = engineRows(s, pct);
  const html = `
    <div class="modal-box" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div>
          <div class="modal-sym">${esc((c.symbol || '').toUpperCase())} <span class="modal-name">${esc(c.name || '')}</span></div>
          <div class="modal-sub">${fmtPrice(c.current_price)} · 1j ${fmtSigned(s.core.chg1h)} · 24j ${fmtSigned(s.core.chg24h)} · 7h ${fmtSigned(s.core.chg7d)}
            · skor inti ${s.core.score} (conf ${s.core.confidence}%)</div>
        </div>
        <button class="modal-close" onclick="closeCoinModal()">✕</button>
      </div>
      <div class="modal-ens">
        <div><span class="me-k">Ensemble Bayesian</span>
          <span class="me-v ${s.blend >= 0 ? 'pos' : 'neg'}">${s.finalDir === 'LONG' ? '▲ BULLISH' : '▼ BEARISH'} · skor ${s.finalScore}</span></div>
        <div><span class="me-k">p(skor naik)</span><span class="me-v">${s.meta ? Math.round(s.meta.pUp * 100) + '%' : '–'}</span></div>
        <div><span class="me-k">Agreement</span><span class="me-v">${s.meta ? s.meta.agreePct + '%' : '–'}</span></div>
        <div><span class="me-k">Fisher χ² gabungan</span><span class="me-v">${s.meta?.fisher ? `${s.meta.fisher.chi2.toFixed(0)} (df ${s.meta.fisher.df}, p=${s.meta.fisher.p < 0.001 ? '<0.001' : s.meta.fisher.p.toFixed(3)})` : '–'}</span></div>
      </div>
      ${s.meta && s.meta.drivers && s.meta.drivers.length ? `<div class="modal-drivers">${s.meta.drivers.map(d => `<div>▸ ${esc(d)}</div>`).join('')}</div>` : ''}
      ${s.tradePlan ? `<div class="mc-strip" style="border-color:rgba(240,192,64,.4);background:rgba(240,192,64,.06)">
        <span class="mc-k" style="color:var(--accent);font-weight:700">🎯 AUTO VOLATILITY SETUP (${s.finalDir}):</span>
        <span>Area Entry: <b>${fmtPrice(s.tradePlan.entryLo)} – ${fmtPrice(s.tradePlan.entryHi)}</b></span>
        <span class="mc-b neg">SL: ${fmtPrice(s.tradePlan.sl)} (-${s.tradePlan.slPct}%)</span>
        <span class="mc-b pos">TP1: ${fmtPrice(s.tradePlan.tp1)} (+${s.tradePlan.tp1Pct}%)</span>
        <span class="mc-b pos">TP2: ${fmtPrice(s.tradePlan.tp2)} (+${s.tradePlan.tp2Pct}%)</span>
      </div>` : ''}
      <canvas id="modalSpark" width="640" height="110"></canvas>
      ${b.mc ? `<div class="mc-strip">
        <span class="mc-k">MC 24j:</span>
        <span class="mc-b neg">${fx(b.mc.p5, 1)}%</span>
        <span>${fx(b.mc.p25, 1)}%</span>
        <span class="mc-mid">${fx(b.mc.p50, 1)}%</span>
        <span>${fx(b.mc.p75, 1)}%</span>
        <span class="mc-b pos">+${fx(b.mc.p95, 1)}%</span>
        <span class="mc-p">P5–P95 · ${(b.mc.probUp * 100).toFixed(0)}% lintasan naik</span>
      </div>` : ''}
      <div class="modal-body">${rows}</div>
    </div>`;
  el.innerHTML = html;
  el.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  drawModalSpark(b._prices || []);
}

function closeCoinModal() {
  const el = document.getElementById('engineModal');
  el.style.display = 'none';
  el.innerHTML = '';
  document.body.style.overflow = '';
}

function drawModalSpark(prices) {
  const cv = document.getElementById('modalSpark');
  if (!cv || !prices || prices.length < 2) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, n = prices.length;
  const hi = Math.max(...prices), lo = Math.min(...prices);
  ctx.clearRect(0, 0, W, H);
  
  // Background container
  ctx.fillStyle = '#171b26';
  ctx.fillRect(0, 0, W, H);
  
  const up = prices[n - 1] >= prices[0];
  const strokeColor = up ? '#21d19f' : '#ff5470';
  const fillColorTop = up ? 'rgba(33, 209, 159, 0.18)' : 'rgba(255, 84, 112, 0.18)';

  // Gradient area fill under sparkline
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, fillColorTop);
  grad.addColorStop(1, 'rgba(23, 27, 38, 0)');
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (W - 16) + 8;
    const y = H - 12 - ((prices[i] - lo) / Math.max(1e-9, hi - lo)) * (H - 24);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.lineTo(W - 8, H);
  ctx.lineTo(8, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Stroke line
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (W - 16) + 8;
    const y = H - 12 - ((prices[i] - lo) / Math.max(1e-9, hi - lo)) * (H - 24);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Typography & Legend
  ctx.fillStyle = '#9aa3b8';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillText(`Sparkline 7 hari · ${n} titik observasi per-jam`, 10, 16);
  ctx.fillStyle = strokeColor;
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(up ? '▲ 7d Net Up' : '▼ 7d Net Down', W - 10, 16);
  ctx.textAlign = 'left';
}

// baris-baris detail engine untuk modal (dan dipakai ulang di TXT)
function engineRows(s, pct) {
  const b = s.bundle;
  const P = (k) => pct && pct[k] !== undefined ? ` [pc${Math.round(pct[k] * 100)}]` : '';
  const fam = [];

  fam.push(['A · VOLATILITAS & REGIME', [
    b.vol.rv && `RV term structure: 24j ${fx(b.vol.rv.rv24, 2)}% · 72j ${fx(b.vol.rv.rv72, 2)}% · 168j ${fx(b.vol.rv.rv168, 2)}%/jam`,
    b.vol.garch && `GARCH(1,1): σ next 1j ${fx(b.vol.garch.nextPct, 3)}% · long-run ${fx(b.vol.garch.longRunPct, 3)}%/j (ann ${fx(b.vol.garch.annPct, 0)}%) · α ${fx(b.vol.garch.alpha, 3)} β ${fx(b.vol.garch.beta, 3)} · persist ${fx(b.vol.garch.persist, 3)} · regime ${b.vol.garch.regime}${P('garchNext')}`,
    b.vol.parkinson && `Parkinson: ${fx(b.vol.parkinson.pctPerHour, 3)}%/jam`,
    b.vol.gk && `Garman-Klass: ${fx(b.vol.gk.pctPerHour, 3)}%/jam`,
    b.vol.vov && `Vol-of-vol: ${fx(b.vol.vov.cov, 2)} (${b.vol.vov.regime})`,
    b.vol.boll && `Bollinger: BW ${fx(b.vol.boll.bwPct, 2)}%${P('bollBw')} · %B ${fx(b.vol.boll.pctB, 2)}${b._bollBw != null && lastResult?.qpop?.thresholds?.squeeze != null && b._bollBw < lastResult.qpop.thresholds.squeeze ? ' · SQUEEZE' : ''}`,
    b.vol.donchian && `Donchian 7d: posisi ${fx(b.vol.donchian.pos * 100, 0)}% dari range`,
    b.vol.amihud && `Amihud illiquidity: ${b.vol.amihud.illiq.toExponential(2)}${P('amihud')}${b.turnover != null ? ` · turnover ${fx(b.turnover * 100, 2)}%/hari` : ''}`,
  ]]);

  fam.push(['B · MEAN REVERSION & FRAKTAL', [
    b.meanRev.ou && `OU: φ ${fx(b.meanRev.ou.phi, 4)} · θ ${fx(b.meanRev.ou.theta, 4)}/j · half-life ${b.meanRev.ou.halfLife != null ? fx(b.meanRev.ou.halfLife, 1) + ' jam' : '∞ (tak mean-revert)'} · DF t ${fx(b.meanRev.ou.tStat, 2)} ${b.meanRev.ou.stationary ? '→ STASIONER (mean-revert signifikan)' : '→ non-stasioner'} · deviasi level ${fx(b.meanRev.ou.devZ, 2)}σ`,
    b.meanRev.hurstRS && b.meanRev.dfa && `Hurst: R/S ${fx(b.meanRev.hurstRS.H, 3)} · DFA ${fx(b.meanRev.dfa.H, 3)} · konsensus ${fx(b._hurst, 3)}${P('hurst')} ${b._hurst > 0.54 ? '→ persisten (trending)' : b._hurst < 0.46 ? '→ anti-persisten (mean-revert)' : '→ random-walk'}`,
    b.meanRev.vr && `Variance ratio: VR(2) ${fx(b.meanRev.vr.vr2, 2)} · VR(4) ${fx(b.meanRev.vr.vr4, 2)} (z ${fx(b.meanRev.vr.z4, 2)}) · VR(8) ${fx(b.meanRev.vr.vr8, 2)} (z ${fx(b.meanRev.vr.z8, 2)}) ${Math.abs(b.meanRev.vr.z4) > 1.96 ? '→ signifikan' : '→ tidak signifikan'}`,
    b.meanRev.katz && b.meanRev.higuchi && `Fractal dim: Katz ${fx(b.meanRev.katz.fd, 3)} · Higuchi ${fx(b.meanRev.higuchi.fd, 3)}`,
    b.meanRev.cross && `Level-crossing (Rice): ${fx(b.meanRev.cross.ratio, 2)}× ekspektasi iid`,
  ]]);

  fam.push(['C · TEORI INFORMASI', [
    b.info.shannon && `Shannon entropy: ${fx(b.info.shannon.H, 3)} (norm ${fx(b.info.shannon.norm, 3)})`,
    b.info.perm && `Permutation entropy: ${fx(b.info.perm.norm, 3)}${P('permEnt')} ${b.info.perm.norm > 0.9 ? '→ sangat acak' : b.info.perm.norm < 0.75 ? '→ terstruktur' : ''}`,
    b.info.lz && `Lempel-Ziv LZ76: c=${b.info.lz.c} (norm ${fx(b.info.lz.norm, 2)})${P('lz')}`,
    b.sig.period && `Spectral flatness via periodogram (share puncak ${fx(b.sig.period.share * 100, 1)}%)`,
    b.info.ks && `KS normalitas: D ${fx(b.info.ks.D, 3)} · p ${b.info.ks.p < 0.001 ? '<0.001' : fx(b.info.ks.p, 3)}`,
  ]]);

  fam.push(['D · MOMEN TINGGI & EKOR', [
    b.mom.jb && `Skew ${fx(b.mom.jb.skew, 2)} · excess kurtosis ${fx(b.mom.jb.exKurt, 2)} · JB ${fx(b.mom.jb.jb, 1)} (p ${b.mom.jb.jbP < 0.001 ? '<0.001' : fx(b.mom.jb.jbP, 3)})`,
    b.mom.hill && `Hill tail index: α ${fx(b.mom.hill.alpha, 2)} ${b.mom.hill.alpha < 3 ? '(varian tak-hingga-ish, ekor sangat gemuk)' : b.mom.hill.alpha < 5 ? '(ekor gemuk)' : '(mendekati Gaussian)'}`,
    b.mom.zipf && `Zipf power-law slope: ${fx(b.mom.zipf.slope, 2)} (R² ${fx(b.mom.zipf.r2, 2)})`,
    b.mom.lyap && `Lyapunov (Rosenstein): λ ${fx(b.mom.lyap.lambda, 4)}/jam${P('lyap')} ${b.mom.lyap.lambda > 0.02 ? '→ chaotic/sensitif-kondisi-awal' : ''}`,
    b.mom.dd && `Max drawdown 7d ${fx(b.mom.dd.maxDDPct, 1)}% · Ulcer ${fx(b.mom.dd.ulcer, 2)} · DD saat ini ${fx(b.mom.dd.curDDPct, 1)}% · ${b.mom.dd.hoursSincePeak} jam dari puncak`,
  ]]);

  fam.push(['E · SIGNAL PROCESSING', [
    b.sig.period && b.sig.period.domPeriod && `FFT: siklus dominan ${fx(b.sig.period.domPeriod, 0)} jam (share energi ${fx(b.sig.period.share * 100, 1)}%) · spectral entropy ${fx(b.sig.period.specEnt, 3)}`,
    b.sig.haar && `Haar wavelet: energi per skala [${b.sig.haar.energies.map(e => fx(e * 100, 0)).join(', ')}]% (skala 2-32j) · dominan ${b.sig.haar.domScale}j ${b.sig.haar.domDir > 0 ? '↑' : b.sig.haar.domDir < 0 ? '↓' : '·'}`,
    b.sig.hilbert && `Hilbert: periode instanan ${fx(b.sig.hilbert.period, 0)}j · posisi siklus ${fx(b.sig.hilbert.cycPos, 2)} · amplitudo ${fx(b.sig.hilbert.ampPct, 2)}%`,
    b.sig.fisher && `Fisher transform: ${fx(b.sig.fisher.fisher, 2)}${P('fisher')} ${b.sig.fisher.extreme ? '→ EKSTREM (watch reversal)' : ''}`,
  ]]);

  fam.push(['F · STATE-SPACE & FILTER', [
    b.filt.kalman && `Kalman: slope ${fx(b.filt.kalman.slopePct, 3)}%/jam · SNR ${fx(b.filt.kalman.snr, 2)} · innov terakhir ${fx(b.filt.kalman.innovZ, 2)}σ`,
    b.filt.hp && `Hodrick-Prescott: cycle ${fx(b.filt.hp.cycleZ, 2)}σ ${Math.abs(b.filt.hp.cycleZ) > 1.5 ? '(jauh dari tren — tarikan mean-revert)' : ''} · tren ${fx(b.filt.hp.trendSlopePct, 3)}%/jam`,
    b.filt.cusum && `CUSUM: ${b.filt.cusum.alarms} break terdeteksi · terakhir ${b.filt.cusum.hoursSince != null ? b.filt.cusum.hoursSince + ' jam lalu (' + (b.filt.cusum.lastDir > 0 ? 'naik' : 'turun') + ')' : '–'}${b.filt.cusum.postDriftPct != null ? ` · drift post-break ${fx(b.filt.cusum.postDriftPct, 3)}%/j` : ''}`,
    b.filt.ss && `Ehlers SuperSmoother: slope ${fx(b.filt.ss.slopePctPerHour, 3)}%/jam`,
    b.filt.sg && `Savitzky-Golay: d/dt ${fx(b.filt.sg.derivPctPerHour, 3)}%/jam · akselerasi ${fx(b.filt.sg.accelPct, 4)}%/j²`,
  ]]);

  fam.push(['G · EKONOFISIKA & MEMORY', [
    b.econ.diff && `Einstein diffusion: β ${fx(b.econ.diff.beta, 3)} → ${b.econ.diff.verdict}`,
    b.econ.markov && `Markov: pUU ${fx(b.econ.markov.pUU, 2)} · pDD ${fx(b.econ.markov.pDD, 2)} · persistensi ${fx(b.econ.markov.persistence, 2)} · π(naik) ${fx(b.econ.markov.piUp, 2)}`,
    b.econ.lb && `Ljung-Box (m=12): Q ${fx(b.econ.lb.Q, 1)} · p ${b.econ.lb.p < 0.001 ? '<0.001' : fx(b.econ.lb.p, 3)} ${b.econ.lb.p < 0.05 ? '→ ada memori/autokorelasi' : '→ indistinguishable dari acak'} · ρ₁ ${fx(b.econ.lb.rho1, 3)}`,
    b.econ.er && `Kaufman ER: ${fx(b.econ.er.er, 3)} ${b.econ.er.er > 0.35 ? '(efisien/trendy)' : b.econ.er.er < 0.15 ? '(choppy)' : ''}`,
    b.econ.chop && `Choppiness: ${fx(b.econ.chop.chop, 1)} ${b.econ.chop.chop > 61.8 ? '(konsolidasi)' : b.econ.chop.chop < 38.2 ? '(trending)' : ''}`,
    b.econ.granger && `Lagged x-corr vs BTC: ρ₀ ${fx(b.econ.granger.r0, 2)} · max ${fx(b.econ.granger.bestR, 2)} @lag ${b.econ.granger.bestLag}j ${b.econ.granger.leads ? '(MEMIMPIN BTC)' : ''}`,
  ]]);

  fam.push(['H · PORTOFOLIO & RISIKO', [
    b.port.btc && `vs BTC: β ${fx(b.port.btc.beta, 2)} (t ${fx(b.port.btc.tBeta, 1)}) · α ${fmtSigned(b.port.btc.alphaPerDayPct, 2)}/hari · R² ${fx(b.port.btc.r2, 2)} · idio σ ${fx(b.port.btc.idioPctPerHour, 3)}%/j`,
    b.port.tail && `Tail dependence vs BTC: λU ${fx(b.port.tail.lamU, 2)} · λL ${fx(b.port.tail.lamL, 2)}`,
    b.port.ssratio && `Sharpe (7d, ann) ${fx(b.port.ssratio.sharpe, 2)}${P('sharpe')} · Sortino ${fx(b.port.ssratio.sortino, 2)}`,
    b.port.iratio && `Information ratio vs BTC: ${fx(b.port.iratio.ir, 2)}`,
    b.port.kelly && `Kelly: f* ${fx(b.port.kelly.kelly * 100, 1)}%${P('kelly')} · half-Kelly ${fx(b.port.kelly.halfKelly * 100, 1)}%`,
    b.port.var && `VaR 95% 24j: parametrik ${fx(b.port.var.param95, 2)}%${b.port.var.hist95 != null ? ` · historis ${fx(b.port.var.hist95, 2)}%` : ''}`,
    b.mc && `Monte Carlo 24j (2000 lintasan): P5 ${fx(b.mc.p5, 1)}% · P25 ${fx(b.mc.p25, 1)}% · P50 ${fx(b.mc.p50, 1)}% · P75 ${fx(b.mc.p75, 1)}% · P95 ${fx(b.mc.p95, 1)}% · P(naik) ${fx(b.mc.probUp * 100, 0)}%`,
    b.port.sr && `Support ${b.port.sr.support != null ? fmtPrice(b.port.sr.support) + ' (' + fx(b.port.sr.supportDistPct, 1) + '%)' : '–'} · Resistance ${b.port.sr.resistance != null ? fmtPrice(b.port.sr.resistance) + ' (+' + fx(b.port.sr.resistDistPct, 1) + '%)' : '–'}`,
  ]]);

  fam.push(['K · WALK-FORWARD OUT-OF-SAMPLE', [
    b.replay && b.replay.wf && `Hit-rate OOS: ${fx(b.replay.wf.hitRate * 100, 0)}% (${b.replay.wf.n} checkpoint) — ` +
      b.replay.wf.checkpoints.map(c =>
        `t+${c.oosH}j: ${c.smom > 0 ? '+' : ''}${c.smom}σ → ${c.oosPct >= 0 ? '+' : ''}${c.oosPct}% ${c.hit ? 'BENAR' : 'SALAH'}`).join(' | '),
    b.replay && b.replay.wf && b.replay.wf.hitRate === 0 && b.replay.wf.n >= 2 && '⚠ Sinyal momentum koin ini GAGAL konsisten di out-of-sample — anti-momentum, waspadai strategi ikut-tren di koin ini',
    b.replay && b.replay.wf && b.replay.wf.hitRate === 1 && b.replay.wf.n >= 2 && '✓ Momentum koin ini terkonfirmasi di out-of-sample terbaru',
  ]]);

  return fam.map(([name, lines]) => {
    const lis = lines.filter(Boolean).map(l => `<div class="eng-line">${esc(l)}</div>`).join('');
    return lis ? `<div class="eng-fam"><div class="eng-fam-name">${esc(name)}</div>${lis}</div>` : '';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   EXPORT — SAVE ALL .TXT · SAVE CSV · SAVE IMAGE
   ══════════════════════════════════════════════════════════════════ */

const LABEL_BULL = 'BULLISH · FREE ALGO';
const LABEL_BEAR = 'BEARISH · FREE ALGO';

function stampForFile(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function fmtSigned(v, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return (v >= 0 ? '+' : '') + v.toFixed(digits) + '%';
}
function fxT(v, d) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return v.toFixed(d === undefined ? 2 : d);
}
function pT(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return '-';
  return p < 0.001 ? '<0.001' : p.toFixed(3);
}

/* ── SAVE ALL .TXT — laporan kuantitatif lengkap semua engine ── */
function buildTxt() {
  const r = lastResult;
  const bar = '='.repeat(78);
  const thin = '-'.repeat(78);
  const L = [];

  L.push(bar);
  L.push(' QUANTUM CRYPTO SCAN v3.1 — LAPORAN KUANTITATIF LENGKAP (SAVE ALL)');
  L.push(` ${r.nEngines} ENGINE · 14 FAMILI · 9 SECTION · 100% CLIENT-SIDE · CoinGecko + Binance`);
  L.push(bar);
  L.push(`Waktu scan        : ${r.ts.toLocaleString('id-ID')}`);
  L.push(`Coin dianalisis   : ${r.all.length} (stabilcoin dibuang otomatis)`);
  L.push(`Engine dijalankan : ${r.nEngines} engine × ${r.all.length} koin, selesai dalam ${r.durationSec}s`);
  L.push(`Data              : sparkline 7 hari per jam (168 titik) + funding/OI futures`);
  L.push('');

  /* [1] MARKET REGIME DASHBOARD */
  const N = r.market.network, X = r.market.cross;
  L.push(bar, ' [1] MARKET REGIME DASHBOARD', bar);
  L.push(`Market Quality Score v2 : ${r.mqs.score}/100 (${r.mqs.zone}) — ${r.mqs.label}`);
  if (r.mqs.components) {
    L.push(`  pilar: breadth ${r.mqs.components.breadthScore} · funding ${r.mqs.components.fundingScore} · sistemik ${r.mqs.components.systemicScore} · vol ${r.mqs.components.volScore}`);
  }
  L.push(`Breadth 24h             : ${r.mqs.breadthPct}% coin naik`);
  if (X) {
    L.push(`Dispersi lintas-seksi   : σ 24j = ${fxT(X.dispersion, 2)}% · skew lintas-seksi ${fxT(X.skewCS, 2)}`);
    L.push(`Adv/Decl 1j (McClellan) : ${(X.mcOsc >= 0 ? '+' : '') + Math.round(X.mcOsc * 100)}% net advancers`);
  }
  if (N) {
    L.push(`Jaringan korelasi       : ${N.n} koin top · korelasi rata-rata ${fxT(N.avgCorr, 3)}`);
    L.push(`Eigen-spectrum (Jacobi) : λ1 = ${fxT(N.lam1, 2)} = ${fxT(N.lam1Share * 100, 1)}% varians (market mode)`);
    L.push(`  5 eigenvalue teratas  : ${N.eigTop5.map(v => fxT(v, 2)).join(', ')}`);
    L.push(`Marchenko-Pastur bound  : λ+ = ${fxT(N.mpPlus, 3)} → λ1 ${N.aboveMP ? 'JAUH di atas noise (ada faktor pasar bersama)' : 'di bawah/noise-level (struktur lemah)'}`);
    L.push(`Absorption ratio (20%)  : ${fxT(N.absorption, 3)} ${N.absorption > 0.45 ? '→ TINGGI: pasar rapuh/sistemik, diversifikasi lemah' : N.absorption < 0.25 ? '→ rendah: diversifikasi baik' : '→ moderat'}`);
  }
  L.push(`Regime klasifikasi      : ${r.market.regime}`);
  L.push('');

  /* [2] & [3] TOP 10 BULLISH & BEARISH — deep dive semua engine */
  const section = (title, items) => {
    L.push(bar, ` ${title}`, bar);
    if (!items.length) { L.push(' (tidak ada kandidat yang cukup kuat saat ini)', ''); return; }
    items.forEach((s, i) => {
      const c = s.core.coin;
      const b = s.bundle;
      const pct = r.qpop?.pctRank?.[b.sym] || {};
      const P = (k) => pct[k] !== undefined ? ` [pc${Math.round(pct[k] * 100)}]` : '';
      L.push(`${String(i + 1).padStart(2)}. ${(c.symbol || '').toUpperCase()} — ${c.name}`);
      L.push(`    Harga ${fmtPrice(c.current_price)} | 1j ${fmtSigned(s.core.chg1h)} | 24j ${fmtSigned(s.core.chg24h)} | 7j ${fmtSigned(s.core.chg7d)}`);
      L.push(`    CORE v2 : skor ${s.core.score} (raw ${fxT(s.core.rawScore, 1)}) · confidence ${s.core.confidence}%${s.core.funding != null ? ` · funding ${fxT(s.core.funding, 4)}%` : ''}`);
      L.push(`    ENSEMBLE: p↑ ${s.meta ? Math.round(s.meta.pUp * 100) + '%' : '-'} · skor ${s.finalScore} · agreement ${s.meta ? s.meta.agreePct + '%' : '-'} · blend final ${fxT(s.blend, 1)}`);
      if (s.meta?.fisher) L.push(`    FISHER  : χ² gabungan ${fxT(s.meta.fisher.chi2, 1)} (df ${s.meta.fisher.df}) → p = ${pT(s.meta.fisher.p)}`);
      if (s.tradePlan) {
        L.push(`    SETUP   : Area Entry ${fmtPrice(s.tradePlan.entryLo)} - ${fmtPrice(s.tradePlan.entryHi)} | SL ${fmtPrice(s.tradePlan.sl)} (-${s.tradePlan.slPct}%) | TP1 ${fmtPrice(s.tradePlan.tp1)} (+${s.tradePlan.tp1Pct}%) | TP2 ${fmtPrice(s.tradePlan.tp2)} (+${s.tradePlan.tp2Pct}%)`);
      }
      const fam = [
        ['A·VOL', [
          b.vol.rv && `RV24 ${fxT(b.vol.rv.rv24, 2)}% RV72 ${fxT(b.vol.rv.rv72, 2)}% RV168 ${fxT(b.vol.rv.rv168, 2)}%/j`,
          b.vol.garch && `GARCH next ${fxT(b.vol.garch.nextPct, 3)}%/j LR ${fxT(b.vol.garch.longRunPct, 3)}%/j ann ${fxT(b.vol.garch.annPct, 0)}% α ${fxT(b.vol.garch.alpha, 3)} β ${fxT(b.vol.garch.beta, 3)} persist ${fxT(b.vol.garch.persist, 3)} regime ${b.vol.garch.regime}${P('garchNext')}`,
          b.vol.parkinson && `Parkinson ${fxT(b.vol.parkinson.pctPerHour, 3)}%/j · GK ${b.vol.gk ? fxT(b.vol.gk.pctPerHour, 3) + '%/j' : '-'} · VoV ${b.vol.vov ? fxT(b.vol.vov.cov, 2) : '-'}`,
          b.vol.boll && `BollBW ${fxT(b.vol.boll.bwPct, 2)}%${P('bollBw')} %B ${fxT(b.vol.boll.pctB, 2)}${(b._bollBw != null && r.qpop?.thresholds?.squeeze != null && b._bollBw < r.qpop.thresholds.squeeze) ? ' [SQUEEZE]' : ''} · Donchian ${b.vol.donchian ? Math.round(b.vol.donchian.pos * 100) + '%' : '-'}`,
          b.vol.amihud && `Amihud ${b.vol.amihud.illiq.toExponential(2)}${P('amihud')}${b.turnover != null ? ` · turnover ${fxT(b.turnover * 100, 2)}%/hari` : ''}`,
        ]],
        ['B·MREV', [
          b.meanRev.ou && `OU φ ${fxT(b.meanRev.ou.phi, 4)} HL ${b.meanRev.ou.halfLife != null ? fxT(b.meanRev.ou.halfLife, 1) + 'j' : '∞'} DFt ${fxT(b.meanRev.ou.tStat, 2)}${b.meanRev.ou.stationary ? ' [STASIONER]' : ''} devZ ${fxT(b.meanRev.ou.devZ, 2)}`,
          b.meanRev.hurstRS && b.meanRev.dfa && `Hurst RS ${fxT(b.meanRev.hurstRS.H, 3)} DFA ${fxT(b.meanRev.dfa.H, 3)} konsensus ${fxT(b._hurst, 3)}${P('hurst')}`,
          b.meanRev.vr && `VR2 ${fxT(b.meanRev.vr.vr2, 2)} VR4 ${fxT(b.meanRev.vr.vr4, 2)}(z ${fxT(b.meanRev.vr.z4, 2)}) VR8 ${fxT(b.meanRev.vr.vr8, 2)}(z ${fxT(b.meanRev.vr.z8, 2)})`,
          b.meanRev.katz && `Katz FD ${fxT(b.meanRev.katz.fd, 3)} · Higuchi FD ${b.meanRev.higuchi ? fxT(b.meanRev.higuchi.fd, 3) : '-'} · crossing ${b.meanRev.cross ? fxT(b.meanRev.cross.ratio, 2) + '×iid' : '-'}`,
        ]],
        ['C·INFO', [
          b.info.shannon && `Shannon ${fxT(b.info.shannon.H, 3)} (norm ${fxT(b.info.shannon.norm, 3)})`,
          b.info.perm && `PermEnt ${fxT(b.info.perm.norm, 3)}${P('permEnt')} · LZ76 ${b.info.lz ? fxT(b.info.lz.norm, 2) : '-'}${P('lz')}`,
          b.info.ks && `KS D ${fxT(b.info.ks.D, 3)} p ${pT(b.info.ks.p)}`,
        ]],
        ['D·MOMEN', [
          b.mom.jb && `skew ${fxT(b.mom.jb.skew, 2)} exkurt ${fxT(b.mom.jb.exKurt, 2)} JB p ${pT(b.mom.jb.jbP)}`,
          b.mom.hill && `Hill α ${fxT(b.mom.hill.alpha, 2)} · Zipf slope ${b.mom.zipf ? fxT(b.mom.zipf.slope, 2) : '-'}`,
          b.mom.lyap && `Lyapunov λ ${fxT(b.mom.lyap.lambda, 4)}/j${P('lyap')}`,
          b.mom.dd && `maxDD ${fxT(b.mom.dd.maxDDPct, 1)}% ulcer ${fxT(b.mom.dd.ulcer, 2)} curDD ${fxT(b.mom.dd.curDDPct, 1)}% dari-puncak ${b.mom.dd.hoursSincePeak}j`,
        ]],
        ['E·SINYAL', [
          b.sig.period && `FFT cycle ${b.sig.period.domPeriod != null ? fxT(b.sig.period.domPeriod, 0) + 'j' : '-'} (share ${fxT(b.sig.period.share * 100, 1)}%) specEnt ${fxT(b.sig.period.specEnt, 3)}`,
          b.sig.haar && `Haar skala-dominan ${b.sig.haar.domScale}j ${b.sig.haar.domDir > 0 ? '↑' : b.sig.haar.domDir < 0 ? '↓' : '·'} energi [${b.sig.haar.energies.map(e => fxT(e * 100, 0)).join(',')}]%`,
          b.sig.hilbert && `Hilbert T ${fxT(b.sig.hilbert.period, 0)}j cycPos ${fxT(b.sig.hilbert.cycPos, 2)} amp ${fxT(b.sig.hilbert.ampPct, 2)}%`,
          b.sig.fisher && `Fisher ${fxT(b.sig.fisher.fisher, 2)}${b.sig.fisher.extreme ? ' [EKSTREM]' : ''}${P('fisher')}`,
        ]],
        ['F·FILTER', [
          b.filt.kalman && `Kalman slope ${fxT(b.filt.kalman.slopePct, 3)}%/j SNR ${fxT(b.filt.kalman.snr, 2)} innov ${fxT(b.filt.kalman.innovZ, 2)}σ`,
          b.filt.hp && `HP cycle ${fxT(b.filt.hp.cycleZ, 2)}σ tren ${fxT(b.filt.hp.trendSlopePct, 3)}%/j`,
          b.filt.cusum && `CUSUM breaks ${b.filt.cusum.alarms} terakhir ${b.filt.cusum.hoursSince != null ? b.filt.cusum.hoursSince + 'j' : '-'}${b.filt.cusum.postDriftPct != null ? ' drift ' + fxT(b.filt.cusum.postDriftPct, 3) + '%/j' : ''}`,
          b.filt.ss && `SuperSmoother ${fxT(b.filt.ss.slopePctPerHour, 3)}%/j · SG d/dt ${b.filt.sg ? fxT(b.filt.sg.derivPctPerHour, 3) + '%/j accel ' + fxT(b.filt.sg.accelPct, 4) + '%/j²' : ''}`,
        ]],
        ['G·EKOFIS', [
          b.econ.diff && `Einstein β ${fxT(b.econ.diff.beta, 3)} [${b.econ.diff.verdict}]`,
          b.econ.markov && `Markov pUU ${fxT(b.econ.markov.pUU, 2)} pDD ${fxT(b.econ.markov.pDD, 2)} π↑ ${fxT(b.econ.markov.piUp, 2)}`,
          b.econ.lb && `LjungBox Q ${fxT(b.econ.lb.Q, 1)} p ${pT(b.econ.lb.p)} ρ1 ${fxT(b.econ.lb.rho1, 3)}`,
          b.econ.er && `Kaufman ER ${fxT(b.econ.er.er, 3)} · CHOP ${b.econ.chop ? fxT(b.econ.chop.chop, 1) : '-'}${b.econ.granger ? ` · xcorrBTC ρ0 ${fxT(b.econ.granger.r0, 2)} max ${fxT(b.econ.granger.bestR, 2)}@${b.econ.granger.bestLag}j` : ''}`,
        ]],
        ['H·PORT', [
          b.port.btc && `β ${fxT(b.port.btc.beta, 2)}(t ${fxT(b.port.btc.tBeta, 1)}) α ${fmtSigned(b.port.btc.alphaPerDayPct, 2)}/hr R² ${fxT(b.port.btc.r2, 2)} idio ${fxT(b.port.btc.idioPctPerHour, 3)}%/j`,
          b.port.tail && `λU ${fxT(b.port.tail.lamU, 2)} λL ${fxT(b.port.tail.lamL, 2)}`,
          b.port.ssratio && `Sharpe ${fxT(b.port.ssratio.sharpe, 2)}${P('sharpe')} Sortino ${fxT(b.port.ssratio.sortino, 2)}${b.port.iratio ? ' IR ' + fxT(b.port.iratio.ir, 2) : ''}`,
          b.port.kelly && `Kelly f* ${fxT(b.port.kelly.kelly * 100, 1)}%${P('kelly')} half ${fxT(b.port.kelly.halfKelly * 100, 1)}%`,
          b.port.var && `VaR95.24j param ${fxT(b.port.var.param95, 2)}%${b.port.var.hist95 != null ? ' hist ' + fxT(b.port.var.hist95, 2) + '%' : ''}`,
          b.mc && `MC24j P5 ${fxT(b.mc.p5, 1)}% P25 ${fxT(b.mc.p25, 1)}% P50 ${fxT(b.mc.p50, 1)}% P75 ${fxT(b.mc.p75, 1)}% P95 ${fxT(b.mc.p95, 1)}% P(naik) ${fxT(b.mc.probUp * 100, 0)}%`,
          b.port.sr && `S/R: support ${b.port.sr.support != null ? fmtPrice(b.port.sr.support) + ' (' + fxT(b.port.sr.supportDistPct, 1) + '%)' : '-'} resistance ${b.port.sr.resistance != null ? fmtPrice(b.port.sr.resistance) + ' (+' + fxT(b.port.sr.resistDistPct, 1) + '%)' : '-'}`,
        ]],
        ['K·OOS', [
          b.replay?.wf && `Walk-forward hit ${fxT(b.replay.wf.hitRate * 100, 0)}% (${b.replay.wf.n} checkpoint) — ${b.replay.wf.checkpoints.map(c => `+${c.oosH}j:${c.hit ? 'BENAR' : 'SALAH'}(${c.oosPct >= 0 ? '+' : ''}${c.oosPct}%)`).join(' ')}`,
        ]],
      ];
      fam.forEach(([famName, lines]) => {
        const filled = lines.filter(Boolean);
        if (filled.length) L.push(`    [${famName}] ${filled.join(' | ')}`);
      });
      s.core.reasons.forEach(x => L.push(`    · CORE: ${x}`));
      if (s.meta?.drivers) s.meta.drivers.forEach(d => L.push(`    · DRIVER: ${d}`));
      L.push('');
    });
  };
  section(`[2] TOP ${r.longs.length} BULLISH — ${LABEL_BULL} (deep dive ${r.nEngines} engine)`, r.longs);
  section(`[3] TOP ${r.shorts.length} BEARISH — ${LABEL_BEAR} (deep dive ${r.nEngines} engine)`, r.shorts);

  /* [4] ENGINE MATRIX — populasi & layar khusus */
  L.push(bar, ' [4] ENGINE MATRIX — STATISTIK POPULASI & LAYAR KHUSUS', bar);
  const F = r.qpop?.fields || {};
  const showF = (k, label, d) => {
    const f = F[k];
    if (!f) return;
    L.push(`${(label || k).padEnd(22)}: median ${fxT(f.median, d)} · robust σ ${fxT(f.robustSigma, d)} · p10 ${fxT(f.p10, d)} · p25 ${fxT(f.p25, d)} · p75 ${fxT(f.p75, d)} · p90 ${fxT(f.p90, d)} (n=${f.n})`);
  };
  showF('hurst', 'Hurst konsensus', 3);
  showF('garchNext', 'GARCH σ next 1j %', 3);
  showF('bollBw', 'Bollinger BW %', 2);
  showF('permEnt', 'Permutation entropy', 3);
  showF('sharpe', 'Sharpe 7d ann', 2);
  showF('kelly', 'Kelly f*', 2);
  showF('beta', 'Beta vs BTC', 2);
  showF('alpha', 'Alpha vs BTC %/hr', 2);
  showF('idio', 'Idio σ %/jam', 3);
  showF('amihud', 'Amihud illiq', 2);
  showF('lyap', 'Lyapunov /jam', 4);
  showF('er', 'Kaufman ER', 3);
  showF('chop', 'Choppiness', 1);
  showF('turnover', 'Turnover harian', 4);
  L.push('');

  const top5 = (key, dir, fmt, label) => {
    const arr = r.all.map(s => ({ s, v: s.bundle['_' + key] })).filter(x => Number.isFinite(x.v))
      .sort((a, b) => dir * (b.v - a.v)).slice(0, 5);
    if (arr.length) L.push(`${label}: ${arr.map(x => `${x.s.core.coin.symbol.toUpperCase()} ${fmt(x.v)}`).join(' · ')}`);
  };
  L.push('— LAYAR KHUSUS (cross-sectional leaders) —');
  top5('hurst', 1, v => v.toFixed(2), 'Hurst tertinggi (paling trending)');
  top5('hurst', -1, v => v.toFixed(2), 'Hurst terendah (paling mean-revert)');
  top5('garchNext', 1, v => v.toFixed(2) + '%', 'Volatilitas GARCH 1j tertinggi');
  top5('alpha', 1, v => v.toFixed(1) + '%', 'Alpha harian vs BTC tertinggi');
  top5('alpha', -1, v => v.toFixed(1) + '%', 'Alpha harian vs BTC terendah');
  top5('sharpe', 1, v => v.toFixed(2), 'Sharpe 7d tertinggi');
  top5('kelly', 1, v => (v * 100).toFixed(1) + '%', 'Kelly f* terbesar');
  top5('lyap', 1, v => v.toFixed(4), 'Lyapunov terbesar (paling chaotic)');
  top5('permEnt', -1, v => v.toFixed(3), 'Permutation entropy terendah (paling terstruktur)');
  top5('turnover', 1, v => (v * 100).toFixed(1) + '%', 'Turnover tertinggi (paling aktif)');
  L.push('');

  /* [5] EVENT RADAR + PORTFOLIO BASKET + CLUSTER MAP */
  L.push(bar, ' [5] EVENT RADAR · PORTFOLIO BASKET · CLUSTER MAP', bar);
  if (r.radar && r.radar.length) {
    L.push('— EVENT RADAR (ekstrema lintas engine, maks 24 koin) —');
    r.radar.forEach(x => L.push(`  ${x.sym.padEnd(8)} ${x.events.join(' | ')}`));
  } else {
    L.push('Event radar: tidak ada ekstrema signifikan yang terdeteksi saat ini.');
  }
  L.push('');
  if (r.portfolio) {
    L.push('— BASKET LONG-SHORT MARKET-NEUTRAL (bobot invers-volatilitas) —');
    r.portfolio.weights.forEach(w =>
      L.push(`  ${w.dir.padEnd(6)} ${w.sym.padEnd(8)} bobot ${w.wPct.toFixed(1)}%`));
    L.push(`  Vol basket 24j ${fxT(r.portfolio.dailyVolPct, 2)}% · VaR95 harian ${fxT(r.portfolio.var95DailyPct, 2)}%`);
    L.push(`  Net beta vs BTC ${fxT(r.portfolio.netBeta, 2)} · korelasi rata2 konstituen ${fxT(r.portfolio.avgPairCorr, 2)} · diversifikasi ${fxT(r.portfolio.diversification * 100, 0)}%`);
    L.push('  (gross 100% long + 100% short — net exposure sekitar nol)');
  } else {
    L.push('Basket portofolio: kandidat long/short belum cukup untuk dibentuk.');
  }
  L.push('');
  if (r.clusters && r.clusters.nClusters > 1) {
    L.push(`— CLUSTER KORELASI (${r.clusters.nClusters} cluster @ threshold ${Math.round(r.clusters.threshold * 100)}%) —`);
    r.clusters.clusters.forEach(c =>
      L.push(`  [${String(c.syms.length).padStart(2)}] ${c.syms.join(', ')} (rho ${fxT(c.avgCorr, 2)})`));
    L.push('  Koin dalam cluster yang sama itu redundan — pilih salah satu saja.');
  }
  L.push('');

  /* [6] LAMPIRAN — seluruh coin */
  L.push(bar, ` [6] LAMPIRAN — SEMUA ${r.all.length} COIN (urut blend skor tertinggi)`, bar);
  L.push(' No   Simbol      Arah      Skor  Ens%  Conf  Hrst   GARCH%j  β      Kelly%  24h       7d');
  L.push(' ' + thin.slice(1));
  [...r.all].sort((a, b) => b.rankVal - a.rankVal).forEach((s, i) => {
    const b = s.bundle;
    L.push(' ' + String(i + 1).padEnd(5)
      + (s.core.coin.symbol || '').toUpperCase().padEnd(12)
      + (s.finalDir === 'LONG' ? 'BULLISH' : 'BEARISH').padEnd(10)
      + String(s.finalScore).padEnd(6)
      + (s.meta ? Math.round(s.meta.pUp * 100) + '%' : '-').padEnd(6)
      + (s.core.confidence + '%').padEnd(6)
      + (b._hurst != null ? b._hurst.toFixed(2) : '-').padEnd(7)
      + (b.vol?.garch?.nextPct != null ? b.vol.garch.nextPct.toFixed(2) : '-').padEnd(9)
      + (b.port?.btc?.beta != null ? b.port.btc.beta.toFixed(2) : '-').padEnd(7)
      + (b.port?.kelly?.kelly != null ? (b.port.kelly.kelly * 100).toFixed(0) : '-').padEnd(8)
      + fmtSigned(s.core.chg24h).padEnd(11)
      + fmtSigned(s.core.chg7d));
  });
  L.push('');

  /* [7] PERBANDINGAN DENGAN SCAN SEBELUMNYA */
  L.push(bar, ' [7] PERBANDINGAN DENGAN SCAN SEBELUMNYA (localStorage)', bar);
  if (r.hist) {
    L.push(`Scan sebelumnya: ${r.hist.when ? r.hist.when.toLocaleString('id-ID') : '-'}`);
    const dsec = (title, top, exited) => {
      L.push(` ${title}:`);
      let any = false;
      top.forEach((s, i) => {
        const d = r.hist.deltas[s.core.coin.id];
        if (!d) return;
        any = true;
        const rd = d.prevRank - (i + 1);
        const flip = d.prevDir && d.prevDir !== s.finalDir ? ` [ARAH BERUBAH: dulu ${d.prevDir}]` : '';
        L.push(`   ${s.bundle.sym.padEnd(8)} rank #${d.prevRank} → #${i + 1} (${rd >= 0 ? 'naik ' + rd : 'turun ' + (-rd)})`
          + ` · skor ${d.prevBlend} → ${Math.round(s.blend * 10) / 10}${flip}`);
      });
      if (exited && exited.length) L.push(`   KELUAR dari daftar: ${exited.join(', ')}`);
      if (!any && !(exited && exited.length)) L.push('   (tidak ada perubahan)');
    };
    dsec(`TOP ${r.longs.length} BULLISH`, r.longs, r.hist.exitedBull);
    dsec(`TOP ${r.shorts.length} BEARISH`, r.shorts, r.hist.exitedBear);
  } else {
    L.push(' Tidak ada riwayat scan tersimpan — ini scan pertama di browser ini,');
    L.push(' atau data riwayat dibersihkan. Scan lagi nanti untuk melihat delta.');
  }
  L.push('');

  /* [8] METODOLOGI — registry lengkap */
  L.push(bar, ` [8] METODOLOGI — REGISTRY ${r.nEngines} ENGINE (rumus & penemu)`, bar);
  let curFam = '';
  for (const e of QE.ENGINE_REGISTRY) {
    if (e.fam !== curFam) { curFam = e.fam; L.push(''); L.push(` ── FAMILI ${curFam} ──`); }
    L.push(` · ${e.name} — ${e.credit}`);
  }
  L.push('');

  /* [9] DISCLAIMER */
  L.push(bar, ' [9] DISCLAIMER', bar);
  L.push(' Seluruh output di atas dihasilkan oleh model heuristik kuantitatif dari');
  L.push(' data publik (CoinGecko & Binance), 100% dihitung di browser Anda.');
  L.push(' BUKAN saran finansial. Belum divalidasi backtest out-of-sample dengan');
  L.push(' biaya transaksi. Estimator statistik pada 168 titik data memiliki galat');
  L.push(' sampel yang signifikan — angka engine adalah perkiraan, bukan kebenaran.');
  L.push(' Jendela data kecil (7 hari) membuat Sharpe/Kelly/alpha sangat NOISY —');
  L.push(' perlakukan sebagai peringkat relatif antar koin, bukan estimasi absolut.');
  L.push(' Lakukan riset sendiri (DYOR) dan gunakan manajemen risiko.');
  L.push(bar);
  return L.join('\n');
}

function saveTxt() {
  if (!lastResult) return;
  const blob = new Blob([buildTxt()], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `quantum-scan-ALL_${stampForFile(lastResult.ts)}.txt`);
  showToast('Laporan audit kuantitatif (.txt) berhasil diunduh', 'success');
}

/* ── SAVE CSV — semua koin × kolom engine utama ── */
function buildCsv() {
  const r = lastResult;
  const cols = [
    'sym', 'name', 'price', 'chg1h', 'chg24h', 'chg7d',
    'coreScore', 'coreConf', 'ensP', 'ensScore', 'blend', 'dir', 'agreePct', 'fisherP',
    'hurstRS', 'dfaH', 'hurstAvg', 'ouPhi', 'ouHL', 'dfT', 'stationary', 'vr4', 'vr4z',
    'katzFD', 'higuchiFD', 'crossRate',
    'garchNext', 'garchLR', 'garchAlpha', 'garchBeta', 'garchPersist', 'garchRegime',
    'parkinson', 'gk', 'vov', 'bollBw', 'pctB', 'donchianPos', 'amihud', 'turnover',
    'shannon', 'permEnt', 'lz', 'ksD', 'ksP',
    'skew', 'exKurt', 'jbP', 'hillAlpha', 'zipfSlope', 'lyapunov',
    'maxDD', 'ulcer', 'curDD',
    'fftPeriod', 'fftShare', 'specEnt', 'haarScale', 'haarDir',
    'hilbertPeriod', 'cycPos', 'fisherT',
    'kalSlope', 'kalSNR', 'kalInnov', 'hpCycleZ', 'hpTrend',
    'cusumBreaks', 'cusumSince', 'cusumDrift', 'ssSlope', 'sgDeriv', 'sgAccel',
    'einsteinBeta', 'pUU', 'pDD', 'piUp', 'lbQ', 'lbP', 'rho1', 'kaufER', 'chop',
    'grangerR0', 'grangerMaxR', 'grangerLag',
    'betaBTC', 'alphaBTC', 'r2BTC', 'tBeta', 'idioVol', 'lamU', 'lamL',
    'sharpe', 'sortino', 'infoRatio', 'kelly', 'halfKelly', 'varParam', 'varHist',
    'mcP5', 'mcP25', 'mcP50', 'mcP75', 'mcP95', 'mcProbUp',
    'support', 'resistance',
    'wfHitRate', 'wfN',
  ];
  const g = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    return String(v).replace(/,/g, ';').replace(/"/g, "'");
  };
  const rows = [cols.join(',')];
  const sorted = [...r.all].sort((a, b) => b.rankVal - a.rankVal);
  for (const s of sorted) {
    const c = s.core.coin, b = s.bundle;
    const d = {
      sym: (c.symbol || '').toUpperCase(), name: (c.name || '').replace(/,/g, ';'),
      price: c.current_price, chg1h: s.core.chg1h, chg24h: s.core.chg24h, chg7d: s.core.chg7d,
      coreScore: s.core.score, coreConf: s.core.confidence,
      ensP: s.meta ? Math.round(s.meta.pUp * 1000) / 10 : null,
      ensScore: s.finalScore, blend: Math.round(s.blend * 10) / 10,
      dir: s.finalDir, agreePct: s.meta ? s.meta.agreePct : null,
      fisherP: s.meta?.fisher ? s.meta.fisher.p : null,
      hurstRS: b.meanRev?.hurstRS?.H, dfaH: b.meanRev?.dfa?.H, hurstAvg: b._hurst,
      ouPhi: b.meanRev?.ou?.phi, ouHL: b.meanRev?.ou?.halfLife,
      dfT: b.meanRev?.ou?.tStat, stationary: b.meanRev?.ou?.stationary ? 1 : 0,
      vr4: b.meanRev?.vr?.vr4, vr4z: b.meanRev?.vr?.z4,
      katzFD: b.meanRev?.katz?.fd, higuchiFD: b.meanRev?.higuchi?.fd,
      crossRate: b.meanRev?.cross?.ratio,
      garchNext: b.vol?.garch?.nextPct, garchLR: b.vol?.garch?.longRunPct,
      garchAlpha: b.vol?.garch?.alpha, garchBeta: b.vol?.garch?.beta,
      garchPersist: b.vol?.garch?.persist, garchRegime: b.vol?.garch?.regime,
      parkinson: b.vol?.parkinson?.pctPerHour, gk: b.vol?.gk?.pctPerHour,
      vov: b.vol?.vov?.cov, bollBw: b.vol?.boll?.bwPct, pctB: b.vol?.boll?.pctB,
      donchianPos: b.vol?.donchian?.pos, amihud: b.vol?.amihud?.illiq, turnover: b.turnover,
      shannon: b.info?.shannon?.norm, permEnt: b.info?.perm?.norm, lz: b.info?.lz?.norm,
      ksD: b.info?.ks?.D, ksP: b.info?.ks?.p,
      skew: b.mom?.jb?.skew, exKurt: b.mom?.jb?.exKurt, jbP: b.mom?.jb?.jbP,
      hillAlpha: b.mom?.hill?.alpha, zipfSlope: b.mom?.zipf?.slope, lyapunov: b.mom?.lyap?.lambda,
      maxDD: b.mom?.dd?.maxDDPct, ulcer: b.mom?.dd?.ulcer, curDD: b.mom?.dd?.curDDPct,
      fftPeriod: b.sig?.period?.domPeriod, fftShare: b.sig?.period?.share,
      specEnt: b.sig?.period?.specEnt, haarScale: b.sig?.haar?.domScale,
      haarDir: b.sig?.haar?.domDir, hilbertPeriod: b.sig?.hilbert?.period,
      cycPos: b.sig?.hilbert?.cycPos, fisherT: b.sig?.fisher?.fisher,
      kalSlope: b.filt?.kalman?.slopePct, kalSNR: b.filt?.kalman?.snr,
      kalInnov: b.filt?.kalman?.innovZ, hpCycleZ: b.filt?.hp?.cycleZ,
      hpTrend: b.filt?.hp?.trendSlopePct,
      cusumBreaks: b.filt?.cusum?.alarms, cusumSince: b.filt?.cusum?.hoursSince,
      cusumDrift: b.filt?.cusum?.postDriftPct, ssSlope: b.filt?.ss?.slopePctPerHour,
      sgDeriv: b.filt?.sg?.derivPctPerHour, sgAccel: b.filt?.sg?.accelPct,
      einsteinBeta: b.econ?.diff?.beta, pUU: b.econ?.markov?.pUU, pDD: b.econ?.markov?.pDD,
      piUp: b.econ?.markov?.piUp, lbQ: b.econ?.lb?.Q, lbP: b.econ?.lb?.p,
      rho1: b.econ?.lb?.rho1, kaufER: b.econ?.er?.er, chop: b.econ?.chop?.chop,
      grangerR0: b.econ?.granger?.r0, grangerMaxR: b.econ?.granger?.bestR,
      grangerLag: b.econ?.granger?.bestLag,
      betaBTC: b.port?.btc?.beta, alphaBTC: b.port?.btc?.alphaPerDayPct,
      r2BTC: b.port?.btc?.r2, tBeta: b.port?.btc?.tBeta,
      idioVol: b.port?.btc?.idioPctPerHour, lamU: b.port?.tail?.lamU, lamL: b.port?.tail?.lamL,
      sharpe: b.port?.ssratio?.sharpe, sortino: b.port?.ssratio?.sortino,
      infoRatio: b.port?.iratio?.ir, kelly: b.port?.kelly?.kelly,
      halfKelly: b.port?.kelly?.halfKelly, varParam: b.port?.var?.param95,
      varHist: b.port?.var?.hist95,
      mcP5: b.mc?.p5, mcP25: b.mc?.p25, mcP50: b.mc?.p50, mcP75: b.mc?.p75,
      mcP95: b.mc?.p95, mcProbUp: b.mc?.probUp,
      support: b.port?.sr?.support, resistance: b.port?.sr?.resistance,
      wfHitRate: b.replay?.wf ? b.replay.wf.hitRate : null,
      wfN: b.replay?.wf ? b.replay.wf.n : null,
    };
    rows.push(cols.map(col => g(d[col])).join(','));
  }
  return rows.join('\n');
}

function saveCsv() {
  if (!lastResult) return;
  const blob = new Blob(['\ufeff' + buildCsv()], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `quantum-scan-engines_${stampForFile(lastResult.ts)}.csv`);
  showToast('Dataset 65 engine (.csv) berhasil diunduh', 'success');
}

/* ── SAVE IMAGE (canvas, tanpa library eksternal) ── */
function canvasRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

const LOGO_CACHE = new Map();

function loadImageCORS(url, timeoutMs = 5000) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let done = false, timer = null;
    const finish = ok => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = img.onerror = null;
      resolve(ok ? img : null);
    };
    timer = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => finish((img.naturalWidth || img.width) > 0);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

function logoCandidates(c) {
  const list = [];
  const sym = encodeURIComponent((c.symbol || '').toLowerCase());
  if (c.image) {
    list.push(c.image + (c.image.includes('?') ? '&' : '?') + 'cors=1');
    list.push('https://images.weserv.nl/?url=' + encodeURIComponent(c.image) + '&w=96&h=96&fit=contain&output=png');
  }
  if (sym) {
    list.push(`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${sym}.png`);
    list.push(`https://assets.coincap.io/assets/icons/${sym}@2x.png`);
  }
  return list;
}

async function loadCoinLogo(c) {
  if (LOGO_CACHE.has(c.id)) return LOGO_CACHE.get(c.id);
  for (const u of logoCandidates(c)) {
    const img = await loadImageCORS(u);
    if (img) { LOGO_CACHE.set(c.id, img); return img; }
  }
  return null;
}

async function saveImage() {
  if (!lastResult) return;
  const r = lastResult;
  const btn = document.getElementById('imgBtn');
  const oldLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> <span>MEMUAT...</span>';

  try {
    try {
      await Promise.all([
        document.fonts.load('700 20px "JetBrains Mono"'),
        document.fonts.load('400 20px "JetBrains Mono"'),
        document.fonts.load('700 28px "Space Grotesk"'),
        document.fonts.load('600 14px "Inter"'),
      ]);
    } catch (e) { /* fallback font */ }

    const logos = new Map();
    const items = [...r.longs, ...r.shorts];
    await Promise.all(items.map(async s => {
      const img = await loadCoinLogo(s.core.coin);
      if (img) logos.set(s.core.coin.id, img);
    }));

    const finalize = cv => new Promise((resolve, reject) => {
      try {
        cv.toBlob(blob => blob ? resolve(blob) : reject(new Error('blob kosong')), 'image/png');
      } catch (e) { reject(e); }
    });

    let blob;
    try {
      blob = await finalize(buildImageCanvas(r, logos));
    } catch (e) {
      console.warn('Save image dengan logo gagal, ulangi tanpa logo:', e);
      blob = await finalize(buildImageCanvas(r, new Map()));
    }
    downloadBlob(blob, `quantum-scan_${stampForFile(r.ts)}.png`);
    showToast('Visualisasi institusional (.png) berhasil diunduh', 'success');
  } catch (e) {
    console.error(e);
    alert('Gagal membuat gambar. Coba lagi.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldLabel;
  }
}

function buildImageCanvas(r, logos) {
  const C = {
    bg: '#0a0c12', surface: '#12151e', surface2: '#171b26', border: 'rgba(255,255,255,0.08)',
    green: '#21d19f', red: '#ff5470', accent: '#f5a623', text: '#f4f5f7', text2: '#9aa3b8',
    violet: '#8b7cf6', cyan: '#3fc7d6',
  };
  const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
  const DISPLAY = '"Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif';

  const SCALE = 2;
  const W = 1200, PAD = 32, GAP = 24;
  const colW = (W - PAD * 2 - GAP) / 2;
  const rowH = 46, colHeadH = 50;
  const rows = Math.max(r.longs.length, r.shorts.length, 1);
  const statStripH = 40;
  const topBlock = 176 + statStripH;
  const H = topBlock + colHeadH + rows * rowH + 20 + 64;

  const cv = document.createElement('canvas');
  cv.width = W * SCALE; cv.height = H * SCALE;
  const ctx = cv.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 520);
  g.addColorStop(0, 'rgba(139,124,246,0.12)'); g.addColorStop(1, 'rgba(139,124,246,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Judul
  ctx.fillStyle = C.violet; ctx.font = `700 28px ${DISPLAY}`; ctx.textAlign = 'left';
  ctx.fillText('XENONTRENDS // QUANTUM SCAN', PAD, 52);
  ctx.fillStyle = C.text2; ctx.font = `400 12px ${MONO}`;
  ctx.fillText(`${r.ts.toLocaleString('id-ID')}  ·  ${r.all.length} koin  ·  ${r.nEngines} engine  ·  ${r.durationSec}s`, PAD, 84);

  // Kartu MQS
  const zoneColor = r.mqs.zone === 'GREEN' ? C.green : r.mqs.zone === 'YELLOW' ? C.accent : C.red;
  ctx.fillStyle = C.surface; canvasRoundRect(ctx, PAD, 108, W - PAD * 2, 52, 12); ctx.fill();
  ctx.strokeStyle = C.border; ctx.lineWidth = 1; canvasRoundRect(ctx, PAD, 108, W - PAD * 2, 52, 12); ctx.stroke();
  ctx.fillStyle = zoneColor; ctx.font = `700 32px ${DISPLAY}`;
  ctx.fillText(String(r.mqs.score), PAD + 20, 136);
  ctx.font = `700 13px ${MONO}`;
  ctx.fillText(`MARKET QUALITY v2 · ${r.mqs.zone}`, PAD + 80, 127);
  ctx.fillStyle = C.text2; ctx.font = `400 11px ${MONO}`;
  ctx.fillText(fitText(ctx, `${r.mqs.label}. Breadth ${r.mqs.breadthPct}% · Regime: ${r.market.regime || '-'}`, W - PAD * 2 - 100), PAD + 80, 145);

  // Strip statistik engine pasar
  const stripStats = [];
  if (r.market.cross) stripStats.push(`Disp ${fxT(r.market.cross.dispersion, 1)}%`);
  if (r.market.network) stripStats.push(`ρ̄ ${fxT(r.market.network.avgCorr, 2)}`, `λ₁ ${fxT(r.market.network.lam1Share * 100, 0)}%`, `AR ${fxT(r.market.network.absorption, 2)}`);
  stripStats.push(`λ+ MP ${fxT(r.market.network?.mpPlus, 2)}`);
  ctx.font = `400 11px ${MONO}`;
  let sx = PAD + 4;
  stripStats.forEach(t => {
    ctx.fillStyle = C.text2;
    ctx.fillText(t, sx, 108 + 52 + statStripH / 2 - 8);
    sx += ctx.measureText(t).width + 22;
  });

  // Dua kolom
  const drawColumn = (x, title, items, color, tint) => {
    const y0 = topBlock;
    ctx.fillStyle = C.surface; canvasRoundRect(ctx, x, y0, colW, colHeadH + rows * rowH, 14); ctx.fill();
    ctx.strokeStyle = C.border; canvasRoundRect(ctx, x, y0, colW, colHeadH + rows * rowH, 14); ctx.stroke();
    ctx.save();
    canvasRoundRect(ctx, x, y0, colW, colHeadH + rows * rowH, 14); ctx.clip();
    ctx.fillStyle = tint; ctx.fillRect(x, y0, colW, colHeadH);
    ctx.restore();
    ctx.fillStyle = color; ctx.font = `700 18px ${DISPLAY}`; ctx.textAlign = 'left';
    ctx.fillText(title, x + 18, y0 + colHeadH / 2 + 1);
    ctx.strokeStyle = C.border; ctx.beginPath();
    ctx.moveTo(x, y0 + colHeadH); ctx.lineTo(x + colW, y0 + colHeadH); ctx.stroke();

    if (!items.length) {
      ctx.fillStyle = C.text2; ctx.font = `400 12px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText('Tidak ada kandidat yang cukup kuat', x + colW / 2, y0 + colHeadH + rowH / 2);
      ctx.textAlign = 'left';
      return;
    }

    items.forEach((s, i) => {
      const c = s.core.coin;
      const cy = y0 + colHeadH + i * rowH + rowH / 2;
      if (i > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath();
        ctx.moveTo(x + 14, cy - rowH / 2); ctx.lineTo(x + colW - 14, cy - rowH / 2); ctx.stroke();
      }
      ctx.fillStyle = C.text2; ctx.font = `400 11px ${MONO}`; ctx.textAlign = 'left';
      ctx.fillText(String(i + 1), x + 16, cy);
      const sym = (c.symbol || '?').toUpperCase();
      const logo = logos.get(c.id);
      const LR = 15, lx = x + 56;
      if (logo) {
        ctx.save();
        ctx.beginPath(); ctx.arc(lx, cy, LR, 0, Math.PI * 2); ctx.closePath();
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.clip();
        const iw = logo.naturalWidth || logo.width, ih = logo.naturalHeight || logo.height;
        const sc = Math.min((LR * 2) / iw, (LR * 2) / ih);
        const dw = iw * sc, dh = ih * sc;
        ctx.drawImage(logo, lx - dw / 2, cy - dh / 2, dw, dh);
        ctx.restore();
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(lx, cy, LR, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(lx, cy, LR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = color; ctx.font = `700 12px ${MONO}`; ctx.textAlign = 'center';
        ctx.fillText(sym.charAt(0), lx, cy + 1);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = C.text; ctx.font = `700 13.5px ${MONO}`;
      ctx.fillText(fitText(ctx, sym, 110), x + 78, cy - 8);
      ctx.fillStyle = C.text2; ctx.font = `400 10.5px ${MONO}`;
      ctx.fillText(fitText(ctx, c.name || '', 130), x + 78, cy + 9);
      ctx.textAlign = 'right';
      ctx.fillStyle = C.text; ctx.font = `400 13px ${MONO}`;
      ctx.fillText(fmtPrice(c.current_price || 0), x + colW - 78, cy - 8);
      ctx.fillStyle = s.core.chg24h >= 0 ? C.green : C.red; ctx.font = `400 11px ${MONO}`;
      ctx.fillText(`${fmtSigned(s.core.chg24h)} (24h)`, x + colW - 78, cy + 9);
      ctx.fillStyle = tint; canvasRoundRect(ctx, x + colW - 62, cy - 15, 46, 30, 8); ctx.fill();
      ctx.strokeStyle = color; canvasRoundRect(ctx, x + colW - 62, cy - 15, 46, 30, 8); ctx.stroke();
      ctx.fillStyle = color; ctx.font = `700 15px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText(String(s.finalScore), x + colW - 39, cy + 1);
      ctx.textAlign = 'left';
    });
  };

  drawColumn(PAD, LABEL_BULL, r.longs, C.green, 'rgba(33,209,159,0.12)');
  drawColumn(PAD + colW + GAP, LABEL_BEAR, r.shorts, C.red, 'rgba(255,84,112,0.12)');

  ctx.textAlign = 'center';
  ctx.fillStyle = C.text2; ctx.font = `400 11px ${MONO}`;
  ctx.fillText(`Bukan saran finansial · ${r.nEngines} engine ekonofisika dari data publik · DYOR`, W / 2, H - 38);
  ctx.fillStyle = C.accent; ctx.font = `700 12px ${DISPLAY}`;
  ctx.fillText('XENONTRENDS QUANTUM TERMINAL · INSTITUTIONAL SCREENER', W / 2, H - 18);

  return cv;
}

/* ══════════════════════════════════════════════════════════════════
   PRESENTATION LAYER ENHANCEMENTS (Toasts, Modals & Tabs)
   ══════════════════════════════════════════════════════════════════ */

function showToast(msg, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px) scale(0.95)';
    setTimeout(() => { toast.remove(); }, 320);
  }, 3200);
}

function openMethodologyModal() {
  const m = document.getElementById('methodologyModal');
  if (m) {
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function closeMethodologyModal() {
  const m = document.getElementById('methodologyModal');
  if (m) {
    m.style.display = 'none';
    document.body.style.overflow = '';
  }
}

function switchAnalyticsTab(tabKey) {
  const tabs = document.querySelectorAll('.analytics-tab-bar .atab');
  tabs.forEach(t => {
    if (t.getAttribute('data-tab') === tabKey) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  const sections = document.querySelectorAll('[data-tab-pane]');
  sections.forEach(sec => {
    const pane = sec.getAttribute('data-tab-pane');
    if (tabKey === 'all' || pane === tabKey) {
      sec.style.display = '';
    } else {
      sec.style.display = 'none';
    }
  });
}

// Global key handler for closing modals cleanly
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    const engModal = document.getElementById('engineModal');
    if (engModal && engModal.style.display !== 'none' && engModal.innerHTML !== '') {
      closeCoinModal();
      return;
    }
    const methModal = document.getElementById('methodologyModal');
    if (methModal && methModal.style.display !== 'none') {
      closeMethodologyModal();
    }
  }
});
