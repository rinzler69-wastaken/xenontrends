/**
 * components/onchain.js — panel "ALIRAN ON-CHAIN" (Pilar D).
 */
import { $ } from '../utils/dom.js';
import { formatCompact } from '../utils/formatters.js';

export function renderFlows(onchain){
  const rows = [
    { name: 'BTC', sub: `${onchain.btc.txCount} transaksi whale`, data: onchain.btc },
    { name: 'ETH', sub: `${onchain.eth.txCount} transaksi whale`, data: onchain.eth }
  ];

  const html = rows.map(r => {
    const amt = r.data.amount;
    // orientasi D1/D2 = -1 di sign-validation: netflow POSITIF (inflow ke exchange) = bearish
    const isBearish = amt >= 0;
    const cls = isBearish ? 'red' : 'green';
    const label = isBearish ? 'INFLOW (tekanan jual)' : 'OUTFLOW (akumulasi)';
    return `
      <div class="flow-row">
        <div class="flow-left">
          <span class="flow-dot ${cls}"></span>
          <div>
            <div class="flow-name">${r.name}<span class="sub">${r.sub}</span></div>
          </div>
        </div>
        <div class="flow-right">
          <div class="flow-amt">${formatCompact(amt * 1_000_000)}</div>
          <span class="flow-tag ${cls}">${label}</span>
        </div>
      </div>`;
  }).join('');
  $('flowRows').innerHTML = html;

  // Tanda dibalik (-): outflow (amt negatif) = akumulasi (kiri/hijau membesar)
  const netScore = -(onchain.btc.amount * 1 + onchain.eth.amount * 0.1);
  const norm = Math.max(-15, Math.min(15, netScore));
  const pct = ((norm + 15) / 30) * 100;
  $('heatTrack').innerHTML = `
    <div class="heat-seg" style="width:${pct}%; background: linear-gradient(90deg, var(--up), rgba(33,209,159,0.3));"></div>
    <div class="heat-seg" style="width:${100 - pct}%; background: linear-gradient(90deg, rgba(255,84,112,0.3), var(--down));"></div>
  `;
}
