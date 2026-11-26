/**
 * components/scenario-lab.js — DUA ALAT INTERAKTIF.
 *
 * 1. SIMULATOR "BAGAIMANA KALAU"
 *    Geser harga BTC, sentimen, atau funding, lalu lihat WCCS dihitung ulang
 *    seketika dengan mesin yang sama persis. Nilainya bukan meramal — tapi
 *    membuat sensitivitas skor jadi terlihat. Banyak orang mengira skor
 *    komposit itu kotak hitam; setelah menggeser slider tiga kali, kamu tahu
 *    komponen mana yang benar-benar menggerakkannya dan seberapa jauh harga
 *    harus bergerak sebelum kategorinya berubah. Itu pemahaman yang tidak
 *    bisa diberikan angka diam.
 *
 * 2. KALKULATOR UKURAN POSISI
 *    Aritmetika manajemen risiko, bukan saran. Ia tidak tahu dan tidak
 *    menanyakan aset apa yang kamu pegang; ia hanya menjawab satu pertanyaan
 *    yang jawabannya murni hitungan: "kalau kerugian maksimal yang kamu
 *    terima sekian, dan titik salahmu sejauh sekian, ukuran posisinya
 *    berapa". Jarak stop-nya diisi otomatis dari volatilitas terealisasi,
 *    supaya angkanya berpijak pada kondisi pasar nyata, bukan tebakan.
 */
import { $ } from '../utils/dom.js';
import { formatCurrency } from '../utils/formatters.js';

let simulateFn = null;
let volRef = null;

/* ============================================================
   SIMULATOR WHAT-IF
   ============================================================ */
function renderHasilSimulasi(hasil, base){
  const el = $('scenarioResult');
  if (!el) return;
  if (!hasil){
    el.innerHTML = '<div class="lab-empty">Simulasi belum bisa berjalan — data dasar belum siap.</div>';
    return;
  }

  const beda = hasil.wccs - base.wccs;
  const ganti = hasil.classification.label !== base.classification.label;

  el.innerHTML = `
    <div class="sim-grid">
      <div class="sim-col">
        <div class="sim-cap">Sekarang</div>
        <div class="sim-label">${base.classification.label}</div>
        <div class="sim-score">${base.wccs >= 0 ? '+' : ''}${base.wccs.toFixed(2)}</div>
        <div class="sim-conf">keyakinan ${base.confidence}%</div>
      </div>
      <div class="sim-arrow">→</div>
      <div class="sim-col ${ganti ? 'changed' : ''}">
        <div class="sim-cap">Skenario</div>
        <div class="sim-label">${hasil.classification.label}</div>
        <div class="sim-score">${hasil.wccs >= 0 ? '+' : ''}${hasil.wccs.toFixed(2)}</div>
        <div class="sim-conf">keyakinan ${hasil.confidence}%</div>
      </div>
    </div>
    <div class="sim-verdict ${ganti ? 'warn' : ''}">
      ${ganti
        ? `Dalam skenario ini klasifikasi <b>berubah</b> dari ${base.classification.label} ke ${hasil.classification.label}. Artinya kategori sekarang berada dekat batas — pergeseran sebesar ini saja sudah cukup memindahkannya.`
        : `Klasifikasi <b>tetap</b> ${hasil.classification.label} meski skornya bergeser ${beda >= 0 ? '+' : ''}${beda.toFixed(2)}. Kategori sekarang cukup kokoh terhadap perubahan sebesar ini.`}
    </div>
    <div class="lab-caveat">
      Simulasi ini memakai mesin WCCS yang sama persis, dengan hanya komponen yang kamu geser
      yang diubah. Yang <b>tidak</b> ia lakukan: memperkirakan apakah skenario itu akan terjadi.
      Ia menjawab "seandainya", bukan "kemungkinannya".
    </div>`;
}

function jalankanSimulasi(){
  if (!simulateFn) return;
  const btc = parseFloat($('simBtc').value);
  const fg = parseFloat($('simFg').value);
  const fund = parseFloat($('simFunding').value);

  $('simBtcVal').textContent = `${btc >= 0 ? '+' : ''}${btc.toFixed(1)}%`;
  $('simFgVal').textContent = `${fg >= 0 ? '+' : ''}${fg.toFixed(0)} poin`;
  $('simFundingVal').textContent = `${fund.toFixed(1)}×`;

  const out = simulateFn({ btcDeltaPct: btc, fgDelta: fg, fundingMult: fund });
  if (out) renderHasilSimulasi(out.skenario, out.dasar);
}

function resetSimulasi(){
  $('simBtc').value = 0;
  $('simFg').value = 0;
  $('simFunding').value = 1;
  jalankanSimulasi();
}

/* ============================================================
   KALKULATOR UKURAN POSISI
   ============================================================ */
function hitungPosisi(){
  const el = $('sizerResult');
  if (!el) return;

  const modal = parseFloat($('sizerEquity').value);
  const risikoPct = parseFloat($('sizerRisk').value);
  const stopPct = parseFloat($('sizerStop').value);

  if (!isFinite(modal) || modal <= 0 || !isFinite(risikoPct) || risikoPct <= 0 || !isFinite(stopPct) || stopPct <= 0){
    el.innerHTML = '<div class="lab-empty">Isi ketiga kolom dengan angka lebih besar dari nol.</div>';
    return;
  }

  const risikoUsd = modal * (risikoPct / 100);
  const ukuranPosisi = risikoUsd / (stopPct / 100);
  const leverageSetara = ukuranPosisi / modal;
  const porsiModal = (ukuranPosisi / modal) * 100;

  // Matematika pemulihan — bagian yang paling sering diabaikan orang.
  const setelahRugi = 100 - risikoPct;
  const butuhNaik = (100 / setelahRugi - 1) * 100;

  // Berapa kali kerugian beruntun sebelum modal terpangkas 50%
  const beruntunKe50 = Math.ceil(Math.log(0.5) / Math.log(1 - risikoPct / 100));

  const peringatan = leverageSetara > 3
    ? `<div class="sizer-warn">Ukuran posisi ini setara ${leverageSetara.toFixed(1)}× modal — hanya bisa dicapai dengan leverage. Perlu diingat bahwa likuidasi paksa bisa terjadi sebelum harga menyentuh titik stop yang kamu rencanakan, sehingga kerugian nyatanya bisa melebihi angka di atas.</div>`
    : '';

  el.innerHTML = `
    <div class="sizer-grid">
      <div class="sizer-item"><div class="sizer-val">${formatCurrency(ukuranPosisi)}</div><div class="sizer-cap">ukuran posisi</div></div>
      <div class="sizer-item"><div class="sizer-val neg">${formatCurrency(risikoUsd)}</div><div class="sizer-cap">kerugian bila stop kena</div></div>
      <div class="sizer-item"><div class="sizer-val">${porsiModal.toFixed(0)}%</div><div class="sizer-cap">dari modal</div></div>
      <div class="sizer-item"><div class="sizer-val">${leverageSetara.toFixed(2)}×</div><div class="sizer-cap">setara leverage</div></div>
    </div>
    ${peringatan}
    <div class="sizer-math">
      <div><b>Matematika pemulihan.</b> Kalau stop ini kena, modal tersisa ${setelahRugi.toFixed(1)}% dan
      butuh kenaikan <b>${butuhNaik.toFixed(2)}%</b> hanya untuk kembali ke titik semula. Ketimpangan ini
      melebar sangat cepat: rugi 50% butuh naik 100%, rugi 80% butuh naik 400%.</div>
      <div><b>Ketahanan beruntun.</b> Dengan risiko ${risikoPct}% per posisi, dibutuhkan sekitar
      <b>${beruntunKe50} kerugian berturut-turut</b> untuk memangkas modal jadi separuh. Rangkaian kalah
      beruntun sepanjang itu bukan hal aneh — sistem dengan tingkat keberhasilan 60% pun tetap mengalaminya.</div>
    </div>
    <div class="lab-caveat">
      Ini kalkulator aritmetika, bukan rekomendasi. Ia tidak tahu aset apa yang kamu pegang, tidak tahu
      kondisi keuanganmu, dan tidak menyarankan angka mana yang pantas kamu pakai. Yang ia lakukan hanya
      menjawab: dengan tiga angka yang kamu isi sendiri, berapa hasil pembagiannya.
    </div>`;
}

/* ============================================================
   WIRING
   ============================================================ */
export function wireScenarioLab(simulate){
  simulateFn = simulate;

  ['simBtc', 'simFg', 'simFunding'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', jalankanSimulasi);
  });
  const reset = $('simReset');
  if (reset) reset.addEventListener('click', resetSimulasi);

  ['sizerEquity', 'sizerRisk', 'sizerStop'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', hitungPosisi);
  });
}

/**
 * Dipanggil tiap render: menyegarkan hasil simulasi terhadap data baru, dan
 * mengisi jarak stop default dari volatilitas terealisasi kalau pengguna
 * belum menyentuh kolomnya.
 */
export function refreshScenarioLab(vol){
  volRef = vol;
  const stopEl = $('sizerStop');
  if (stopEl && !stopEl.dataset.touched && vol && vol.available && vol.rentangHarianPct){
    // Default: 1,5× rentang harian tipikal — cukup longgar agar tidak
    // tersentuh kebisingan sehari-hari. Angkanya bisa diubah pengguna.
    stopEl.value = (vol.rentangHarianPct * 1.5).toFixed(1);
    const hint = $('sizerStopHint');
    if (hint) hint.textContent = `Terisi otomatis dari volatilitas terealisasi (1,5× rentang harian tipikal ±${vol.rentangHarianPct}%). Ubah sesuai rencanamu sendiri.`;
  }
  if (stopEl && !stopEl.dataset.wired){
    stopEl.dataset.wired = '1';
    stopEl.addEventListener('input', () => { stopEl.dataset.touched = '1'; });
  }
  jalankanSimulasi();
  hitungPosisi();
}
