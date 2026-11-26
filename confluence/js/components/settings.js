/**
 * components/settings.js — PANEL PENGATURAN (v2.4).
 *
 * Modal berisi penyesuaian yang sebelumnya harus diedit lewat config.js:
 * API key CoinGecko, interval refresh, izin notifikasi, suara — plus Mode
 * Eksperimen Bobot: sandbox yang menghitung ulang WCCS dengan bobot buatan
 * sendiri HANYA untuk perbandingan sampingan dengan skor resmi. Skor resmi,
 * ledger, dan rekam jejak tidak pernah menyentuh angka eksperimen ini —
 * garis yang menjaga rekam jejak tetap sebanding sejak v2.0.
 */
import { $, clearNode, createEl } from '../utils/dom.js';
import {
  getAllSettings, setSettings, resetSettings, normalizeWeights
} from '../engine/settings.js';
import { requestNotifyPermission } from './watchtower.js';
import { computeWCCS, classifyWCCS } from '../engine/wccs.js';

let toastFn = () => {};
let getStateFn = () => null;

export function openSettings(){
  $('settingsModal').classList.add('show');
  document.body.style.overflow = 'hidden';
  renderSettings();
}

export function closeSettings(){
  $('settingsModal').classList.remove('show');
  document.body.style.overflow = '';
}

export function wireSettings(getState, showToast){
  toastFn = showToast || (() => {});
  getStateFn = getState || (() => null);
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsClose').addEventListener('click', closeSettings);
  $('settingsModal').addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') closeSettings();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('settingsModal').classList.contains('show')) closeSettings();
  });
}

function renderSettings(){
  const s = getAllSettings();
  const root = $('settingsContent');
  clearNode(root);

  /* --- CoinGecko API key --- */
  const apiKeyWrap = createEl('div', 'set-block');
  apiKeyWrap.innerHTML = `
    <div class="set-title">🔑 Demo API Key CoinGecko <span class="set-optional">opsional</span></div>
    <div class="set-desc">Menaikkan kuota dari rate-limit publik yang ketat menjadi 10.000 panggilan/bulan. Daftar gratis di coingecko.com → Developers → Demo API Key. Kosongkan untuk kembali ke mode publik.</div>
    <div class="set-row">
      <input type="text" id="setApiKey" placeholder="CG-xxxxxxxxxxxxxxxx" value="${String(s.coingeckoApiKey || '').replace(/"/g, '&quot;')}" spellcheck="false">
      <button class="lab-btn" id="setApiKeySave">Simpan</button>
      <button class="lab-btn ghost" id="setApiKeyClear">Hapus</button>
    </div>`;
  root.appendChild(apiKeyWrap);

  /* --- interval refresh --- */
  const refWrap = createEl('div', 'set-block');
  refWrap.innerHTML = `
    <div class="set-title">⏱ Interval auto-refresh</div>
    <div class="set-desc">Seberapa sering dashboard menarik data ulang. 60 detik adalah nilai aman untuk CoinGecko publik. Matikan kalau kamu me-minimize dashboard seharian dan lebih suka menarik manual.</div>
    <div class="set-row">
      ${[[30000, '30 detik'], [60000, '60 detik (rekomendasi)'], [120000, '2 menit'], [300000, '5 menit'], [0, 'Matikan']]
        .map(([v, l]) => `<button class="set-choice ${s.refreshMs === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}
    </div>`;
  root.appendChild(refWrap);

  /* --- menara pengawas --- */
  const watchWrap = createEl('div', 'set-block');
  watchWrap.innerHTML = `
    <div class="set-title">🗼 Menara Pengawas</div>
    <div class="set-row">
      <label class="set-toggle"><input type="checkbox" id="setWatchOn" ${s.watchEnabled ? 'checked' : ''}> Evaluasi aturan & banner aktif</label>
      <label class="set-toggle"><input type="checkbox" id="setWatchSound" ${s.watchSound ? 'checked' : ''}> Bunyi beep saat alarm baru</label>
      <label class="set-toggle"><input type="checkbox" id="setWatchNotify" ${s.watchNotify ? 'checked' : ''}> Notifikasi desktop</label>
    </div>
    <div class="set-note" id="setNotifyNote"></div>`;
  root.appendChild(watchWrap);

  /* --- eksperimen bobot (SANDBOX) --- */
  const exp = s.experimentWeights;
  const expWrap = createEl('div', 'set-block');
  expWrap.innerHTML = `
    <div class="set-title">🧪 Mode Eksperimen Bobot <span class="set-optional">sandbox — skor resmi tidak tersentuh</span></div>
    <div class="set-desc">Geser bobot pilar untuk melihat bagaimana skor HARI INI dibaca kalau strukturnya berbeda. Hasilnya tampil sebagai baris pembanding di bawah Signal Box — diberi label jelas, tidak masuk ledger, tidak masuk rekam jejak, hilang saat dinonaktifkan. Bobot resmi lima pilar tetap beku seperti sejak v2.0.</div>
    <div class="set-weights" id="setWeights">
      ${['A', 'B', 'C', 'D', 'E'].map(k => `
        <label class="set-w-row">
          <span>Pilar ${k} <b id="setw-${k}">${exp ? Math.round(exp[k] * 100) : { A: 25, B: 20, C: 15, D: 20, E: 20 }[k]}%</b></span>
          <input type="range" min="0" max="50" step="1" data-k="${k}" value="${exp ? Math.round(exp[k] * 100) : { A: 25, B: 20, C: 15, D: 20, E: 20 }[k]}">
        </label>`).join('')}
    </div>
    <div class="set-row">
      <button class="lab-btn" id="setExpApply">Terapkan eksperimen</button>
      <button class="lab-btn ghost" id="setExpOff">Matikan (kembali ke resmi)</button>
      <span class="set-note" id="setExpSum"></span>
    </div>`;
  root.appendChild(expWrap);

  /* --- bahaya: reset --- */
  const dangerWrap = createEl('div', 'set-block set-danger');
  dangerWrap.innerHTML = `
    <div class="set-title">↺ Reset</div>
    <div class="set-desc">Kembalikan semua pengaturan panel ini ke bawaan (ledger, rekam jejak, dan cache data TIDAK ikut terhapus).</div>
    <button class="lab-btn ghost" id="setResetBtn">Reset pengaturan</button>`;
  root.appendChild(dangerWrap);

  /* --- wiring --- */
  $('setApiKeySave').onclick = () => {
    setSettings({ coingeckoApiKey: $('setApiKey').value.trim() });
    toastFn('API key tersimpan — berlaku pada refresh berikutnya (atau klik ↻ sekarang)');
  };
  $('setApiKeyClear').onclick = () => {
    setSettings({ coingeckoApiKey: '' });
    $('setApiKey').value = '';
    toastFn('API key dihapus — kembali ke rate-limit publik');
  };

  refWrap.querySelectorAll('.set-choice').forEach(b => {
    b.onclick = () => {
      setSettings({ refreshMs: Number(b.dataset.v) });
      renderSettings();
      toastFn('Interval refresh diperbarui — aktif pada siklus berikutnya');
    };
  });

  $('setWatchOn').onchange = (e) => setSettings({ watchEnabled: e.target.checked });
  $('setWatchSound').onchange = (e) => setSettings({ watchSound: e.target.checked });
  $('setWatchNotify').onchange = async (e) => {
    if (e.target.checked){
      const perm = await requestNotifyPermission();
      if (perm !== 'granted'){
        setSettings({ watchNotify: false });
        e.target.checked = false;
        toastFn('Izin notifikasi ditolak browser — pakai banner/suara saja');
        return;
      }
    }
    setSettings({ watchNotify: e.target.checked });
  };

  // slider bobot: tampilkan persen + jumlah
  const sumLabel = $('setExpSum');
  const bacaBobot = () => {
    const w = {};
    expWrap.querySelectorAll('input[type=range]').forEach(r => { w[r.dataset.k] = Number(r.value); });
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    if (sumLabel) sumLabel.textContent = `total ${total}% (harus 100%)`;
    return w;
  };
  expWrap.querySelectorAll('input[type=range]').forEach(r => {
    r.oninput = () => { $(`setw-${r.dataset.k}`).textContent = r.value + '%'; bacaBobot(); };
  });
  $('setExpApply').onclick = () => {
    const mentah = bacaBobot();
    const total = Object.values(mentah).reduce((a, b) => a + b, 0);
    if (total <= 0){ toastFn('Total bobot tidak boleh nol'); return; }
    // normalisasi ke pecahan berjumlah 1
    const norm = {}; Object.keys(mentah).forEach(k => { norm[k] = mentah[k] / total; });
    setSettings({ experimentWeights: norm });
    renderSettings();
    renderExperimentRow(getStateFn()); // pembanding tampil seketika, tanpa menunggu siklus
    toastFn('Eksperimen bobot aktif — baris pembanding tampil di bawah Signal Box');
  };
  $('setExpOff').onclick = () => {
    setSettings({ experimentWeights: null });
    renderSettings();
    renderExperimentRow(getStateFn());
    toastFn('Eksperimen dimatikan — kembali ke bobot resmi');
  };

  $('setResetBtn').onclick = () => {
    resetSettings();
    renderSettings();
    renderExperimentRow(getStateFn());
    toastFn('Pengaturan dikembalikan ke bawaan');
  };
}

/* ============================================================
   EKSPERIMEN: skor pembanding dari bobot sandbox
   ============================================================ */
/**
 * @returns {{wccs:number, classification:object, weights:object}|null}
 * null = eksperimen tidak aktif atau state belum siap.
 * Input pilar mentah diambil dari cache yang disiapkan main.js saat render —
 * komponen scoring-nya SAMA, hanya bobot pilarnya diganti.
 */
export function computeExperiment(state){
  const w = getAllSettings().experimentWeights;
  if (!w || !state || !state.__pillarInputsCache) return null;
  try{
    const res = computeWCCS(state.__pillarInputsCache, { pillars: w });
    return { wccs: res.wccs, classification: classifyWCCS(res.wccs), weights: w };
  }catch(e){ return null; }
}

/**
 * Baris pembanding di bawah Signal Box. Hanya tampil saat eksperimen aktif.
 * Diberi label eksplisit "eksperimen" supaya tidak ada yang mempotret baris
 * ini lalu menyebarnya sebagai skor resmi.
 */
export function renderExperimentRow(state){
  const el = document.getElementById('expRow');
  if (!el) return;
  const e = computeExperiment(state);
  if (!e){
    el.classList.remove('show');
    el.innerHTML = '';
    return;
  }
  const resmi = state.__wccsResult?.wccs;
  const clsResmi = state.__classification?.label || '—';
  const selisih = resmi != null ? e.wccs - resmi : null;
  const fmtBobot = Object.entries(e.weights).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' / ');
  el.classList.add('show');
  el.innerHTML =
    `🧪 <b>Eksperimen bobot</b> (sandbox — tidak memengaruhi skor resmi, ledger, atau rekam jejak): ` +
    `${fmtBobot} → WCCS eksperimen <b>${e.wccs.toFixed(2)}</b> (${e.classification.label}) · ` +
    `resmi <b>${resmi != null ? resmi.toFixed(2) : '—'}</b> (${clsResmi})` +
    (selisih != null ? ` · selisih <b>${selisih >= 0 ? '+' : ''}${selisih.toFixed(2)}</b>.` : '.') +
    ` Kalau eksperimenmu terus lebih masuk akal dari bobot resmi, catat di changelog metodologi — jangan ubah diam-diam.`;
}
