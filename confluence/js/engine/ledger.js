/**
 * engine/ledger.js — Historical Ledger. Jantung dari Bab 10.3 dokumen
 * konsep ("Continuous Backtesting Loop") yang sebelumnya cuma janji di
 * kertas. Sekarang benar-benar berjalan: setiap sinyal yang ditampilkan
 * dicatat, dan begitu window evaluasi (default 24 jam) terlewati, sistem
 * otomatis mengecek apakah arah pergerakan harga sesuai prediksi.
 *
 * Semua tersimpan di localStorage — tidak perlu backend, konsisten dengan
 * prinsip arsitektur "client-side murni" (Bab 9.7). Konsekuensinya: ledger
 * ini personal per-browser, bukan agregat lintas pengguna — didokumentasikan
 * jujur di UI (Bab 1.2, transparansi).
 */

const LEDGER_KEY = 'ic_ledger_v1';
const MAX_ENTRIES = 500; // cegah localStorage membengkak tanpa batas
const EVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

function loadLedger(){
  try{
    const raw = localStorage.getItem(LEDGER_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}

function saveLedger(entries){
  try{
    // Simpan hanya MAX_ENTRIES terakhir supaya tidak membengkak
    const trimmed = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(LEDGER_KEY, JSON.stringify(trimmed));
  }catch(e){ /* storage penuh/private mode — abaikan, ini fitur tambahan bukan inti */ }
}

/**
 * Catat satu sinyal baru ke ledger.
 * @param {{wccs:number, classification:string, confidence:number, btcPrice:number, ethPrice:number}} signal
 */
export function recordSignal(signal){
  const entries = loadLedger();
  const last = entries[entries.length - 1];
  // Cegah auto-refresh 60 detik membanjiri ledger dengan entri duplikat:
  // rekam maksimal 1 kali per 30 menit kecuali klasifikasi sinyal berubah.
  if (last && (Date.now() - last.recordedAt < 30 * 60_000) && last.classification === signal.classification){
    return entries;
  }
  entries.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recordedAt: Date.now(),
    wccs: signal.wccs,
    classification: signal.classification,
    confidence: signal.confidence,
    // v2.3 — label rezim ikut dicatat. Ini penambahan METADATA, bukan
    // perubahan perhitungan: skor tetap dihitung dengan formula yang sama,
    // tapi ke depan bisa dijawab "sistem ini lebih akurat di rezim mana".
    regime: signal.regime || null,
    btcPriceAtSignal: signal.btcPrice,
    ethPriceAtSignal: signal.ethPrice,
    evaluated: false,
    outcome: null // diisi evaluateReadyEntries()
  });
  saveLedger(entries);
  return entries;
}

/**
 * Cek entri yang sudah melewati EVAL_WINDOW_MS dan belum dievaluasi,
 * evaluasi terhadap harga BTC/ETH SAAT INI (dipanggil tiap refresh siklus
 * — evaluasi terjadi natural setiap kali user membuka app lagi setelah
 * 24 jam, tanpa perlu proses background terpisah).
 * @param {{btc:number, eth:number}} currentPrices
 */
export function evaluateReadyEntries(currentPrices){
  const entries = loadLedger();
  const now = Date.now();
  let changed = false;

  entries.forEach(e => {
    if (e.evaluated) return;
    if (now - e.recordedAt < EVAL_WINDOW_MS) return;

    const btcMoveDirection = currentPrices.btc >= e.btcPriceAtSignal ? 1 : -1;
    const ethMoveDirection = currentPrices.eth >= e.ethPriceAtSignal ? 1 : -1;
    const wccsDirection = Math.sign(e.wccs) || 0;

    // "Benar" kalau arah WCCS (bullish/bearish) searah dengan pergerakan
    // harga gabungan BTC+ETH 24 jam kemudian. MIXED (wccsDirection===0)
    // tidak dinilai benar/salah — dicatat netral, tidak masuk hit rate.
    let correct = null;
    if (wccsDirection !== 0){
      const avgDirection = (btcMoveDirection + ethMoveDirection) >= 0 ? 1 : -1;
      correct = (wccsDirection === avgDirection);
    }

    e.evaluated = true;
    e.outcome = {
      btcPriceAfter: currentPrices.btc,
      ethPriceAfter: currentPrices.eth,
      btcChangePct: ((currentPrices.btc - e.btcPriceAtSignal) / e.btcPriceAtSignal) * 100,
      ethChangePct: ((currentPrices.eth - e.ethPriceAtSignal) / e.ethPriceAtSignal) * 100,
      correct
    };
    changed = true;
  });

  if (changed) saveLedger(entries);
  return entries;
}

/**
 * Hit rate & Brier score dari entri yang sudah dievaluasi dan punya arah
 * jelas (bukan MIXED). Bab 10.3 dokumen konsep.
 */
export function computeTrackRecord(){
  const entries = loadLedger().filter(e => e.evaluated && e.outcome && e.outcome.correct !== null);
  if (entries.length === 0){
    return { sampleSize: 0, hitRate: null, brierScore: null, ready: false };
  }

  const correctCount = entries.filter(e => e.outcome.correct).length;
  const hitRate = correctCount / entries.length;

  // Brier score: rata-rata (confidence_sebagai_probabilitas - outcome_biner)^2
  // Skor 0 = sempurna terkalibrasi, 1 = terburuk. Confidence dikonversi
  // dari skala 0-100 ke probabilitas 0-1 terhadap prediksi yang dibuat.
  const brierSum = entries.reduce((sum, e) => {
    const predictedProb = e.confidence / 100;
    const actual = e.outcome.correct ? 1 : 0;
    return sum + (predictedProb - actual) ** 2;
  }, 0);
  const brierScore = brierSum / entries.length;

  // v2.3 — pecahan per rezim. Ambang 5 per rezim dipertahankan: memecah
  // sampel kecil jadi lebih kecil lagi menghasilkan angka yang terlihat
  // spesifik tapi sebenarnya tidak berarti apa-apa.
  const perRegime = {};
  entries.forEach(e => {
    const r = e.regime || 'Tidak tercatat';
    if (!perRegime[r]) perRegime[r] = { n: 0, benar: 0 };
    perRegime[r].n++;
    if (e.outcome.correct) perRegime[r].benar++;
  });
  const regimeBreakdown = Object.entries(perRegime)
    .map(([label, v]) => ({
      label, sampleSize: v.n,
      hitRate: v.n >= 5 ? Math.round((v.benar / v.n) * 100) : null,
      ready: v.n >= 5
    }))
    .sort((a, b) => b.sampleSize - a.sampleSize);

  return {
    sampleSize: entries.length,
    hitRate: Math.round(hitRate * 100),
    brierScore: Number(brierScore.toFixed(3)),
    regimeBreakdown,
    ready: entries.length >= 5 // di bawah ini terlalu sedikit untuk berarti apa-apa
  };
}

/**
 * Progress menuju baseline live per komponen (dipakai Adaptive Baseline
 * Engine, Bab 4.1 — "live vs static baseline"). Menghitung berapa banyak
 * observasi harga BTC 24h return yang sudah terkumpul di ledger sebagai
 * proksi kesiapan baseline live keseluruhan sistem.
 * @param {number} [minSamples=200] target sample untuk baseline dianggap "live-ready"
 */
export function computeBaselineProgress(minSamples){
  minSamples = minSamples ?? 200;
  const entries = loadLedger();
  const count = entries.length;
  return {
    current: count,
    target: minSamples,
    pct: Math.min(100, Math.round((count / minSamples) * 100)),
    isLiveReady: count >= minSamples
  };
}

/** Ambil semua nilai numerik suatu field dari ledger, untuk baseline live. */
export function extractSeriesFromLedger(field){
  const entries = loadLedger();
  return entries
    .map(e => field(e))
    .filter(v => v != null && !isNaN(v));
}

export function getLedgerRaw(){ return loadLedger(); }

export function clearLedger(){
  try{ localStorage.removeItem(LEDGER_KEY); }catch(e){}
}
