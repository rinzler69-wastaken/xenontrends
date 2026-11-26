/**
 * api/fear-greed.js — Pilar C (Sentimen). Alternative.me, gratis, unlimited.
 */
import { CONFIG } from '../config.js';

export async function fetchFearGreed(){
  const res = await fetch(CONFIG.fearGreed);
  if (!res.ok) throw new Error('Fear & Greed fetch failed: HTTP ' + res.status);
  const d = await res.json();
  const items = d.data.map(x => ({ value: +x.value, cls: x.value_classification }));
  return { today: items[0], yesterday: items[1] || null };
}
