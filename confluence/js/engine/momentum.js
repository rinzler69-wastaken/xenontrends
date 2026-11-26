/**
 * engine/momentum.js — Bab 9.4 dokumen konsep: momentum token dihitung
 * dari data riil (return, volume change, Sharpe-like ratio), BUKAN dipilih
 * acak dari daftar tetap seperti v1.
 *
 * MomentumScore = w1×z(24h_return) + w2×z(volume_change_24h) + w3×z(24h_return / 7d_volatility)
 *
 * Universe dibatasi top-100 market cap (dari endpoint yang sama, CoinGecko
 * /coins/markets) untuk menghindari micro-cap yang datanya terlalu tipis.
 */
import { mean, stdDev, zScore, winsorize } from './statistics.js';
import { tradableUniverse } from './breadth.js';

const WEIGHTS_MOMENTUM = { return24h: 0.4, volumeChange: 0.3, sharpeLike: 0.3 };

/**
 * @param {Array} markets keluaran fetchMarkets() CoinGecko — perlu field
 *   price_change_percentage_24h, total_volume, market_cap, high_24h, low_24h
 * @param {number} [topN=10]
 */
export function computeMomentumTop(markets, topN){
  topN = topN ?? 10;
  const uni = tradableUniverse(markets);
  if (uni.length < 10) return [];

  const returns = uni.map(m => m.price_change_percentage_24h ?? 0);
  const volProxies = uni.map(m => m.market_cap_change_percentage_24h ?? m.price_change_percentage_24h ?? 0);
  const sharpeLikes = uni.map(m => {
    const ret = m.price_change_percentage_24h ?? 0;
    const rawRange = m.high_24h && m.low_24h && m.current_price
      ? ((m.high_24h - m.low_24h) / m.current_price) * 100
      : Math.abs(ret) || 1;
    const volatilityProxy = Math.max(0.5, rawRange);
    return ret / volatilityProxy;
  });

  const muReturn = mean(returns), sigmaReturn = stdDev(returns) || 1;
  const muVol = mean(volProxies), sigmaVol = stdDev(volProxies) || 1;
  const muSharpe = mean(sharpeLikes), sigmaSharpe = stdDev(sharpeLikes) || 1;

  const scored = uni.map((m, idx) => {
    const ret = returns[idx];
    const zReturn = winsorize(zScore(ret, muReturn, sigmaReturn));
    const zVolume = winsorize(zScore(volProxies[idx], muVol, sigmaVol));
    const zSharpe = winsorize(zScore(sharpeLikes[idx], muSharpe, sigmaSharpe));

    const composite = WEIGHTS_MOMENTUM.return24h * zReturn
      + WEIGHTS_MOMENTUM.volumeChange * zVolume
      + WEIGHTS_MOMENTUM.sharpeLike * zSharpe;

    const score = Math.round(50 + composite * 12);

    return {
      ticker: (m.symbol || '').toUpperCase(),
      name: m.name,
      score: Math.max(1, Math.min(99, score)),
      trend: ret > 0.5 ? 'up' : ret < -0.5 ? 'down' : 'flat',
      return24h: ret
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
