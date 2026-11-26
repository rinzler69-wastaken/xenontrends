/**
 * engine/divergence-scanner.js — perluasan Bab 6.2 (Rotational Divergence)
 * dari 2 aset (BTC/ETH) ke seluruh universe momentum top-10. Mendeteksi
 * koin mana yang pergerakan harganya "meyakinkan" (didukung volume/momentum
 * konsisten) versus "rapuh" (kenaikan besar tapi sinyal pendukung lemah).
 *
 * Berbeda dari divergence.js (Bab 6, khusus price-vs-onchain-flow BTC/ETH),
 * scanner ini bekerja murni dari data momentum yang sudah ditarik untuk
 * Pilar B tanpa panggilan API tambahan — cross-check antara return 24h dan
 * proksi volatilitas untuk menandai pola "naik di atas volume tipis" atau
 * sejenisnya, yang secara statistik lebih rentan reversal.
 */

/**
 * @param {Array<{ticker:string, name:string, score:number, trend:string, return24h:number}>} momentum
 * @param {Array} rawMarkets data mentah dari CoinGecko markets (untuk akses market_cap_change & volatility proxy)
 */
export function scanMomentumDivergence(momentum, rawMarkets){
  if (!momentum || !rawMarkets) return [];

  const marketMap = new Map(rawMarkets.map(m => [(m.symbol || '').toUpperCase(), m]));
  const flags = [];

  momentum.forEach(m => {
    const raw = marketMap.get(m.ticker);
    if (!raw) return;

    const priceReturn = raw.price_change_percentage_24h ?? 0;
    const capReturn = raw.market_cap_change_percentage_24h ?? priceReturn;
    const volatilityProxy = raw.high_24h && raw.low_24h && raw.current_price
      ? ((raw.high_24h - raw.low_24h) / raw.current_price) * 100
      : Math.abs(priceReturn);

    // Pola 1: harga naik signifikan tapi market cap change jauh lebih kecil
    // (indikasi kenaikan didorong volume tipis / sedikit pelaku, bukan
    // partisipasi pasar luas)
    const capLag = priceReturn > 1 && (capReturn < priceReturn * 0.5);

    // Pola 2: pergerakan harga jauh lebih kecil dari rentang intraday-nya
    // sendiri (whipsaw tinggi, arah akhir tidak meyakinkan meski skor
    // momentum tinggi)
    const highWhipsaw = volatilityProxy > Math.abs(priceReturn) * 4 && volatilityProxy > 5;

    if (capLag || highWhipsaw){
      flags.push({
        ticker: m.ticker,
        pattern: capLag ? 'thin-participation' : 'high-whipsaw',
        label: capLag
          ? 'Kenaikan harga belum diikuti partisipasi pasar yang luas'
          : 'Pergerakan harga cenderung liar dalam 24 jam, arah belum solid',
        priceReturn, capReturn, volatilityProxy
      });
    }
  });

  return flags;
}
