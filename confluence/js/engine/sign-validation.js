/**
 * sign-validation.js — Bab 4.3 dokumen konsep: "uji dulu, percaya kemudian".
 *
 * Prinsip ini diadopsi langsung dari kasus BGeometrics Bitcoin Regime Score
 * (2026): dua dari enam dimensi yang "orientasinya kedengaran obvious"
 * (volatilitas rendah = sehat, exchange outflow = bullish) ternyata TERBALIK
 * ketika diuji korelasinya terhadap referensi siklus harga riil. Realized
 * volatility justru tinggi di puncak siklus, bukan rendah. Exchange inflow
 * dan distribusi miner justru menyertai puncak, bukan menyertai capital
 * flight. Setelah orientasi dikoreksi, korelasi komposit mereka terhadap
 * referensi siklus naik dari 0.744 ke 0.782.
 *
 * KARENA APLIKASI INI BELUM PUNYA 90-HARI DATA HISTORIS SENDIRI PADA HARI
 * PERTAMA RILIS, orientasi di bawah ini dimulai dari konsensus literatur
 * yang sudah divalidasi pihak lain (dikutip per komponen), BUKAN divalidasi
 * ulang dari nol oleh kita — tapi status validitas didokumentasikan jujur
 * (`validated: false` berarti "belum kita uji ulang sendiri", bukan "salah").
 * Revalidasi terjadwal tiap 90 hari begitu cukup data historis terkumpul
 * (Bab 4.3, Bab 12 — tata kelola metodologi).
 */

/**
 * orientation: +1 berarti "z-score tinggi = bullish", -1 berarti sebaliknya.
 * validated: apakah ArgonPulse sendiri sudah menguji ulang orientasi ini
 *            terhadap data historisnya sendiri (vs mengandalkan literatur).
 */
export const SIGN_ORIENTATION = {
  A1_btc_24h_return: { orientation: 1, validated: false, note: 'Return positif = bullish. Definisional, tidak perlu uji ulang.' },
  A2_eth_btc_relative: { orientation: 1, validated: false, note: 'ETH outperform BTC = rotasi risk-on ke altcoin, dibaca netral-bullish untuk ETH-side.' },

  B1_rsi_1h: { orientation: 1, validated: false, note: 'RSI tinggi = momentum kuat (bullish), TAPI overbought (>70) adalah peringatan terpisah, bukan pembalikan arah dalam WCCS.' },
  B2_rsi_4h: { orientation: 1, validated: false, note: 'Sama seperti B1, timeframe lebih panjang.' },

  C1_fg_level: { orientation: 1, validated: false, note: 'PERINGATAN: F&G tinggi historically justru rawan koreksi. Diberi orientasi +1 (searah bullish) HANYA di rentang moderat; di zona ekstrem (>75 atau <25) WCCS menambahkan flag kontekstual terpisah, bukan membalik tanda intra-formula (lihat insight-narrative.js).' },
  C2_fg_delta: { orientation: 1, validated: false, note: 'Percepatan sentimen searah momentum jangka pendek.' },

  D1_btc_netflow: { orientation: -1, validated: false, note: 'Netflow POSITIF = inflow ke exchange = tekanan jual (bearish). Orientasi -1. Dikutip dari CryptoQuant/KuCoin: "inflow often coincide with local tops".' },
  D2_eth_netflow: { orientation: -1, validated: false, note: 'Sama seperti D1.' },

  E1_funding_rate: { orientation: 0, validated: false, note: 'BUKAN monoton — lihat crowdingIntensity() di statistics.js. Funding moderat positif = bullish ringan, funding EKSTREM (kedua arah) = sinyal risiko crowding, bukan makin bullish/bearish.' },
  E2_oi_change: { orientation: 0, validated: false, note: 'OI naik memperkuat/memvalidasi arah funding rate saat itu (searah E1), bukan berdiri sendiri sebagai sinyal arah independen.' }
};

/**
 * @param {string} key
 * @returns {{orientation:number, validated:boolean, note:string}}
 */
export function getOrientation(key){
  return SIGN_ORIENTATION[key] || { orientation: 1, validated: false, note: 'Belum terdaftar, default netral +1.' };
}
