/**
 * components/watchtower.js — UI MENARA PENGAWAS (v2.4).
 *
 * Mesinnya (engine/watchtower.js) murni: kondisi masuk, alarm keluar. File
 * ini yang menyentuh DOM dan browser API:
 *   - Banner ringkas tepat di bawah toolbar saat ada alarm baru
 *   - Panel pengelolaan: status 8 aturan, alarm harga kustom, riwayat
 *   - Notifikasi desktop (hanya kalau admin mengizinkan — tidak pernah minta
 *     izin diam-diam) + bunyi beep via Web Audio (tanpa file suara)
 */
import { $, clearNode, createEl } from '../utils/dom.js';
import {
  getAlerts, ackAllAlerts, clearAllAlerts,
  getPriceAlerts, addPriceAlert, removePriceAlert
} from '../engine/watchtower.js';
import { getSetting } from '../engine/settings.js';

let toastFn = () => {};

/* ============================================================
   BEEP — Web Audio, tanpa file. Dua nada naik = alarm baru.
   ============================================================ */
export function beepAlarm(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    [[0, 660], [0.16, 880]].forEach(([dt, freq]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + dt);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + dt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + dt);
      osc.stop(t0 + dt + 0.16);
    });
    setTimeout(() => ctx.close(), 600);
  }catch(e){ /* audio diblokir/autoplay policy — biarkan senyap */ }
}

/* ============================================================
   NOTIFIKASI DESKTOP
   ============================================================ */
export function announceAlerts(fired){
  if (!fired || !fired.length) return;
  if (getSetting('watchNotify') && 'Notification' in window && Notification.permission === 'granted'){
    fired.slice(0, 3).forEach(a => {
      try{
        new Notification(`🗼 ${a.title}`, { body: a.body, tag: a.type });
      }catch(e){ /* abaikan */ }
    });
  }
  if (getSetting('watchSound')) beepAlarm();
}

export function requestNotifyPermission(){
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  return Notification.requestPermission();
}

/* ============================================================
   RENDER BANNER ALARM BARU
   ============================================================ */
export function renderWatchBanner(fired){
  const el = $('watchBanner');
  if (!el) return;
  if (!fired || !fired.length){ el.classList.remove('show'); el.innerHTML = ''; return; }

  const ikon = { info: '🔵', warn: '🟠', danger: '🔴' };
  el.innerHTML = `
    <div class="wb-head"><span>🗼 Menara Pengawas — ${fired.length} kejadian baru</span></div>
    ${fired.map(a => `
      <div class="wb-row wb-${a.sev}">
        <span class="wb-ico">${ikon[a.sev] || '🔵'}</span>
        <div><b>${a.title}</b><div class="wb-body">${a.body}</div></div>
      </div>`).join('')}`;
  el.classList.add('show');
}

/* ============================================================
   RENDER PANEL
   ============================================================ */
function statusAturan(state){
  // Status kondisi terhadap tiap ambang — apa adanya, termasuk "aman".
  const rsi = state.rsi1h;
  const rows = [
    { nama: 'Kategori skor', kini: state.__classification?.label || '—', ambang: 'perubahan kategori' },
    { nama: 'Funding rate', kini: state.__wccsResult?.components?.find(c => c.key === 'E1_funding_rate')?.isCrowded ? 'ZONA CROWDING' : 'normal', ambang: 'masuk/keluar zona' },
    { nama: 'RSI 1 jam', kini: rsi != null ? rsi.toFixed(1) : '—', ambang: 'seberang 70 / 30' },
    { nama: 'Fear & Greed', kini: String(state.fg?.value ?? '—'), ambang: 'seberang 75 / 25' },
    { nama: 'BTC 24 jam', kini: (state.btc?.change != null ? (state.btc.change >= 0 ? '+' : '') + state.btc.change.toFixed(2) + '%' : '—'), ambang: '|Δ| ≥ 5%' },
    { nama: 'Altseason', kini: state.__analytics?.altseason?.available ? String(state.__analytics.altseason.indeks) : '—', ambang: 'seberang 60 / 40' },
    { nama: 'Berita berdampak', kini: String((state.__newsHits || []).length) + ' judul cocok', ambang: 'judul baru' },
    { nama: 'Alarm harga kustom', kini: String(getPriceAlerts().filter(p => p.active).length) + ' aktif', ambang: 'level tersentuh' }
  ];
  return rows.map(r => `
    <div class="wt-rule-row">
      <span class="wt-rule-nama">${r.nama}</span>
      <span class="wt-rule-kini">${r.kini}</span>
      <span class="wt-rule-ambang">${r.ambang}</span>
    </div>`).join('');
}

function renderPriceAlertForm(){
  const wrap = $('wtPriceAlerts');
  if (!wrap) return;
  const daftar = getPriceAlerts();
  const baris = daftar.length ? daftar.slice().reverse().map(p => `
    <div class="wt-pa-row ${p.active ? '' : 'done'}">
      <span>${p.coin} ${p.dir === 'above' ? '≥' : '≤'} <b>$${p.price.toLocaleString('en-US')}</b></span>
      <span class="wt-pa-status">${p.active ? '⏳ menunggu' : `🔔 terpicu ${new Date(p.firedAt || p.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}</span>
      <button class="wt-pa-del" data-id="${p.id}" title="hapus">✕</button>
    </div>`).join('') : '<div class="lab-empty">Belum ada alarm harga. Pasang level yang sudah kamu pertimbangkan — bukan level yang diharap-harapkan.</div>';

  wrap.innerHTML = `
    <form class="wt-pa-form" id="wtPaForm">
      <select id="wtPaCoin"><option value="BTC">BTC</option><option value="ETH">ETH</option></select>
      <select id="wtPaDir"><option value="above">menembus ke atas</option><option value="below">jatuh ke bawah</option></select>
      <input type="number" id="wtPaPrice" placeholder="harga USD" step="any" min="0" required>
      <button type="submit" class="lab-btn">+ Pasang</button>
    </form>
    ${baris}`;
}

export function renderWatchTower(state){
  const panel = $('watchTowerContent');
  if (!panel) return;

  panel.innerHTML = `
    <div class="wt-grid">
      <div class="wt-card">
        <div class="wt-card-head">📜 Riwayat alarm perangkat ini</div>
        <div id="wtHistory"></div>
        <div class="wt-actions">
          <button class="lab-btn" id="wtAckBtn">✓ Tandai semua terbaca</button>
          <button class="lab-btn ghost" id="wtClearBtn">🗑 Kosongkan riwayat</button>
        </div>
      </div>
      <div class="wt-card">
        <div class="wt-card-head">⏰ Alarm harga kustom (one-shot)</div>
        <div id="wtPriceAlerts"></div>
      </div>
      <div class="wt-card">
        <div class="wt-card-head">📡 Status aturan terhadap kondisi sekarang</div>
        <div class="wt-rules">${statusAturan(state)}</div>
        <div class="lab-caveat">Aturan berbasis transisi: alarm bunyi saat kondisi MENYEBERANG ambang, bukan saat berada di atasnya. Karena itu panel ini tenang bukan berarti mati.</div>
      </div>
    </div>`;

  renderPriceAlertForm();

  // Riwayat
  const hist = $('wtHistory');
  const alerts = getAlerts();
  if (!alerts.length){
    hist.innerHTML = '<div class="lab-empty">Belum ada alarm sejak Menara menyala. Tenang itu kabar baik.</div>';
  } else {
    const ikon = { info: '🔵', warn: '🟠', danger: '🔴' };
    hist.innerHTML = alerts.slice().reverse().slice(0, 25).map(a => `
      <div class="wt-hist-row ${a.ack ? '' : 'unack'}">
        <span class="wb-ico">${ikon[a.sev] || '🔵'}</span>
        <div><b>${a.title}</b><div class="wb-body">${a.body}</div>
        <div class="wt-hist-time">${new Date(a.t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
      </div>`).join('');
  }

  $('wtAckBtn').onclick = () => { ackAllAlerts(); renderWatchBanner([]); renderWatchTower(state); toastFn('Semua alarm ditandai terbaca'); };
  $('wtClearBtn').onclick = () => { clearAllAlerts(); renderWatchBanner([]); renderWatchTower(state); toastFn('Riwayat alarm dikosongkan'); };

  $('wtPriceAlerts').querySelectorAll('.wt-pa-del').forEach(btn => {
    btn.onclick = () => { removePriceAlert(btn.dataset.id); renderWatchTower(state); };
  });

  const form = $('wtPaForm');
  if (form){
    form.onsubmit = (e) => {
      e.preventDefault();
      const harga = parseFloat($('wtPaPrice').value);
      if (!isFinite(harga) || harga <= 0){ toastFn('Isi harga target dulu'); return; }
      addPriceAlert({ coin: $('wtPaCoin').value, dir: $('wtPaDir').value, price: harga });
      renderWatchTower(state);
      toastFn('Alarm harga terpasang — akan berbunyi sekali saat tersentuh');
    };
  }
}

export function wireWatchTower(showToast){
  toastFn = showToast || (() => {});
}
