/**
 * engine/delta.js — "Apa yang berubah sejak brief terakhir". Menyimpan satu
 * snapshot ringkas tiap render dan membandingkannya dengan snapshot
 * sebelumnya, supaya pembaca yang cek dashboard beberapa kali sehari
 * langsung tahu apa yang bergeser tanpa harus membaca ulang semuanya.
 */

const SNAPSHOT_KEY = 'ic_last_snapshot_v1';

/**
 * @param {{wccs:number, classification:string, confidence:number, btcPrice:number, ethPrice:number, fgValue:number}} current
 * @returns {object|null} delta terhadap snapshot sebelumnya, atau null kalau ini snapshot pertama
 */
export function computeDelta(current){
  let previous = null;
  try{
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    previous = raw ? JSON.parse(raw) : null;
  }catch(e){ /* abaikan */ }

  if (!previous){
    try{
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...current, savedAt: Date.now() }));
    }catch(e){ /* abaikan */ }
    return null;
  }

  const minutesAgo = Math.round((Date.now() - (previous.savedAt || Date.now())) / 60000);
  // Hanya perbarui titik patokan snapshot jika sudah lewat >= 30 menit,
  // supaya auto-refresh 60 detik tidak menghapus pembanding dari sesi sebelumnya.
  if (minutesAgo >= 30){
    try{
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...current, savedAt: Date.now() }));
    }catch(e){ /* abaikan */ }
  }

  if (minutesAgo < 1) return null;

  const wccsDelta = current.wccs - previous.wccs;
  const classificationChanged = current.classification !== previous.classification;
  const btcPctMove = ((current.btcPrice - previous.btcPrice) / previous.btcPrice) * 100;
  const ethPctMove = ((current.ethPrice - previous.ethPrice) / previous.ethPrice) * 100;
  const fgDelta = current.fgValue - previous.fgValue;

  return {
    minutesAgo,
    wccsDelta: Number(wccsDelta.toFixed(3)),
    classificationChanged,
    previousClassification: previous.classification,
    btcPctMove: Number(btcPctMove.toFixed(2)),
    ethPctMove: Number(ethPctMove.toFixed(2)),
    fgDelta,
    confidenceDelta: current.confidence - previous.confidence
  };
}
