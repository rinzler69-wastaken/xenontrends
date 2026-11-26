/**
 * components/derivatives.js — panel "DERIVATIVES & LEVERAGE" (Pilar E baru).
 * Menampilkan funding rate, OI change, dan badge jalur data (langsung /
 * cadangan) sesuai Bab 9.7 — nama exchange spesifik sengaja tidak
 * ditampilkan ke pengguna (bukan bagian dari kebutuhan tampilan produk).
 */
import { $ } from '../utils/dom.js';
import { formatFundingRate, formatPercent } from '../utils/formatters.js';

export function renderDerivatives(deriv){
  const { rate, oi, oiChangePct, usedPublicProxy, isCrowded, crowdingDirection } = deriv;

  $('fundingRateValue').textContent = rate != null ? formatFundingRate(rate) : 'N/A';
  $('fundingRateValue').className = 'deriv-value' + (rate == null ? '' : rate >= 0 ? ' up' : ' down');

  $('oiChangeValue').textContent = oiChangePct != null ? formatPercent(oiChangePct) : 'N/A';
  $('oiChangeValue').className = 'deriv-value' + (oiChangePct == null ? '' : oiChangePct >= 0 ? ' up' : ' down');

  const proxyBadge = $('derivProxyBadge');
  if (usedPublicProxy){
    proxyBadge.classList.add('show');
    proxyBadge.textContent = '⚠ Data sedikit terlambat — sedang pakai jalur cadangan';
  } else {
    proxyBadge.classList.remove('show');
  }

  const crowdWarn = $('derivCrowdWarn');
  if (isCrowded){
    crowdWarn.classList.add('show');
    crowdWarn.textContent = crowdingDirection === 'long'
      ? '⚡ Posisi long sudah ramai — waspada potensi koreksi mendadak'
      : '⚡ Posisi short sudah ramai — waspada potensi lonjakan mendadak';
  } else {
    crowdWarn.classList.remove('show');
  }
}
