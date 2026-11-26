/**
 * formatters.js — fungsi murni angka/tanggal → string tampilan.
 * Tanpa akses DOM, supaya mudah diuji terpisah.
 */

export function formatCurrency(n, decimals){
  if (n == null || isNaN(n)) return '—';
  if (n >= 1000){
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: decimals ?? 0 });
  }
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCompact(n){
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000_000) return sign + '$' + (abs / 1_000_000_000_000).toFixed(2) + 'T';
  if (abs >= 1_000_000_000) return sign + '$' + (abs / 1_000_000_000).toFixed(2) + 'B';
  if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000) return sign + '$' + (abs / 1_000).toFixed(1) + 'K';
  return sign + '$' + abs.toFixed(0);
}

export function formatPercent(n, decimals){
  if (n == null || isNaN(n)) return '—';
  const arrow = n >= 0 ? '▲' : '▼';
  return arrow + ' ' + Math.abs(n).toFixed(decimals ?? 2) + '%';
}

export function formatSigned(n, decimals){
  if (n == null || isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(decimals ?? 2);
}

export function formatDateID(date){
  try{
    const f = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
    });
    let s = f.format(date);
    s = s.replace(/(\d{2})\.(\d{2})$/, '$1:$2');
    return s + ' WIB';
  }catch(e){ return date.toString(); }
}

export function fgClassify(value){
  if (value >= 75) return 'Extreme Greed';
  if (value >= 55) return 'Greed';
  if (value >= 45) return 'Netral';
  if (value >= 25) return 'Fear';
  return 'Extreme Fear';
}

/** Format basis poin funding rate per-8-jam jadi persen yang gampang dibaca. */
export function formatFundingRate(rateDecimal){
  if (rateDecimal == null || isNaN(rateDecimal)) return '—';
  const pct = rateDecimal * 100;
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(4) + '%';
}
