/**
 * engine/watchtower.js — MENARA PENGAWAS (v2.4).
 *
 * Dashboard hanya berguna kalau diamati; admin grup tidak bisa menatapnya
 * 24 jam. Menara Pengawas mengambil alih bagian itu: tiap siklus refresh
 * (60 detik default — siklus yang SAMA dengan yang sudah berjalan, nol
 * panggilan API tambahan), kondisi pasar dibandingkan dengan snapshot
 * siklus sebelumnya, dan setiap TRANSISI yang penting diubah jadi alarm.
 *
 * Keputusan desain yang disengaja:
 *   - Berbasis TRANSISI, bukan level. Alarm bunyi saat kondisi MENYEBERANG
 *     ambang (mis. RSI naik dari 68 ke 71), bukan saat kondisi sedang
 *     berada di atas ambang — alarm yang menjerit tiap menit karena RSI
 *     kebetulan 71 adalah alarm yang cepat diabaikan orang.
 *   - Murni pembacaan overlay. Tidak satu pun aturan di sini menyentuh
 *     formula WCCS, ledger, atau rekam jejak.
 *   - Mesin murni: snapshot masuk, daftar alarm keluar. Efek samping UI
 *     (notifikasi, suara, badge) ditangani components/watchtower.js —
 *     supaya aturan bisa diuji terpisah dari browser.
 */

const ALERT_KEY = 'ic_watchtower_alerts_v1';
const SNAP_KEY = 'ic_watchtower_snapshot_v1';
const PRICE_ALERT_KEY = 'ic_watchtower_pricealerts_v1';
const MAX_ALERTS = 120;

/* ============================================================
   PENYIMPANAN
   ============================================================ */
function loadAlerts(){
  try{
    const raw = localStorage.getItem(ALERT_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}

function saveAlerts(list){
  try{ localStorage.setItem(ALERT_KEY, JSON.stringify(list.slice(-MAX_ALERTS))); }catch(e){ /* penuh — buang yang tertua */ }
}

function loadSnapshot(){
  try{
    const raw = localStorage.getItem(SNAP_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function saveSnapshot(snap){
  try{ localStorage.setItem(SNAP_KEY, JSON.stringify({ ...snap, savedAt: Date.now() })); }catch(e){ /* abaikan */ }
}

/** Alarm harga kustom yang dipasang admin (satu kali jalan — one-shot). */
export function getPriceAlerts(){
  try{
    const raw = localStorage.getItem(PRICE_ALERT_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}

export function addPriceAlert(pa){
  const list = getPriceAlerts();
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!pa || !pa.coin || !pa.dir || !isNum(pa.price) || pa.price <= 0) return list;
  list.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    coin: pa.coin,          // 'BTC' | 'ETH'
    dir: pa.dir,            // 'above' | 'below'
    price: pa.price,
    createdAt: Date.now(),
    active: true,
    firedAt: null
  });
  try{ localStorage.setItem(PRICE_ALERT_KEY, JSON.stringify(list)); }catch(e){}
  return list;
}

export function removePriceAlert(id){
  const list = getPriceAlerts().filter(p => p.id !== id);
  try{ localStorage.setItem(PRICE_ALERT_KEY, JSON.stringify(list)); }catch(e){}
  return list;
}

/* ============================================================
   API RIWAYAT ALARM
   ============================================================ */
export function getAlerts(){ return loadAlerts(); }

export function getUnackCount(){ return loadAlerts().filter(a => !a.ack).length; }

export function ackAllAlerts(){
  const list = loadAlerts();
  list.forEach(a => { a.ack = true; });
  saveAlerts(list);
  return list;
}

export function clearAllAlerts(){
  saveAlerts([]);
  return [];
}

/** Masukkan alarm baru (dipakai evaluateWatchtower; diekspor untuk tes). */
function pushAlert(list, a){
  list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, t: Date.now(), ack: false, ...a });
}

/* ============================================================
   MESIN EVALUASI
   ============================================================ */
/**
 * Bandingkan kondisi sekarang dengan snapshot siklus sebelumnya.
 *
 * @param {object} k kondisi saat ini:
 *   { classification, tone, wccs, rsi1h, fgValue, fundingCrowded,
 *     btcPrice, btcChange24h, ethPrice, altseasonIndex,
 *     newsHits: [{title, topik, dampak}] }
 * @returns {{fired: Array, unack: number, firstRun: boolean}}
 *   fired = alarm yang baru menyala pada siklus INI (untuk notifikasi/suara)
 */
export function evaluateWatchtower(k){
  const prev = loadSnapshot();
  const firstRun = !prev;

  // Simpan snapshot untuk siklus berikutnya SEBELUM membandingkan —
  // sama pola dengan Delta Engine, tapi snapshot-nya lebih kaya.
  const nowSnap = {
    classification: k.classification ?? null,
    wccs: k.wccs ?? null,
    rsi1h: k.rsi1h ?? null,
    fgValue: k.fgValue ?? null,
    fundingCrowded: !!k.fundingCrowded,
    btcPrice: k.btcPrice ?? null,
    btcChange24h: k.btcChange24h ?? null,
    ethPrice: k.ethPrice ?? null,
    altseasonIndex: k.altseasonIndex ?? null,
    newsSeen: (k.newsHits || []).map(h => judulHash(h.title))
  };
  if (!firstRun) saveSnapshot(nowSnap);

  const fired = [];
  if (firstRun){
    // Siklus pertama di perangkat ini: tidak ada pembanding, tidak ada alarm.
    // Menara menyala mulai siklus kedua — jujur saja begitu.
    saveSnapshot(nowSnap);
    return { fired, unack: getUnackCount(), firstRun: true };
  }

  const alerts = loadAlerts();
  const add = (sev, type, title, body) => { fired.push({ sev, type, title, body }); pushAlert(alerts, { sev, type, title, body }); };

  /* --- 1. Klasifikasi confluence berganti --- */
  if (prev.classification && k.classification && prev.classification !== k.classification){
    const kuat = /STRONG/.test(k.classification);
    add(kuat ? 'warn' : 'info', 'klasifikasi',
      `Skor berpindah kategori: ${prev.classification} → ${k.classification}`,
      `Pembacaan confluence sistematis berubah posisi. Kalau brief terakhir kamu posting masih memakai kategori lama, ini saatnya posting update intraday.`);
  }

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  /* --- 2. WCCS menyebret ambang kategori (±0,4 / ±1,2) --- */
  if (isNum(prev.wccs) && isNum(k.wccs)){
    const batas = [1.2, 0.4, -0.4, -1.2];
    batas.forEach(b => {
      const before = prev.wccs - b, after = k.wccs - b;
      if (before !== 0 && after !== 0 && Math.sign(before) !== Math.sign(after)){
        const arah = b > 0 ? 'naik melewati' : 'turun melewati';
        add(Math.abs(b) >= 1.2 ? 'warn' : 'info', 'wccs',
          `WCCS ${arah} ${b >= 0 ? '+' : ''}${b.toFixed(1)}`,
          `Skor bergerak dari ${prev.wccs.toFixed(2)} ke ${k.wccs.toFixed(2)}. Perpindahan zona seperti ini biasanya lebih penting daripada angka skornya sendiri.`);
      }
    });
  }

  /* --- 3. Funding rate masuk/keluar zona crowding --- */
  if (prev.fundingCrowded !== !!k.fundingCrowded){
    if (k.fundingCrowded){
      add('warn', 'crowding', 'Funding rate masuk zona crowding',
        'Posisi leverage mulai menumpuk satu sisi. Secara historis kondisi seperti ini rentan koreksi cepat — bukan ramalan arah, tapi penanda kerapuhan.');
    } else {
      add('info', 'crowding', 'Funding rate keluar dari zona crowding',
        'Tumpukan leverage yang sempat mencolok sudah mereda. Satu sumber kerapuhan baru saja lepas.');
    }
  }

  /* --- 4. RSI 1 jam menyebret 70 / 30 --- */
  const rsiValid = (v) => isNum(v) && v > 0 && v < 100;
  if (rsiValid(prev.rsi1h) && rsiValid(k.rsi1h)){
    if (prev.rsi1h < 70 && k.rsi1h >= 70){
      add('info', 'rsi', `RSI 1 jam naik ke zona overbought (${Math.round(k.rsi1h)})`,
        'Overbought bukan sinyal jual — ia hanya bilang momentum pembeli sudah bertahan lama di ekstremnya.');
    } else if (prev.rsi1h > 30 && k.rsi1h <= 30){
      add('info', 'rsi', `RSI 1 jam turun ke zona oversold (${Math.round(k.rsi1h)})`,
        'Oversold bukan sinyal beli — penjual sedang menguasai sesi ini. Kedua zona adalah informasi keadaan, bukan instruksi.');
    }
  }

  /* --- 5. Fear & Greed menyebret 75 / 25 --- */
  if (isNum(prev.fgValue) && isNum(k.fgValue)){
    if (prev.fgValue < 75 && k.fgValue >= 75){
      add('info', 'fg', `Sentimen masuk Extreme Greed (${Math.round(k.fgValue)})`,
        'Euforia mulai mencolok. Secara historis kondisi seperti ini lebih rapuh terhadap berita buruk daripada kondisi netral — bukan kepastian, hanya kecenderungan.');
    } else if (prev.fgValue > 25 && k.fgValue <= 25){
      add('info', 'fg', `Sentimen masuk Extreme Fear (${Math.round(k.fgValue)})`,
        'Ketakutan ekstrem. Dalam sejarah indeks ini, zona sering menjadi tempat pembalikan — tapi "sering" bukan "selalu".');
    }
  }

  /* --- 6. Pergerakan 24 jam BTC menyebret ±5% --- */
  if (isNum(prev.btcChange24h) && isNum(k.btcChange24h)){
    const b = 5;
    const before = Math.abs(prev.btcChange24h) - b, after = Math.abs(k.btcChange24h) - b;
    if (before < 0 && after >= 0){
      const arah = k.btcChange24h >= 0 ? 'kenaikan' : 'penurunan';
      add('warn', 'btc', `BTC: ${arah} 24 jam sudah ${Math.abs(k.btcChange24h).toFixed(1)}%`,
        `Pergerakan satu hari sebesar ini berada di luar kebisingan normal untuk sebagian besar rezim pasar. Saat yang tepat untuk mengecek apakah brief pagi masih relevan.`);
    }
  }

  /* --- 7. Indeks altseason menyebret 40 / 60 --- */
  if (isNum(prev.altseasonIndex) && isNum(k.altseasonIndex)){
    if (prev.altseasonIndex < 60 && k.altseasonIndex >= 60){
      add('info', 'altseason', 'Rotasi modal melebar ke altcoin (indeks altseason ≥60)',
        'Mayoritas top-50 kini mengungguli BTC dalam 30 hari. Membaca BTC saja mulai kurang mewakili pasar.');
    } else if (prev.altseasonIndex > 40 && k.altseasonIndex <= 40){
      add('info', 'altseason', 'Rotasi modal kembali terpusat ke BTC (indeks altseason ≤40)',
        'Modal berlindung ke aset paling likuid. Kondisi khas fase pengurangan risiko.');
    }
  }

  /* --- 8. Berita menyentuh topik berdampak — maksimal 3 per siklus --- */
  const baru = (k.newsHits || []).filter(h => !(prev.newsSeen || []).includes(judulHash(h.title)));
  baru.slice(0, 3).forEach(h => {
    add('info', 'news', `Berita topik ${h.topik}: "${potong(h.title, 80)}"`,
      `Judul ini menyentuh topik yang secara historis sering menggerakkan harga (${h.dampak}). Pencocokan kata saja — baca isinya sebelum menyimpulkan.`);
  });

  /* --- 9. Alarm harga kustom admin (one-shot) --- */
  const pas = getPriceAlerts();
  let pasBerubah = false;
  pas.forEach(p => {
    if (!p.active) return;
    const harga = p.coin === 'ETH' ? k.ethPrice : k.btcPrice;
    if (!isNum(harga)) return;
    const kena = p.dir === 'above' ? harga >= p.price : harga <= p.price;
    if (!kena) return;
    p.active = false;
    p.firedAt = Date.now();
    pasBerubah = true;
    add('warn', 'harga', `${p.coin} ${p.dir === 'above' ? 'menembus ke atas' : 'jatuh ke bawah'} ${formatHarga(p.price)}`,
      `Alarm harga yang kamu pasang sendiri terpicu — harga ${p.coin} sekarang ${formatHarga(harga)}. Alasan kamu memasang level ini lebih penting daripada alarmnya; periksa apakah alasan itu masih berlaku.`);
  });
  if (pasBerubah){
    try{ localStorage.setItem(PRICE_ALERT_KEY, JSON.stringify(pas)); }catch(e){}
  }

  if (fired.length) saveAlerts(alerts);
  return { fired, unack: getUnackCount(), firstRun: false };
}

/* ============================================================
   HELPER
   ============================================================ */
function judulHash(s){
  let h = 0;
  const t = String(s || '');
  for (let i = 0; i < t.length; i++){
    h = ((h << 5) - h + t.charCodeAt(i)) | 0;
  }
  return 'h' + h;
}

function potong(s, n){
  return String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || '');
}

function formatHarga(n){
  if (!isFinite(n)) return '—';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : 4 });
}
