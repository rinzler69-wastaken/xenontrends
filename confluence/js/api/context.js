/**
 * api/context.js — Radar Konteks (Bab 9.6). SENGAJA TIDAK masuk formula
 * WCCS — murni overlay informasi untuk pembaca, ditampilkan terpisah
 * (Bab 11.6). Event calendar (CoinMarketCal) tidak diimplementasi di v2.0
 * karena butuh API key berbayar untuk akses penuh; TVL & news cukup untuk
 * MVP overlay ini.
 */
import { CONFIG } from '../config.js';

/** TVL total DeFi 7 hari terakhir, untuk sparkline konteks. */
export async function fetchDefiTvl(){
  try{
    const res = await fetch(CONFIG.context.defiLlamaTvl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const last7 = data.slice(-7);
    return {
      current: last7[last7.length - 1]?.tvl ?? null,
      series: last7.map(d => d.tvl),
      available: true
    };
  }catch(e){
    return { current: null, series: [], available: false };
  }
}

/** 3 headline terbaru, tanpa sentiment scoring (Bab 9.6 — kejujuran keterbatasan). */
export async function fetchNews(){
  try{
    const res = await fetch(CONFIG.context.newsRss2Json);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const items = (data.items || []).slice(0, 3).map(it => ({
      title: it.title,
      link: it.link,
      pubDate: it.pubDate
    }));
    return { items, available: items.length > 0 };
  }catch(e){
    return { items: [], available: false };
  }
}
