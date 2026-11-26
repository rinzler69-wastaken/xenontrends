/* ════════════════════════════════════════════════════════════════════
   QUANTUM ENGINES v3.0 — pustaka engine kuantitatif institusional
   ════════════════════════════════════════════════════════════════════
   100% pure-function JavaScript, tanpa dependensi, tanpa DOM/network.

   Matematika yang dipakai (beserta penemunya — lihat ENGINE_REGISTRY):
   · Volatilitas : Engle (Nobel 2003) & Bollerslev — GARCH(1,1);
                   Parkinson 1980; Garman-Klass 1980; vol-of-vol;
                   Bollinger 1983; Amihud 2002; Donchian
   · Mean-rev    : Uhlenbeck & Ornstein 1930 (proses OU + half-life);
                   Dickey & Fuller 1979 (stasionaritas);
                   Hurst 1951 & Mandelbrot (R/S); Peng et al. 1994 (DFA);
                   Lo & MacKinlay 1988 (variance ratio);
                   Katz 1988 & Higuchi 1988 (dimensi fraktal);
                   Rice 1945 (level-crossing / first-passage)
   · Informasi   : Shannon 1948 (entropy); Bandt & Pompe 2002
                   (permutation entropy); Lempel & Ziv 1976 (LZ76);
                   Wiener (spectral flatness);
                   Kolmogorov 1933 / Smirnov 1948 (uji normalitas KS)
   · Momen/ekor  : Jarque & Bera 1980; Hill 1975 (tail index);
                   Zipf 1949 / Auerbach 1913 (power-law);
                   Rosenstein et al. 1993 (eksponen Lyapunov);
                   Martin 1987 (Ulcer index)
   · Sinyal      : Fourier 1822 (periodogram); Shannon (spectral entropy);
                   Haar 1910 (wavelet MRA); Hilbert 1912 / Gabor 1946
                   (analytic signal); Ehlers 2002 (Fisher transform)
   · Filter      : Kálmán 1960 (Kalman filter local-linear-trend);
                   Hodrick & Prescott 1997 (trend-cycle, Nobel-adjacent);
                   Page 1954 (CUSUM change-point);
                   Ehlers 2013 (Super Smoother);
                   Savitzky & Golay 1964 (turunan endpoint)
   · Ekonomifikasi: Einstein 1905 (difusi ⟨x²⟩=2Dt); Markov 1906 (rantai
                   transisi); Ljung & Box 1978 (uji autokorelasi);
                   Kaufman 1995 (efficiency ratio); Dreiss (choppiness);
                   Granger 1969 (proxy lagged cross-corr)
   · Portofolio  : Sharpe 1964 (CAPM β/α); Black-Jensen-Scholes (idio vol);
                   Embrechts (tail dependence); Sharpe 1966 & Sortino;
                   Treynor-Black (information ratio); Kelly 1956;
                   RiskMetrics (VaR95); Efron 1979 & Künsch 1989
                   (block bootstrap Monte Carlo); kernel density S/R
   · Jaringan    : Jacobi 1846 (eigen dekomposisi matriks korelasi);
                   Marchenko & Pastur 1967 (batas noise random matrix);
                   Kritzman et al. 2009 (absorption ratio sistemik)
   · Meta        : Bayes (ensemble invers-varian); Fisher 1934
                   (gabungan p-value); konfidensi berbobot agreement

   Semua engine puna guard NaN/Infinity/data-pendek. Setiap engine yang
   gagal menghasilkan angka valid mengembalikan null DAN TIDAK
   menularkan NaN ke engine lain maupun ke skor akhir.
   ════════════════════════════════════════════════════════════════════ */
'use strict';

const QE = (function () {

  /* ════════════════════════════════════════════════════════════════
     0. UTILITAS NUMERIK & STATISTIK DASAR
     ════════════════════════════════════════════════════════════════ */

  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function sum(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : NaN; }

  function variance(a) {
    const n = a.length; if (n < 2) return NaN;
    const m = mean(a); let s = 0;
    for (let i = 0; i < n; i++) s += (a[i] - m) * (a[i] - m);
    return s / (n - 1);
  }
  const stdev = (a) => Math.sqrt(variance(a));

  function sortedCopy(a) { const c = a.slice(); c.sort((x, y) => x - y); return c; }
  function quantile(a, q) {
    if (!a.length) return NaN;
    const s = sortedCopy(a);
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }
  const median = (a) => quantile(a, 0.5);

  function mad(a) {
    if (!a.length) return NaN;
    const m = median(a);
    return median(a.map((x) => Math.abs(x - m)));
  }

  function skewness(a) {
    const n = a.length; if (n < 8) return NaN;
    const m = mean(a), s = stdev(a); if (!(s > 0)) return NaN;
    let t = 0; for (let i = 0; i < n; i++) t += ((a[i] - m) / s) ** 3;
    return (n / ((n - 1) * (n - 2))) * t;
  }
  function excessKurtosis(a) {
    const n = a.length; if (n < 8) return NaN;
    const m = mean(a), s = stdev(a); if (!(s > 0)) return NaN;
    let t = 0; for (let i = 0; i < n; i++) t += ((a[i] - m) / s) ** 4;
    return t * n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3));
  }

  function corr(a, b) {
    const n = Math.min(a.length, b.length); if (n < 8) return NaN;
    const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
    let sab = 0, sa = 0, sb = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - ma, db = b[i] - mb;
      sab += da * db; sa += da * da; sb += db * db;
    }
    const den = Math.sqrt(sa * sb);
    return den > 0 ? sab / den : NaN;
  }

  // OLS sederhana y = a + b·x → {slope, intercept, r2, seSlope}
  function ols(x, y) {
    const n = Math.min(x.length, y.length); if (n < 4) return null;
    const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    if (!(sxx > 0)) return null;
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : NaN;
    const residVar = Math.max(0, (syy - slope * sxy) / (n - 2));
    const seSlope = Math.sqrt(residVar / sxx);
    return { slope, intercept, r2, seSlope, n };
  }

  // RNG deterministik (mulberry32) — untuk Monte Carlo yang reproducible
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ── Distribusi probabilitas ── */
  // erf via Abramowitz & Stegun 7.1.26 (kesalahan < 1.5e-7)
  function erf(x) {
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const twoSidedP = (z) => (isNum(z) ? clamp(2 * (1 - normCdf(Math.abs(z))), 1e-12, 1) : null);

  // ln Γ via Lanczos
  function lnGamma(z) {
    const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1;
    let x = 0.99999999999980993;
    for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1);
    const t = z + g.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  // P(a,x) = regularized lower incomplete gamma — series & continued fraction (Lentz)
  function gammaP(a, x) {
    if (!(x > 0)) return 0;
    if (x < a + 1) {
      let term = 1 / a, total = term, n = 1;
      while (n < 500) {
        term *= x / (a + n); total += term;
        if (Math.abs(term) < Math.abs(total) * 1e-14) break;
        n++;
      }
      return total * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }
    // continued fraction untuk Q(a,x), lalu P = 1 − Q
    const FPMIN = 1e-300;
    let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    const Q = Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
    return 1 - Q;
  }
  // CDF chi-kuadrat
  function chiSqP(x, k) {
    if (!(x > 0) || k < 1) return 0;
    return gammaP(k / 2, x / 2);
  }
  // uji KS: p-value asimtotik dengan koreksi Stephens
  function ksPValue(d, n) {
    if (!isNum(d) || n < 5) return null;
    const lambda = d * (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n));
    let s = 0;
    for (let k = 1; k <= 100; k++) s += 2 * ((k % 2 === 1) ? 1 : -1) * Math.exp(-2 * k * k * lambda * lambda);
    return clamp(1 - s, 0, 1);
  }

  /* ── Aljabar linear ── */
  // Cholesky dense (matriks kecil, SPD) — untuk filter Hodrick-Prescott
  function cholesky(A) {
    const n = A.length;
    const L = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (s <= 0) return null; // tidak SPD
          L[i][j] = Math.sqrt(s);
        } else L[i][j] = s / L[j][j];
      }
    }
    return L;
  }
  function cholSolve(L, b) {
    const n = L.length;
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
    return x;
  }

  // Eigen dekomposisi matriks simetris via rotasi siklik Jacobi (1846)
  function jacobiEigen(Ain, maxSweeps = 24) {
    const n = Ain.length;
    const A = Ain.map((r) => r.slice());
    const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      let off = 0;
      for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-12) break;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(A[p][q]) < 1e-15) continue;
          const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
          const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = A[k][p], akq = A[k][q];
            A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p][k], aqk = A[q][k];
            A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
    return {
      values: idx.map((i) => A[i][i]),                    // menurun
      vectors: idx.map((i) => V.map((row) => row[i])),    // vectors[k][eigenIdx]
    };
  }

  /* ── FFT radix-2 iteratif (Cooley-Tukey) ── */
  function fft(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = ((inverse ? 2 : -2) * Math.PI) / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        const half = len >> 1;
        for (let k = 0; k < half; k++) {
          const ar = re[i + k], ai = im[i + k];
          const xr = re[i + k + half], xi = im[i + k + half];
          const vr = xr * cr - xi * ci, vi = xr * ci + xi * cr;
          re[i + k] = ar + vr; im[i + k] = ai + vi;
          re[i + k + half] = ar - vr; im[i + k + half] = ai - vi;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

  /* ── Nelder-Mead 3-dimensi (untuk fit GARCH MLE) ── */
  function nelderMead3(f, x0, iters) {
    iters = iters || 130;
    const scale = [0.5, 0.4, 0.4];
    const pts = [
      { x: x0.slice(), f: f(x0) },
      { x: [x0[0] + scale[0], x0[1], x0[2]] },
      { x: [x0[0], x0[1] + scale[1], x0[2]] },
      { x: [x0[0], x0[1], x0[2] + scale[2]] },
    ];
    pts.forEach((p, i) => { if (i > 0) p.f = f(p.x); });
    const sortPts = () => pts.sort((a, b) => a.f - b.f);
    sortPts();
    for (let it = 0; it < iters; it++) {
      sortPts();
      if (Math.abs(pts[3].f - pts[0].f) < 1e-10) break;
      const cen = [0, 0, 0];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cen[j] += pts[i].x[j] / 3;
      const xr = cen.map((c, j) => c + (c - pts[3].x[j]));
      const fr = f(xr);
      if (fr < pts[0].f) {
        const xe = cen.map((c, j) => c + 2 * (c - pts[3].x[j]));
        const fe = f(xe);
        if (fe < fr) { pts[3] = { x: xe, f: fe }; } else { pts[3] = { x: xr, f: fr }; }
      } else if (fr < pts[2].f) {
        pts[3] = { x: xr, f: fr };
      } else {
        const xc = cen.map((c, j) => c + 0.5 * (pts[3].x[j] - c));
        const fc = f(xc);
        if (fc < pts[3].f) { pts[3] = { x: xc, f: fc }; }
        else {
          for (let i = 1; i < 4; i++) {
            const x = pts[i].x.map((v, j) => pts[0].x[j] + 0.5 * (v - pts[0].x[j]));
            pts[i] = { x, f: f(x) };
          }
        }
      }
    }
    sortPts();
    return { x: pts[0].x, f: pts[0].f };
  }

  /* ════════════════════════════════════════════════════════════════
     1. ENGINE PER-KOIN — FAMILI A: VOLATILITAS & REGIME
     ════════════════════════════════════════════════════════════════ */

  // A2. Realized volatility term structure 24/72/168 jam (close-to-close)
  function engRVTerm(logret) {
    if (logret.length < 40) return null;
    const sdOf = (arr) => (arr.length > 4 ? stdev(arr) * 100 : NaN); // %/jam
    return {
      rv24: sdOf(logret.slice(-24)),
      rv72: sdOf(logret.slice(-72)),
      rv168: sdOf(logret),
    };
  }

  // A3. GARCH(1,1) — Engle (Nobel 2003) & Bollerslev 1986.
  //     σ²ₜ = ω + α·ε²ₜ₋₁ + β·σ²ₜ₋₁ — di-fit via maximum likelihood
  //     Gaussian quasi-likelihood + Nelder-Mead, parameterisasi
  //     long-run-variance agar constraint α,β ≥ 0; α+β < 1 selalu terpenuhi.
  function engGarch(logret) {
    const n = logret.length;
    if (n < 48) return null;
    const mu = mean(logret);
    const e = logret.map((r) => r - mu);
    const s2 = variance(e);
    if (!(s2 > 0)) return null;

    const unpack = (p) => {
      const sr = s2 * Math.exp(p[0]);
      const ea = Math.exp(p[1]), eb = Math.exp(p[2]);
      const den = 1 + ea + eb;
      const alpha = ea / den, beta = eb / den;
      const omega = sr * (1 - alpha - beta);
      return { sr, alpha, beta, omega };
    };
    const nll = (p) => {
      const g = unpack(p);
      if (!(g.omega > 0) || g.alpha < 1e-5) return 1e12;
      let s2t = g.omega / (1 - g.alpha - g.beta);
      let ll = 0;
      for (let i = 0; i < n; i++) {
        ll += Math.log(s2t) + (e[i] * e[i]) / s2t;
        s2t = g.omega + g.alpha * e[i] * e[i] + g.beta * s2t;
        if (!isNum(s2t) || s2t <= 0) return 1e12;
      }
      return 0.5 * ll;
    };
    const best = nelderMead3(nll, [0, Math.log(0.08), Math.log(0.87)], 130);
    const g = unpack(best.x);
    if (!isNum(g.omega) || g.omega <= 0) return null;

    // rekursi terakhir untuk prediksi σ² periode berikutnya
    let s2t = g.omega / (1 - g.alpha - g.beta);
    for (let i = 0; i < n; i++) s2t = g.omega + g.alpha * e[i] * e[i] + g.beta * s2t;
    if (!isNum(s2t) || s2t <= 0) return null;

    const longRunPct = Math.sqrt(g.sr) * 100;       // %/jam
    const nextPct = Math.sqrt(s2t) * 100;           // %/jam
    const ratio = nextPct / Math.max(1e-9, longRunPct);
    return {
      omega: g.omega, alpha: g.alpha, beta: g.beta,
      persist: g.alpha + g.beta,
      longRunPct, nextPct, ratio,
      annPct: Math.sqrt(g.sr) * 100 * Math.sqrt(8760), // annualized (24/7)
      regime: ratio > 1.25 ? 'EXPANDING' : ratio < 0.8 ? 'COMPRESSING' : 'STABLE',
    };
  }

  // A4. Parkinson 1980 — volatilitas berbasis range intra-blok (4 jam dari harga jam-an).
  //     Catatan: OHLC direkonstruksi dari 4 close jam-an sehingga range intra-jam
  //     terlewatkan (sub-sampling). Faktor koreksi 1.46 = kalibrasi Monte Carlo
  //     pada Brownian motion (E[range 4-titik]/E[range kontinu] ≈ 0.685).
  function engParkinson(prices) {
    const B = 4;
    const nb = Math.floor(prices.length / B);
    if (nb < 6) return null;
    let acc = 0, cnt = 0;
    for (let b = 0; b < nb; b++) {
      const seg = prices.slice(b * B, (b + 1) * B);
      const hi = Math.max(...seg), lo = Math.min(...seg);
      if (lo > 0 && hi > lo) { acc += Math.log(hi / lo) ** 2; cnt++; }
    }
    if (cnt < 6) return null;
    const v = acc / (cnt * 4 * Math.LN2); // per blok 4 jam
    const sd = (Math.sqrt(v) / 2) * 1.46; // skala ke per-jam + koreksi sub-sampling
    if (!isNum(sd)) return null;
    return { pctPerHour: sd * 100, annPct: sd * 100 * Math.sqrt(8760) };
  }

  // A5. Garman-Klass 1980 — OHLC estimator pada blok 4 jam
  //     (koreksi sub-sampling 1.79, dikalibrasi sama dengan Parkinson)
  function engGarmanKlass(prices) {
    const B = 4;
    const nb = Math.floor(prices.length / B);
    if (nb < 6) return null;
    let acc = 0, cnt = 0;
    for (let b = 0; b < nb; b++) {
      const seg = prices.slice(b * B, (b + 1) * B);
      const o = seg[0], c = seg[seg.length - 1];
      const hi = Math.max(...seg), lo = Math.min(...seg);
      if (lo > 0) {
        const hml = Math.log(hi / lo) ** 2;
        const cpo = Math.log(c / o) ** 2;
        acc += 0.5 * hml - (2 * Math.LN2 - 1) * cpo;
        cnt++;
      }
    }
    if (cnt < 6) return null;
    const v = Math.max(acc, 0) / cnt;
    const sd = (Math.sqrt(v) / 2) * 1.79; // per jam + koreksi
    if (!isNum(sd)) return null;
    return { pctPerHour: sd * 100, annPct: sd * 100 * Math.sqrt(8760) };
  }

  // A6. Vol-of-vol — koefisien variasi dari rolling volatility
  function engVolOfVol(logret) {
    if (logret.length < 48) return null;
    const rv = [];
    for (let i = 12; i <= logret.length; i++) {
      const w = logret.slice(Math.max(0, i - 12), i);
      if (w.length >= 8) rv.push(stdev(w));
    }
    if (rv.length < 6) return null;
    const m = mean(rv), s = stdev(rv);
    if (!(m > 0)) return null;
    return { cov: s / m, regime: s / m > 0.8 ? 'TIDAK-STABIL' : s / m > 0.5 ? 'MODERAT' : 'STABIL' };
  }

  // A7. Bollinger bandwidth & %B (window 20 jam) — squeeze dideteksi
  //     secara cross-sectional nanti (persentil bandwidth populasi).
  function engBollinger(prices) {
    const W = 20;
    if (prices.length < W + 4) return null;
    const win = prices.slice(-W);
    const m = mean(win), s = stdev(win);
    if (!(m > 0) || !(s > 0)) return null;
    const last = prices[prices.length - 1];
    const bw = (4 * s) / m * 100;                        // bandwidth %
    const pctB = (last - (m - 2 * s)) / (4 * s);         // posisi 0..1
    return { bwPct: bw, pctB, mid: m, sd: s };
  }

  // A8. Donchian position — posisi harga dalam range 7 hari (0=bottom,1=top)
  function engDonchian(prices) {
    if (prices.length < 24) return null;
    const hi = Math.max(...prices), lo = Math.min(...prices);
    if (!(hi > lo)) return null;
    const pos = (prices[prices.length - 1] - lo) / (hi - lo);
    return { pos, hi, lo };
  }

  // A9. Amihud 2002 — ilikuiditas |r| per juta dollar volume
  function engAmihud(logret, volumeUsd24h) {
    if (!(volumeUsd24h > 0) || logret.length < 24) return null;
    const dollarPerHour = volumeUsd24h / 24;
    const mr = mean(logret.map(Math.abs));
    const illiq = (mr * 100) / (dollarPerHour / 1e6); // %per-jam per $1jt
    return { illiq };
  }

  /* ════════════════════════════════════════════════════════════════
     FAMILI B: MEAN REVERSION & FRAKTAL
     ════════════════════════════════════════════════════════════════ */

  // B1+B2. Ornstein-Uhlenbeck 1930 + Dickey-Fuller 1979.
  //   dX = θ(μ−X)dt + σdW  ⇔  AR(1) diskret Xₜ = c + φXₜ₋₁ + ε
  //   θ = −ln(φ)/Δt, half-life = ln2/θ. t-stat DF = (φ−1)/SE(φ).
  function engOU(logp) {
    const n = logp.length;
    if (n < 40) return null;
    const y = logp.slice(1), x = logp.slice(0, -1);
    const fit = ols(x, y);
    if (!fit || !isNum(fit.seSlope) || fit.seSlope <= 0) return null;
    const phi = fit.slope;
    const tStat = (phi - 1) / fit.seSlope;
    let theta = null, halfLife = null;
    if (phi > 0.05 && phi < 1) {
      theta = -Math.log(phi);             // per jam (Δt = 1 jam)
      halfLife = Math.LN2 / theta;        // jam
    }
    const muLevel = fit.intercept / Math.max(1e-9, 1 - phi);
    const residSd = stdev(y.map((v, i) => v - (fit.intercept + phi * x[i])));
    const devZ = residSd > 0 ? (logp[n - 1] - muLevel) / residSd : null;
    const stationary = tStat < -2.88; // kritis ±5% untuk n≈150
    return { phi, theta, halfLife, tStat, muLevel, devZ, stationary, r2: fit.r2 };
  }

  // B3. Hurst via R/S analysis (Hurst 1951, Mandelbrot & Wallis 1968)
  function engHurstRS(logret) {
    const scales = [];
    for (let s = 8; s <= 64; s <<= 1) if (logret.length >= s * 2) scales.push(s);
    if (scales.length < 3) return null;
    const xs = [], ys = [];
    for (const s of scales) {
      const nb = Math.floor(logret.length / s);
      let acc = 0, cnt = 0;
      for (let b = 0; b < nb; b++) {
        const seg = logret.slice(b * s, (b + 1) * s);
        const m = mean(seg), sd = stdev(seg);
        if (!(sd > 0)) continue;
        let cum = 0, rmax = -Infinity, rmin = Infinity;
        for (const v of seg) {
          cum += v - m;
          if (cum > rmax) rmax = cum;
          if (cum < rmin) rmin = cum;
        }
        acc += (rmax - rmin) / sd; cnt++;
      }
      if (cnt > 0) { xs.push(Math.log(s)); ys.push(Math.log(acc / cnt)); }
    }
    if (xs.length < 3) return null;
    const fit = ols(xs, ys);
    return fit && isNum(fit.slope) ? { H: fit.slope } : null;
  }

  // B4. Hurst via DFA — Peng et al. 1994 (fisika medis, detrended fluctuation analysis)
  function engDFA(logret) {
    const m = mean(logret);
    let cum = 0;
    const Y = logret.map((r) => (cum += r - m)); // profil terintegrasi
    const scales = [8, 16, 24, 32, 48, 64].filter((s) => Y.length >= s * 2);
    if (scales.length < 3) return null;
    const xs = [], ys = [];
    for (const s of scales) {
      const nb = Math.floor(Y.length / s);
      const fs = [];
      for (let b = 0; b < nb; b++) {
        const seg = Y.slice(b * s, (b + 1) * s);
        const t = seg.map((_, i) => [i, seg[i]]);
        const fit = ols(t.map((p) => p[0]), t.map((p) => p[1]));
        if (!fit) continue;
        let rss = 0;
        for (let i = 0; i < seg.length; i++) {
          const res = seg[i] - (fit.intercept + fit.slope * i);
          rss += res * res;
        }
        fs.push(rss / s);
      }
      if (fs.length) {
        xs.push(Math.log(s));
        ys.push(Math.log(Math.sqrt(mean(fs))));
      }
    }
    if (xs.length < 3) return null;
    const fit = ols(xs, ys);
    return fit && isNum(fit.slope) ? { H: fit.slope } : null;
  }

  // B5. Lo-MacKinlay 1988 variance ratio test — VR(q) dan z asimtotik N(0,1)
  function engVarianceRatio(logret) {
    const n = logret.length;
    if (n < 48) return null;
    const m = mean(logret);
    let s1 = 0;
    for (let i = 0; i < n; i++) s1 += (logret[i] - m) ** 2;
    const var1 = s1 / (n - 1);
    if (!(var1 > 0)) return null;
    const out = {};
    for (const q of [2, 4, 8]) {
      const s = Math.max(2, n - q + 1);
      let sq = 0;
      for (let t = q; t <= n; t++) {
        let acc = 0;
        for (let j = 0; j < q; j++) acc += logret[t - 1 - j] - m;
        sq += acc * acc;
      }
      sq = sq / s / q;
      const vr = sq / var1;
      const denom = Math.sqrt((2 * (2 * q - 1) * (q - 1)) / (3 * q * n));
      out['vr' + q] = vr;
      out['z' + q] = denom > 0 ? (vr - 1) / denom : null;
    }
    out.vr4 = out.vr4; // utama dipakai di UI
    return out;
  }

  // B6. Katz 1988 fractal dimension — kekasaran lintasan harga
  function engKatzFD(prices) {
    const n = prices.length;
    if (n < 24) return null;
    const hi = Math.max(...prices), lo = Math.min(...prices);
    if (!(hi > lo)) return null;
    const scale = (n - 1) / (hi - lo); // normalisasi aspek
    let L = 0;
    for (let i = 1; i < n; i++) {
      const dx = 1, dy = (prices[i] - prices[i - 1]) * scale;
      L += Math.sqrt(dx * dx + dy * dy);
    }
    const dxn = n - 1, dyn = (prices[n - 1] - prices[0]) * scale;
    const d = Math.sqrt(dxn * dxn + dyn * dyn);
    if (!(L > 0) || !(d > 0)) return null;
    const fd = Math.log10(n) / (Math.log10(n) + Math.log10(d / L));
    return isNum(fd) ? { fd } : null;
  }

  // B7. Higuchi 1988 fractal dimension
  function engHiguchiFD(series) {
    const N = series.length;
    if (N < 32) return null;
    const Ls = [];
    const ks = [];
    for (let k = 2; k <= 8; k++) {
      const lm = [];
      for (let m = 0; m < k; m++) {
        const nMax = Math.floor((N - m - 1) / k);
        if (nMax < 3) continue;
        let acc = 0;
        for (let i = 1; i <= nMax; i++) acc += Math.abs(series[m + i * k] - series[m + (i - 1) * k]);
        lm.push((acc * (N - 1)) / (nMax * k));
      }
      if (lm.length >= Math.max(2, k / 2)) { Ls.push(mean(lm)); ks.push(k); }
    }
    if (ks.length < 4) return null;
    // FD = −slope dari ln L(k) terhadap ln k (L ∝ k^(−FD) untuk seri fraktal)
    const fit2 = ols(ks.map((k) => Math.log(k)), Ls.map((l) => Math.log(Math.max(l, 1e-12))));
    return fit2 && isNum(fit2.slope) ? { fd: -fit2.slope } : null;
  }

  // B8. Level-crossing rate (Rice 1945) — frekuensi silang median vs
  //     ekspektasi iid (≈ (n−1)/2). Sedikit silang = persisten/momentum.
  function engCrossingRate(prices) {
    const n = prices.length;
    if (n < 40) return null;
    const m = median(prices);
    let above = prices[0] > m, cross = 0;
    for (let i = 1; i < n; i++) {
      const a = prices[i] > m;
      if (a !== above) { cross++; above = a; }
    }
    const expected = (n - 1) / 2;
    if (!(expected > 0)) return null;
    return { ratio: cross / expected, crosses: cross };
  }

  /* ════════════════════════════════════════════════════════════════
     FAMILI C: TEORI INFORMASI
     ════════════════════════════════════════════════════════════════ */

  // C1. Shannon 1948 — entropy distribusi return (10 bin lebar sama ±4σ)
  function engShannon(logret) {
    const n = logret.length;
    if (n < 40) return null;
    const s = stdev(logret);
    if (!(s > 0)) return null;
    const NB = 10, lo = -4 * s, hi = 4 * s, w = (hi - lo) / NB;
    const counts = new Array(NB).fill(0);
    for (const r of logret) {
      let b = Math.floor((r - lo) / w);
      if (b < 0) b = 0; if (b >= NB) b = NB - 1;
      counts[b]++;
    }
    let H = 0;
    for (const c of counts) if (c > 0) { const p = c / n; H -= p * Math.log(p); }
    return { H, norm: H / Math.log(NB) };
  }

  // C2. Permutation entropy — Bandt & Pompe 2002 (embedding m=4)
  function engPermEntropy(logret) {
    const m = 4;
    const n = logret.length;
    if (n < m + 10) return null;
    const counts = new Map();
    for (let i = 0; i <= n - m; i++) {
      const idx = [0, 1, 2, 3].sort((a, b) => logret[i + a] - logret[i + b]);
      const key = idx.join('');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const total = n - m + 1;
    let H = 0;
    counts.forEach((c) => { const p = c / total; H -= p * Math.log(p); });
    return { H, norm: H / Math.log(24) }; // 4! pola
  }

  // C3. Lempel-Ziv 1976 — kompleksitas pemarsingan kosakata barisan tanda return
  function engLZ(logret) {
    const n = logret.length;
    if (n < 40) return null;
    let s = '';
    for (let i = 0; i < n; i++) s += logret[i] >= 0 ? '1' : '0';
    let c = 1, p = 1;
    while (p < n) {
      let l = 1;
      while (p + l <= n && s.substring(0, p).includes(s.substring(p, p + l))) l++;
      c++;
      p += Math.max(1, l - 1);
    }
    const norm = (c * Math.log2(n)) / n; // acak ≈ 1, periodik ≪ 1
    return { c, norm };
  }

  // C5. Kolmogorov-Smirnov — jarak distribusi return ke Gaussian fitted
  function engKSNormal(logret) {
    const n = logret.length;
    if (n < 40) return null;
    const s = sortedCopy(logret);
    const m = mean(s), sd = stdev(s);
    if (!(sd > 0)) return null;
    let D = 0;
    for (let i = 0; i < n; i++) {
      const F = normCdf((s[i] - m) / sd);
      D = Math.max(D, Math.abs(F - (i + 1) / n), Math.abs(F - i / n));
    }
    return { D, p: ksPValue(D, n) };
  }

  /* ════════════════════════════════════════════════════════════════
     FAMILI D: MOMEN TINGGI & EKOR
     ════════════════════════════════════════════════════════════════ */

  // D1. Skew, excess kurtosis, Jarque-Bera 1980
  function engMomentsJB(logret) {
    const n = logret.length;
    if (n < 30) return null;
    const S = skewness(logret), K = excessKurtosis(logret);
    if (!isNum(S) || !isNum(K)) return null;
    const jb = (n / 6) * (S * S + (K * K) / 4);
    return { skew: S, exKurt: K, jb, jbP: 1 - chiSqP(jb, 2) };
  }

  // D2. Hill 1975 tail index pada |return| terurut (k = 20% teratas)
  function engHill(logret) {
    const n = logret.length;
    if (n < 50) return null;
    const abs = sortedCopy(logret.map(Math.abs)).reverse();
    const k = Math.max(10, Math.floor(n * 0.2));
    const u = abs[k - 1];
    if (!(u > 0)) return null;
    let acc = 0;
    for (let i = 0; i < k; i++) acc += Math.log(abs[i] / u);
    if (!(acc > 0)) return null;
    return { alpha: k / acc, k };
  }

  // D3. Zipf/Auerbach power-law slope pada |return| vs rank (log-log)
  function engZipf(logret) {
    const n = logret.length;
    if (n < 40) return null;
    const abs = sortedCopy(logret.map(Math.abs)).reverse().filter((v) => v > 0);
    if (abs.length < 20) return null;
    const xs = abs.map((_, i) => Math.log(i + 1));
    const ys = abs.map((v) => Math.log(v));
    const fit = ols(xs, ys);
    return fit ? { slope: -fit.slope, r2: fit.r2 } : null;
  }

  // D4. Rosenstein et al. 1993 — largest Lyapunov exponent (chaos detection)
  function engLyapunov(logret) {
    const n = logret.length;
    if (n < 60) return null;
    const s = stdev(logret);
    if (!(s > 0)) return null;
    const x = logret.map((r) => r / s);
    // embedding m=3 (delay-1) pada return ternormalisasi
    const m = 3, W = 6, DTMAX = 20;
    const dist2 = (i, j) => {
      let d = 0;
      for (let k = 0; k < m; k++) { const t = x[i + k] - x[j + k]; d += t * t; }
      return d;
    };
    const pairs = [];
    for (let i = 0; i <= n - m - DTMAX; i++) {
      let bj = -1, bd = Infinity;
      for (let j = 0; j <= n - m - DTMAX; j++) {
        if (Math.abs(i - j) < W) continue;
        const d = dist2(i, j);
        if (d < bd && d > 1e-12) { bd = d; bj = j; }
      }
      if (bj >= 0) pairs.push([i, bj, bd]);
    }
    if (pairs.length < 20) return null;
    const means = [];
    for (let dt = 1; dt <= DTMAX; dt++) {
      let acc = 0, cnt = 0;
      for (const [i, j] of pairs) {
        const d = Math.sqrt(Math.max(dist2(i + dt, j + dt), 1e-12));
        acc += Math.log(d); cnt++;
      }
      if (cnt) means.push([dt, acc / cnt]);
    }
    const half = Math.max(3, Math.floor(means.length / 2));
    const fit = ols(means.slice(0, half).map((p) => p[0]), means.slice(0, half).map((p) => p[1]));
    return fit && isNum(fit.slope) ? { lambda: fit.slope } : null; // per jam
  }

  // D5. Drawdown & Ulcer Index (Martin 1987)
  function engDrawdown(prices) {
    const n = prices.length;
    if (n < 24) return null;
    let peak = prices[0], maxDD = 0, ddSq = 0, peakIdx = 0, maxDDIdx = 0;
    for (let i = 0; i < n; i++) {
      if (prices[i] > peak) { peak = prices[i]; peakIdx = i; }
      const dd = prices[i] / peak - 1;
      if (dd < maxDD) { maxDD = dd; maxDDIdx = i; }
      ddSq += dd * dd;
    }
    const curDD = prices[n - 1] / peak - 1;
    return {
      maxDDPct: maxDD * 100,
      ulcer: Math.sqrt(ddSq / n) * 100,
      curDDPct: curDD * 100,
      hoursSincePeak: n - 1 - peakIdx,
      lenMaxDD: maxDDIdx - peakIdx,
    };
  }

  /* ════════════════════════════════════════════════════════════════
     FAMILI E: SIGNAL PROCESSING
     ════════════════════════════════════════════════════════════════ */

  // E1+E2. Periodogram FFT — siklus dominan + spectral entropy
  function engPeriodogram(logret) {
    const n = logret.length;
    if (n < 40) return null;
    const N = nextPow2(n);
    const re = new Float64Array(N), im = new Float64Array(N);
    const m = mean(logret);
    for (let i = 0; i < n; i++) re[i] = logret[i] - m; // zero-pad
    fft(re, im, false);
    const half = N >> 1;
    const P = [];
    for (let k = 1; k <= half; k++) P.push(re[k] * re[k] + im[k] * im[k]);
    const total = sum(P);
    if (!(total > 0)) return null;
    // siklus dominan: abaikan 2 bin pertama (tren jangka-panjang),
    // lalu perhalus lokasi puncak dengan interpolasi parabolik
    // (standar praktik analisis spektrum — mengurangi error kisi FFT)
    let bi = -1, bv = 0;
    for (let k = 2; k < P.length; k++) if (P[k] > bv) { bv = P[k]; bi = k; }
    let domPeriod = null;
    if (bi > 0) {
      let binRefined = bi;
      if (bi - 1 >= 0 && bi + 1 < P.length) {
        const lm = Math.log(Math.max(P[bi - 1], 1e-300));
        const lc = Math.log(Math.max(P[bi], 1e-300));
        const lr = Math.log(Math.max(P[bi + 1], 1e-300));
        const den = lm - 2 * lc + lr;
        if (den < 0) binRefined = bi + clamp((0.5 * (lm - lr)) / den, -0.5, 0.5);
      }
      domPeriod = N / binRefined;
    }
    const share = bv / total;
    // spectral entropy
    let H = 0;
    for (const p of P) if (p > 0) { const q = p / total; H -= q * Math.log(q); }
    const specEnt = H / Math.log(P.length);
    return { domPeriod, share, specEnt };
  }

  // E3. Haar 1910 — dekomposisi multi-resolusi harga
  function engHaar(prices) {
    let a = prices.slice();
    const scales = [];
    let scale = 2;
    while (a.length >= 2 && scales.length < 5) {
      const d = [], next = [];
      for (let i = 0; i + 1 < a.length; i += 2) {
        d.push((a[i + 1] - a[i]) / Math.SQRT2);
        next.push((a[i + 1] + a[i]) / Math.SQRT2);
      }
      scales.push({ scale, d, a: next });
      a = next; scale <<= 1;
    }
    if (!scales.length) return null;
    let totalE = 0;
    const Es = [];
    for (const s of scales) {
      let e = 0;
      for (const v of s.d) e += v * v;
      Es.push(e); totalE += e;
    }
    if (!(totalE > 0)) return null;
    const energies = Es.map((e) => e / totalE);
    let domIdx = 0;
    for (let i = 1; i < energies.length; i++) if (energies[i] > energies[domIdx]) domIdx = i;
    // arah tren pada skala dominan: jumlah koefisien detail seperempat TERAKHIR
    const dd = scales[domIdx].d;
    const q = dd.slice(-Math.max(2, Math.floor(dd.length / 4)));
    const dirRecent = sum(q);
    // arah tren level terbesar (approksimasi): slope endpoint
    const na = a.length;
    const trendSlope = na >= 4 ? (a[na - 1] - a[Math.floor(na / 2)]) / Math.max(1, na - 1 - Math.floor(na / 2)) : 0;
    return {
      energies,
      domScale: scales[domIdx].scale,
      domDir: Math.sign(dirRecent) || 0,
      trendSlopePct: trendSlope * 100,
    };
  }

  // E4. Hilbert 1912 / Gabor 1946 — analytic signal via FIR Hilbert transformer
  function engHilbert(prices) {
    const n = prices.length;
    if (n < 60) return null;
    const m = mean(prices);
    const x = prices.map((p) => p - m);
    // kernel Hilbert windowed (panjang 33)
    const M = 16, h = new Float64Array(2 * M + 1);
    for (let k = -M; k <= M; k++) {
      if (k === 0) h[M] = 0;
      else h[M + k] = (2 / (Math.PI * k)) * (0.54 + 0.46 * Math.cos((Math.PI * k) / M));
    }
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let k = -M; k <= M; k++) {
        const j = i + k;
        if (j >= 0 && j < n) acc += h[M + k] * x[j];
      }
      y[i] = acc;
    }
    // fase & amplitudo instanan (region tengah, hindari tepi FIR)
    const phases = [], amps = [];
    for (let i = M; i < n; i++) {
      phases.push(Math.atan2(y[i], x[i]));
      amps.push(Math.hypot(x[i], y[i]));
    }
    if (phases.length < 20) return null;
    // unwrap Δfase
    const dPhis = [];
    for (let i = 1; i < phases.length; i++) {
      let d = phases[i] - phases[i - 1];
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) > 0.02) dPhis.push(d);
    }
    if (dPhis.length < 8) return null;
    const period = (2 * Math.PI) / Math.abs(median(dPhis));
    const lastPhase = phases[phases.length - 1];
    const cycPos = Math.sin(lastPhase); // −1..1 posisi dalam siklus
    const ampPct = (median(amps) / Math.max(1e-9, Math.abs(prices[prices.length - 1]))) * 100;
    return { period, cycPos, ampPct };
  }

  // E5. Fisher Transform — Ehlers 2002 (y = ½·ln((1+x)/(1−x)), diiterasi)
  function engFisherTransform(prices) {
    const L = 35;
    if (prices.length < L + 5) return null;
    const hist = prices.slice(-(L + 5));
    let prevV = 0, prevF = 0, fisher = null;
    for (let i = 0; i < hist.length; i++) {
      const w = hist.slice(Math.max(0, i - L + 1), i + 1);
      const h2 = Math.max(...w), l2 = Math.min(...w);
      if (!(h2 > l2)) continue;
      const x = clamp(2 * ((hist[i] - l2) / (h2 - l2)) - 1, -0.999, 0.999);
      const v = 0.6667 * x + 0.3334 * prevV;
      fisher = 0.5 * Math.log((1 + v) / Math.max(1e-9, 1 - v)) + 0.5 * prevF;
      prevV = v; prevF = fisher;
    }
    if (!isNum(fisher)) return null;
    return { fisher, extreme: Math.abs(fisher) > 1.8, level: clamp(fisher, -3, 3) };
  }

  /* ════════════════════════════════════════════════════════════════
     FAMILI F: STATE-SPACE & FILTER
     ════════════════════════════════════════════════════════════════ */

  // F1. Kalman 1960 — local linear trend (state: level + slope per jam)
  function engKalman(prices) {
    const n = prices.length;
    if (n < 24) return null;
    const x = prices.map((p) => Math.log(p));
    const d = [];
    for (let i = 1; i < n; i++) d.push(x[i] - x[i - 1]);
    const sd = stdev(d);
    if (!(sd > 0)) return null;
    const R = sd * sd * 0.5;      // variance pengukuran
    const q = sd * sd * 0.03;     // variance proses (akselerasi)
    const Q00 = q / 3, Q01 = q / 2, Q11 = q;
    let l = x[0], v = d[0] || 0;
    let p00 = R, p01 = 0, p11 = q * 4;
    let innovLast = 0, Slast = 1, innovCusum = 0;
    for (let i = 1; i < n; i++) {
      // predict
      l += v;
      p00 = p00 + 2 * p01 + p11 + Q00;
      p01 = p01 + p11 + Q01;
      p11 = p11 + Q11;
      // update
      const S = p00 + R;
      const y = x[i] - l;
      const k0 = p00 / S, k1 = p01 / S;
      l += k0 * y; v += k1 * y;
      const t00 = (1 - k0) * p00, t01 = (1 - k0) * p01;
      p11 = Math.max(p11 - k1 * p01, 1e-18);
      p00 = t00; p01 = t01;
      innovLast = y / Math.sqrt(Math.max(S, 1e-18));
      Slast = S;
      innovCusum += innovLast;
    }
    const snr = Math.abs(v) / Math.sqrt(p11);
    return { slopePct: v * 100, snr, innovZ: innovLast, innovCusum, fitVar: Slast };
  }

  // F2. Hodrick-Prescott 1997 — pemisah trend/siklus (λ dioptimasi utk data jam-an)
  function makeHPFactor(n, lambda) {
    // A = I + λ·KᵀK, K = operator second-difference (n−2)×n
    const A = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) A[i][i] += 1;
    for (let i = 0; i < n; i++) {
      let diag = 6;
      if (i === 0 || i === n - 1) diag = 1;
      else if (i === 1 || i === n - 2) diag = 5;
      A[i][i] += lambda * diag;
    }
    for (let i = 0; i < n - 1; i++) {
      let off = -4;
      if (i === 0 || i === n - 2) off = -2;
      A[i][i + 1] += lambda * off; A[i + 1][i] += lambda * off;
    }
    for (let i = 0; i < n - 2; i++) { A[i][i + 2] += lambda; A[i + 2][i] += lambda; }
    return cholesky(A);
  }
  const HP_LAMBDA = 16e6; // ~tren mulus skala 1-2 hari pada data jam-an
  function engHP(logp, hpFac) {
    const n = logp.length;
    if (n < 24) return null;
    if (!hpFac) return null;
    const trend = cholSolve(hpFac, Float64Array.from(logp));
    if (!trend) return null;
    const cycle = logp.map((v, i) => v - trend[i]);
    const cs = stdev(cycle);
    const cycleZ = cs > 0 ? cycle[n - 1] / cs : null;
    const half = Math.floor(n / 2);
    const trendSlope = (trend[n - 1] - trend[half]) / Math.max(1, n - 1 - half);
    return { cycleZ, trendSlopePct: trendSlope * 100, cycle: cycle.map((v) => v * 100) };
  }

  // F3. CUSUM — Page 1954 deteksi perubahan drift
  function engCusum(logret) {
    const n = logret.length;
    if (n < 30) return null;
    const mu = mean(logret), sd = stdev(logret);
    if (!(sd > 0)) return null;
    const k = 0.5 * sd, h = 5 * sd;
    let sUp = 0, sDn = 0, lastBreak = -1, lastDir = 0, alarms = 0;
    for (let i = 0; i < n; i++) {
      const r = logret[i] - mu;
      sUp = Math.max(0, sUp + r - k);
      sDn = Math.min(0, sDn + r + k);
      if (sUp > h) { lastBreak = i; lastDir = 1; alarms++; sUp = 0; }
      if (sDn < -h) { lastBreak = i; lastDir = -1; alarms++; sDn = 0; }
    }
    let postDrift = null;
    if (lastBreak >= 0 && n - lastBreak >= 6) postDrift = mean(logret.slice(lastBreak)) * 100;
    return { alarms, lastBreak, lastDir, hoursSince: lastBreak >= 0 ? n - 1 - lastBreak : null, postDriftPct: postDrift };
  }

  // F4. Ehlers Super Smoother (2013) — filter dua-kutub teredam kritis
  function engSuperSmoother(prices) {
    const n = prices.length;
    if (n < 24) return null;
    const period = 20;
    const a1 = Math.exp((-1.414 * Math.PI) / period);
    const b1 = 2 * a1 * Math.cos((1.414 * Math.PI) / period);
    const c2 = b1, c3 = -a1 * a1, c1 = 1 - c2 - c3;
    let f1 = prices[0], f2 = prices[0];
    const out = [f1];
    for (let i = 1; i < n; i++) {
      const f = c1 * ((prices[i] + prices[i - 1]) / 2) + c2 * f1 + c3 * f2;
      f2 = f1; f1 = f; out.push(f);
    }
    const W = 6;
    const slope = (out[n - 1] - out[n - 1 - W]) / W / Math.max(1e-9, out[n - 1]) * 100;
    return { slopePctPerHour: slope, dir: Math.sign(slope) || 0, smooth: out };
  }

  // F5. Savitzky-Golay 1964 — turunan endpoint via fit kuadratik lokal (11 titik)
  function engSGDerivative(prices) {
    const K = 11;
    const n = prices.length;
    if (n < K + 2) return null;
    const xs = [], ys = [];
    for (let i = n - K; i < n; i++) { xs.push(i - (n - K)); ys.push(Math.log(prices[i])); }
    // fit kuadratik y = b0 + b1·t + b2·t² (normal equations 3×3)
    let s0 = K, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    for (let i = 0; i < K; i++) {
      const t = xs[i], y = ys[i];
      s1 += t; s2 += t * t; s3 += t ** 3; s4 += t ** 4;
      t0 += y; t1 += t * y; t2 += t * t * y;
    }
    const M = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]];
    const rhs = [t0, t1, t2];
    // eliminasi Gauss 3×3
    for (let col = 0; col < 3; col++) {
      let piv = col;
      for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null;
      [M[col], M[piv]] = [M[piv], M[col]];
      [rhs[col], rhs[piv]] = [rhs[piv], rhs[col]];
      for (let r = col + 1; r < 3; r++) {
        const f = M[r][col] / M[col][col];
        for (let c = col; c < 3; c++) M[r][c] -= f * M[col][c];
        rhs[r] -= f * rhs[col];
      }
    }
    const b = new Array(3);
    for (let r = 2; r >= 0; r--) {
      let s = rhs[r];
      for (let c = r + 1; c < 3; c++) s -= M[r][c] * b[c];
      b[r] = s / M[r][r];
    }
    const tEnd = K - 1;
    const dPct = (b[1] + 2 * b[2] * tEnd) * 100;
    return { derivPctPerHour: dPct, accelPct: 2 * b[2] * 100 };
  }

  /* ════════════════════════════════════════════════════════════════
     FAMILI G: EKONOFISIKA & MEMORY
     ════════════════════════════════════════════════════════════════ */

  // G1. Einstein 1905 — difusi: ⟨x²⟩ ∝ τ^β; β=1 Brownian, >1 super-difusi (momentum),
  //     <1 sub-difusi (trapping/mean-reversion). D = MSD(1)/2.
  function engDiffusion(logp) {
    const n = logp.length;
    if (n < 60) return null;
    const lags = [2, 4, 8, 16, 24, 48];
    const xs = [], ys = [];
    for (const tau of lags) {
      let acc = 0, cnt = 0;
      for (let t = tau; t < n; t++) { const dx = logp[t] - logp[t - tau]; acc += dx * dx; cnt++; }
      if (cnt > 4 && acc > 0) { xs.push(Math.log(tau)); ys.push(Math.log(acc / cnt)); }
    }
    if (xs.length < 4) return null;
    const fit = ols(xs, ys);
    if (!fit || !isNum(fit.slope)) return null;
    return { beta: fit.slope, verdict: fit.slope > 1.12 ? 'SUPER-DIFUSI' : fit.slope < 0.88 ? 'SUB-DIFUSI' : 'BROWNIAN' };
  }

  // G2. Markov 1906 — matriks transisi arah return (naik/turun)
  function engMarkov(logret) {
    const n = logret.length;
    if (n < 30) return null;
    let uu = 0, ud = 0, du = 0, dd = 0;
    for (let i = 1; i < n - 1; i++) {
      const prev = logret[i] >= 0, cur = logret[i + 1] >= 0;
      if (prev && cur) uu++;
      else if (prev && !cur) ud++;
      else if (!prev && cur) du++;
      else dd++;
    }
    const rU = uu + ud, rD = du + dd;
    if (rU < 5 || rD < 5) return null;
    const pUU = uu / rU, pUD = ud / rU, pDU = du / rD, pDD = dd / rD;
    // distribusi stasioner rantai 2-keadaan
    const denom = pUD + pDU;
    const piUp = denom > 0 ? pDU / denom : 0.5;
    return { pUU, pUD, pDU, pDD, piUp, persistence: pUU + pDD - 1 };
  }

  // G3. Ljung-Box 1978 — uji autokorelasi berpasangan sampai lag m
  function engLjungBox(logret, m) {
    m = m || 12;
    const n = logret.length;
    if (n < 40) return null;
    const mu = mean(logret);
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (logret[i] - mu) ** 2;
    if (!(d2 > 0)) return null;
    let Q = 0;
    const rhos = [];
    for (let k = 1; k <= m; k++) {
      let num = 0;
      for (let t = k; t < n; t++) num += (logret[t] - mu) * (logret[t - k] - mu);
      const rho = num / d2;
      rhos.push(rho);
      Q += (rho * rho) / (n - k);
    }
    Q *= n * (n + 2);
    return { Q, p: 1 - chiSqP(Q, m), rho1: rhos[0], rho2: rhos[1], rhos };
  }

  // G4. Kaufman 1995 — Efficiency Ratio (gerak bersih / jumlah gerak)
  function engKaufmanER(prices, W) {
    W = W || 20;
    if (prices.length < W + 2) return null;
    const win = prices.slice(-W - 1);
    const net = Math.abs(win[win.length - 1] - win[0]);
    let pathv = 0;
    for (let i = 1; i < win.length; i++) pathv += Math.abs(win[i] - win[i - 1]);
    return pathv > 0 ? { er: net / pathv, dir: Math.sign(win[win.length - 1] - win[0]) || 0 } : null;
  }

  // G5. Choppiness Index (Dreiss) — adaptasi close-only
  function engChoppiness(prices, W) {
    W = W || 14;
    if (prices.length < W + 2) return null;
    const win = prices.slice(-W - 1);
    let sumAbs = 0;
    for (let i = 1; i < win.length; i++) sumAbs += Math.abs(win[i] - win[i - 1]);
    const range = Math.max(...win) - Math.min(...win);
    if (!(sumAbs > 0) || !(range > 0)) return null;
    const chop = (100 * Math.log10(sumAbs / range)) / Math.log10(W);
    return { chop: clamp(chop, 0, 100) };
  }

  // G6. Proxy Granger 1969 — cross-korelasi bertingkat vs BTC (lag −6..+6 jam)
  function engGrangerProxy(logret, btcRet) {
    if (!btcRet || !logret) return null;
    const n = Math.min(logret.length, btcRet.length);
    if (n < 60) return null;
    let bestR = 0, bestLag = 0, r0 = null;
    r0 = corr(logret.slice(0, n), btcRet.slice(0, n));
    for (let lag = -6; lag <= 6; lag++) {
      if (lag === 0) continue;
      const a = [], b = [];
      for (let t = Math.max(0, lag); t < n + Math.min(0, lag); t++) {
        const tb = t - lag;
        if (tb >= 0 && tb < n && t >= 0 && t < n) { a.push(logret[t]); b.push(btcRet[tb]); }
      }
      if (a.length < 50) continue;
      const r = corr(a, b);
      if (isNum(r) && Math.abs(r) > Math.abs(bestR)) { bestR = r; bestLag = lag; }
    }
    return { r0, bestLag, bestR, leads: bestLag < 0 };
  }

  /* ════════════════════════════════════════════════════════════════
     FAMILI H: PORTOFOLIO & RISIKO
     ════════════════════════════════════════════════════════════════ */

  // H1+H2. OLS vs BTC (CAPM, Sharpe 1964): beta, alpha, R², idio vol, t(β)
  function engVsBTC(logret, btcRet) {
    if (!btcRet) return null;
    const n = Math.min(logret.length, btcRet.length);
    if (n < 40) return null;
    const y = logret.slice(0, n), x = btcRet.slice(0, n);
    const vb = variance(x);
    if (!(vb > 0)) return null;
    const fit = ols(x, y);
    if (!fit) return null;
    const residuals = y.map((v, i) => v - (fit.intercept + fit.slope * x[i]));
    const idio = stdev(residuals);
    return {
      beta: fit.slope,
      alphaPerDayPct: fit.intercept * 24 * 100,
      r2: fit.r2,
      tBeta: fit.seSlope > 0 ? fit.slope / fit.seSlope : null,
      idioPctPerHour: idio * 100,
      idioAnnPct: idio * 100 * Math.sqrt(8760),
    };
  }

  // H3. Tail dependence vs BTC (Embrechts) — λU, λL empiris (kuantil 10%)
  function engTailDep(logret, btcRet) {
    if (!btcRet) return null;
    const n = Math.min(logret.length, btcRet.length);
    if (n < 60) return null;
    const qHiC = quantile(logret.slice(0, n), 0.9), qLoC = quantile(logret.slice(0, n), 0.1);
    const qHiB = quantile(btcRet.slice(0, n), 0.9), qLoB = quantile(btcRet.slice(0, n), 0.1);
    let uB = 0, uC = 0, lB = 0, lC = 0;
    for (let i = 0; i < n; i++) {
      if (btcRet[i] > qHiB) { uB++; if (logret[i] > qHiC) uC++; }
      if (btcRet[i] < qLoB) { lB++; if (logret[i] < qLoC) lC++; }
    }
    return {
      lamU: uB >= 5 ? uC / uB : null,
      lamL: lB >= 5 ? lC / lB : null,
    };
  }

  // H4+H5. Sharpe 1966 & Sortino — annualized (24/7 → √8760)
  function engSharpeSortino(logret) {
    const n = logret.length;
    if (n < 30) return null;
    const m = mean(logret), s = stdev(logret);
    if (!(s > 0)) return null;
    const downs = logret.filter((r) => r < 0);
    const ds = downs.length > 4 ? stdev(downs) : s;
    return {
      sharpe: (m / s) * Math.sqrt(8760),
      sortino: (m / Math.max(ds, 1e-9)) * Math.sqrt(8760),
    };
  }

  // H6. Information ratio vs BTC (Treynor-Black) — alpha residual / idio vol
  function engInfoRatio(logret, btcRet, vsBTC) {
    if (!vsBTC || !btcRet) return null;
    if (!(vsBTC.idioPctPerHour > 0)) return null;
    const n = Math.min(logret.length, btcRet.length);
    const diff = [];
    for (let i = 0; i < n; i++) diff.push(logret[i] - btcRet[i]);
    const m = mean(diff);
    return { ir: (m / (vsBTC.idioPctPerHour / 100)) * Math.sqrt(8760) };
  }

  // H7. Kelly 1956 — fraksi optimal kontinu f* = (μ + σ²/2)/σ² (log-return,
  //     per jam → identik setelah annualisasi karena rasio skala-invariant).
  //     Dicegah agar tidak meledak: clamp [−1, +3].
  function engKelly(logret) {
    const n = logret.length;
    if (n < 30) return null;
    const m = mean(logret), v = variance(logret);
    if (!(v > 0)) return null;
    const f = (m + v / 2) / v;
    return { kelly: clamp(f, -1, 3), halfKelly: clamp(f / 2, -0.5, 1.5) };
  }

  // H8. VaR 95% 24 jam — parametrik (RiskMetrics) & historis (overlapping)
  function engVaR95(logret) {
    const n = logret.length;
    if (n < 48) return null;
    const s = stdev(logret);
    const param = 1.645 * s * Math.sqrt(24) * 100; // % 24 jam
    const sums = [];
    for (let i = 0; i + 24 <= n; i++) {
      let acc = 0;
      for (let j = 0; j < 24; j++) acc += logret[i + j];
      sums.push(acc);
    }
    const hist = sums.length >= 8 ? -quantile(sums, 0.05) * 100 : null;
    return { param95: param, hist95: hist };
  }

  // H9. Monte Carlo block-bootstrap 24 jam (Efron 1979; Künsch 1989) —
  //     2000 lintasan, panjang blok geometrik rata-rata 12 jam
  function engMonteCarlo(logret, horizon, paths, seedStr) {
    const n = logret.length;
    horizon = horizon || 24;
    paths = paths || 2000;
    if (n < 48) return null;
    const rnd = mulberry32(hashSeed(seedStr || 'mc') ^ 0x9e3779b9);
    const cums = new Float64Array(paths);
    for (let p = 0; p < paths; p++) {
      let acc = 0, t = 0;
      while (t < horizon) {
        const L = Math.max(1, Math.round(-12 * Math.log(Math.max(rnd(), 1e-12))));
        const start = Math.floor(rnd() * n);
        for (let j = 0; j < L && t < horizon; j++, t++) acc += logret[(start + j) % n];
      }
      cums[p] = acc;
    }
    return {
      p5: (Math.exp(quantile(cums, 0.05)) - 1) * 100,
      p25: (Math.exp(quantile(cums, 0.25)) - 1) * 100,
      p50: (Math.exp(quantile(cums, 0.5)) - 1) * 100,
      p75: (Math.exp(quantile(cums, 0.75)) - 1) * 100,
      p95: (Math.exp(quantile(cums, 0.95)) - 1) * 100,
      probUp: cums.reduce((a, c) => a + (c > 0 ? 1 : 0), 0) / paths,
    };
  }

  // H10. Support/Resistance — clustering kernel 1D atas ekstrema lokal harga
  function engSRLevels(prices) {
    const n = prices.length;
    if (n < 40) return null;
    const ext = [];
    for (let i = 2; i < n - 2; i++) {
      const w = prices.slice(i - 2, i + 3);
      if (prices[i] === Math.max(...w) || prices[i] === Math.min(...w)) ext.push(prices[i]);
    }
    if (ext.length < 6) return null;
    // k-means 1D k=4 (init kuantil, 12 iterasi)
    const K = 4;
    let cents = [0.2, 0.45, 0.7, 0.95].map((q) => quantile(ext, q));
    for (let it = 0; it < 12; it++) {
      const groups = Array.from({ length: K }, () => []);
      for (const e of ext) {
        let bi = 0, bd = Infinity;
        for (let c = 0; c < K; c++) { const d = Math.abs(e - cents[c]); if (d < bd) { bd = d; bi = c; } }
        groups[bi].push(e);
      }
      for (let c = 0; c < K; c++) if (groups[c].length) cents[c] = mean(groups[c]);
    }
    const last = prices[n - 1];
    const below = cents.filter((c) => c < last * 0.995).sort((a, b) => b - a);
    const above = cents.filter((c) => c > last * 1.005).sort((a, b) => a - b);
    return {
      support: below.length ? below[0] : null,
      supportDistPct: below.length ? (below[0] / last - 1) * 100 : null,
      resistance: above.length ? above[0] : null,
      resistDistPct: above.length ? (above[0] / last - 1) * 100 : null,
    };
  }

  /* ════════════════════════════════════════════════════════════════
     FAMILI K: WALK-FORWARD OUT-OF-SAMPLE (validasi mini per koin)
     ════════════════════════════════════════════════════════════════ */

  // K1. Walk-forward consistency — di checkpoint t (in-sample 72-96 jam),
  //     ukur sinyal momentum ternormalisasi, lalu cek apakah arahnya benar
  //     pada periode OUT-OF-SAMPLE sesudahnya (24/48/72 jam). Ini jawaban
  //     jujur untuk "apakah sinyal momentum koin ini pernah bekerja baru-baru
  //     ini?" — hit-rate 0% = sinyal momentum gagal di OOS (anti-momentum),
  //     100% = terkonfirmasi. Bukan backtest penuh, tapi jauh lebih baik
  //     daripada tidak ada validasi sama sekali.
  //     Catatan: panjang sparkline real-world bisa 167 (bukan 168) —
  //     horizon OOS di-adaptasi ke sisa data yang tersedia (min 12 jam).
  function engWalkForward(prices) {
    const n = prices.length;
    if (n < 120) return null;
    const logp = new Array(n);
    for (let i = 0; i < n; i++) {
      if (!isNum(prices[i]) || prices[i] <= 0) return null;
      logp[i] = Math.log(prices[i]);
    }
    const checkpoints = [];
    for (const [t, oosWant] of [[96, 72], [120, 48], [144, 24]]) {
      if (t - 72 < 0) continue;
      const oosH = Math.min(oosWant, n - 1 - t);
      if (oosH < 12) continue; // sisa data OOS terlalu pendek
      const mom = logp[t] - logp[t - 72];
      const rets = [];
      for (let i = t - 71; i <= t; i++) rets.push(logp[i] - logp[i - 1]);
      const sd = stdev(rets);
      if (!(sd > 0)) continue;
      const smom = mom / (sd * Math.sqrt(72));
      if (Math.abs(smom) < 0.5) continue; // sinyal terlalu lemah → checkpoint di-skip
      const oos = logp[t + oosH] - logp[t];
      const oosPct = (Math.exp(oos) - 1) * 100;
      checkpoints.push({
        t, oosH,
        smom: Math.round(smom * 100) / 100,
        oosPct: Math.round(oosPct * 100) / 100,
        hit: Math.sign(smom) === Math.sign(oos) ? 1 : 0,
      });
    }
    if (!checkpoints.length) return null;
    const hits = checkpoints.reduce((a, c) => a + c.hit, 0);
    return { checkpoints, hitRate: hits / checkpoints.length, n: checkpoints.length };
  }

  /* ════════════════════════════════════════════════════════════════
     FAMILI L/M/N: PORTOFOLIO, EVENT RADAR, CLUSTER (tingkat pasar)
     ════════════════════════════════════════════════════════════════ */

  // L1. Portfolio basket invers-volatilitas — long-short market-neutral
  //     dari kandidat teratas. Bobot wᵢ ∝ 1/σᵢ per sisi (gross 100% per sisi),
  //     vol portofolio dari matriks kovarians penuh (bukan penjumlahan naif),
  //     net beta & rata-rata korelasi pasangan → diversifikasi.
  function buildPortfolio(cands) {
    if (!cands || cands.length < 4) return null;
    const N = cands.length;
    const vols = cands.map((c) => {
      if (!c.rets || c.rets.length < 24) return null;
      const s = stdev(c.rets);
      return s > 0 ? s : null;
    });
    const longIdx = [], shortIdx = [];
    for (let i = 0; i < N; i++) (cands[i].dir > 0 ? longIdx : shortIdx).push(i);
    if (!longIdx.length || !shortIdx.length) return null;
    const inv = vols.map((s) => (s ? 1 / s : 0));
    const w = new Array(N).fill(0);
    const norm = (idxs) => {
      const s = idxs.reduce((a, i) => a + inv[i], 0);
      if (s > 0) for (const i of idxs) w[i] = inv[i] / s;
    };
    norm(longIdx); norm(shortIdx);
    // matriks kovarians (per jam)
    const T = Math.min(...cands.map((c) => (c.rets ? c.rets.length : 0)));
    if (!(T >= 24)) return null;
    const means = cands.map((c) => mean(c.rets.slice(0, T)));
    const cov = Array.from({ length: N }, () => new Float64Array(N));
    for (let i = 0; i < N; i++) {
      for (let j = i; j < N; j++) {
        let s = 0;
        for (let t = 0; t < T; t++) s += (cands[i].rets[t] - means[i]) * (cands[j].rets[t] - means[j]);
        cov[i][j] = cov[j][i] = s / (T - 1);
      }
    }
    let portVar = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const swi = 0.5 * w[i] * cands[i].dir;
        const swj = 0.5 * w[j] * cands[j].dir;
        portVar += swi * swj * cov[i][j];
      }
    }
    if (!(portVar > 0)) return null;
    // korelasi rata-rata pasangan konstituen
    let cs = 0, cn = 0;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (vols[i] && vols[j]) { cs += cov[i][j] / (vols[i] * vols[j]); cn++; }
      }
    }
    const betas = cands.map((c) => (isNum(c.beta) ? c.beta : null));
    let netBeta = null;
    const bIdx = betas.map((b, i) => (b !== null ? i : -1)).filter((i) => i >= 0);
    if (bIdx.length >= 3) {
      let s = 0, wsum = 0;
      for (const i of bIdx) { s += w[i] * cands[i].dir * betas[i]; wsum += w[i]; }
      if (wsum > 0) netBeta = s / wsum;
    }
    const dailyVolPct = Math.sqrt(portVar * 24) * 100;
    const weights = cands.map((c, i) => ({
      sym: c.sym, dir: c.dir > 0 ? 'LONG' : 'SHORT', wPct: w[i] * 100,
    }));
    return {
      weights,
      dailyVolPct,
      avgPairCorr: cn ? cs / cn : null,
      diversification: cn ? 1 - cs / cn : null,
      netBeta,
      grossLongPct: 100, grossShortPct: 100, // ternormalisasi per sisi
      var95DailyPct: 1.645 * dailyVolPct,
    };
  }

  // M1. Event radar — pindai ekstrema lintas engine untuk SELURUH pasar;
  //     menghasilkan daftar kejadian actionable (squeeze, breakout, break-point,
  //     shock, skew Monte Carlo, kegagalan walk-forward).
  function eventRadar(items) {
    const out = [];
    for (const it of items) {
      try {
        const ev = [];
        const b = it.bundle, core = it.core;
        const fz = core && core.components ? core.components.fundZ : null;
        if (isNum(fz) && Math.abs(fz) > 2) {
          ev.push(fz < 0 ? 'Funding ekstrem negatif — short crowded (squeeze watch)' :
            'Funding ekstrem positif — long crowded (flush watch)');
        }
        const g = b.vol && b.vol.garch;
        if (g && isNum(g.ratio)) {
          if (g.ratio > 1.5) ev.push(`Vol regime EXPANDING cepat (ratio ${g.ratio.toFixed(2)})`);
          else if (g.ratio < 0.7) ev.push('Kompresi volatilitas dalam — breakout watch');
        }
        if (isNum(it.squeezeThr) && isNum(b._bollBw) && b._bollBw < it.squeezeThr) {
          ev.push('Bollinger squeeze populasi p10 — energi directional terkumpul');
        }
        const cu = b.filt && b.filt.cusum;
        if (cu && cu.hoursSince != null && cu.hoursSince <= 12) {
          ev.push(`CUSUM break-point ${cu.hoursSince} jam lalu (arah ${cu.lastDir > 0 ? 'naik' : 'turun'})`);
        }
        const fis = b.sig && b.sig.fisher;
        if (fis && fis.extreme) ev.push(`Fisher transform ekstrem (${fis.fisher.toFixed(2)}) — reversal watch`);
        const kal = b.filt && b.filt.kalman;
        if (kal && isNum(kal.innovZ) && Math.abs(kal.innovZ) > 2.5) {
          ev.push(`Kalman innovation shock ${kal.innovZ.toFixed(1)}σ`);
        }
        const mc = b.mc;
        if (mc && (mc.probUp > 0.75 || mc.probUp < 0.25)) {
          ev.push(`Monte Carlo skew: ${(mc.probUp * 100).toFixed(0)}% lintasan naik (24j)`);
        }
        const wf = b.replay && b.replay.wf;
        if (wf && wf.n >= 2 && wf.hitRate === 0) ev.push('Walk-forward: momentum GAGAL di out-of-sample (0% hit)');
        if (wf && wf.n >= 2 && wf.hitRate === 1) ev.push('Walk-forward: momentum terkonfirmasi OOS (100% hit)');
        if (ev.length) out.push({ sym: it.sym, events: ev });
      } catch (e) { /* koin ini skip */ }
    }
    out.sort((a, c) => c.events.length - a.events.length);
    return out.slice(0, 24);
  }

  // N1. Cluster map — agglomerative average-linkage atas matriks korelasi;
  //     koin dalam cluster yang sama = redundan (jangan dibeli bersamaan).
  function clusterCoins(rets, syms, threshold) {
    threshold = threshold || 0.72;
    const N = rets.length;
    if (N < 6 || syms.length !== N) return null;
    const C = Array.from({ length: N }, () => new Float64Array(N));
    for (let i = 0; i < N; i++) {
      for (let j = i; j < N; j++) {
        const r = i === j ? 1 : clamp(corr(rets[i], rets[j]) || 0, -1, 1);
        C[i][j] = r; C[j][i] = r;
      }
    }
    let clusters = syms.map((s, i) => ({ members: [i] }));
    const avgBetween = (a, b) => {
      let s = 0, c = 0;
      for (const i of a.members) for (const j of b.members) { s += C[i][j]; c++; }
      return c ? s / c : -1;
    };
    while (clusters.length > 1) {
      let bi = -1, bj = -1, bv = -2;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const v = avgBetween(clusters[i], clusters[j]);
          if (v > bv) { bv = v; bi = i; bj = j; }
        }
      }
      if (bv < threshold) break;
      clusters[bi].members = clusters[bi].members.concat(clusters[bj].members);
      clusters.splice(bj, 1);
    }
    const out = clusters.map((cl) => {
      let s = 0, c = 0;
      for (let i = 0; i < cl.members.length; i++) {
        for (let j = i + 1; j < cl.members.length; j++) { s += C[cl.members[i]][cl.members[j]]; c++; }
      }
      return {
        syms: cl.members.map((i) => syms[i]),
        avgCorr: c ? s / c : 1,
      };
    }).sort((a, b) => b.syms.length - a.syms.length);
    return { clusters: out, nClusters: out.length, threshold };
  }

  /* ════════════════════════════════════════════════════════════════
     2. ORKESTRATOR PER-KOIN
     ════════════════════════════════════════════════════════════════ */

  // Wrapper anti-ledakan: engine yang error → null, tidak menular ke tetangga.
  function safe(name, fn, store, okCount) {
    try {
      const v = fn();
      if (v === undefined || v === null) return okCount;
      // tolak hasil yang mengandung NaN di level-1
      for (const k in v) if (typeof v[k] === 'number' && !isNum(v[k])) v[k] = null;
      store[name] = v;
      return okCount + 1;
    } catch (e) {
      return okCount;
    }
  }

  /**
   * runCoinEngines(ctx)
   * ctx = { id, sym, prices[], chg1h, chg24h, chg7d, volumeUsd, mcapUsd,
   *         btcReturns[]|null, fundingRatePct|null, oiUsd|null }
   * return bundle engine lengkap.
   */
  function runCoinEngines(ctx) {
    const prices = ctx.prices;
    const n = prices.length;
    const bundle = {
      id: ctx.id, sym: ctx.sym, n, _prices: prices,
      vol: {}, meanRev: {}, info: {}, mom: {}, sig: {}, filt: {}, econ: {}, port: {}, replay: {},
      okCount: 0, enginesRun: 0,
    };
    if (n < 30) return bundle;

    // data turunan
    let logp = [], logret = [];
    for (let i = 0; i < n; i++) {
      if (!isNum(prices[i]) || prices[i] <= 0) { logp = []; break; }
      logp.push(Math.log(prices[i]));
    }
    if (logp.length === n) {
      for (let i = 1; i < n; i++) logret.push(logp[i] - logp[i - 1]);
    }
    if (logret.length < 30) return bundle;

    const hpFac = n >= 40 ? makeHPFactor(n, HP_LAMBDA) : null;
    let ok = 0, run = 0;
    const S = (fam, name, fn) => { run++; ok = safe(name, fn, bundle[fam], ok); };

    // FAMILI A — volatilitas
    S('vol', 'rv', () => engRVTerm(logret));
    S('vol', 'garch', () => engGarch(logret));
    S('vol', 'parkinson', () => engParkinson(prices));
    S('vol', 'gk', () => engGarmanKlass(prices));
    S('vol', 'vov', () => engVolOfVol(logret));
    S('vol', 'boll', () => engBollinger(prices));
    S('vol', 'donchian', () => engDonchian(prices));
    S('vol', 'amihud', () => engAmihud(logret, ctx.volumeUsd));

    // FAMILI B — mean reversion & fraktal
    S('meanRev', 'ou', () => engOU(logp));
    S('meanRev', 'hurstRS', () => engHurstRS(logret));
    S('meanRev', 'dfa', () => engDFA(logret));
    S('meanRev', 'vr', () => engVarianceRatio(logret));
    S('meanRev', 'katz', () => engKatzFD(prices));
    S('meanRev', 'higuchi', () => engHiguchiFD(logret));
    S('meanRev', 'cross', () => engCrossingRate(prices));

    // FAMILI C — informasi
    S('info', 'shannon', () => engShannon(logret));
    S('info', 'perm', () => engPermEntropy(logret));
    S('info', 'lz', () => engLZ(logret));
    S('info', 'ks', () => engKSNormal(logret));

    // FAMILI D — momen & ekor
    S('mom', 'jb', () => engMomentsJB(logret));
    S('mom', 'hill', () => engHill(logret));
    S('mom', 'zipf', () => engZipf(logret));
    S('mom', 'lyap', () => engLyapunov(logret));
    S('mom', 'dd', () => engDrawdown(prices));

    // FAMILI E — sinyal
    S('sig', 'period', () => engPeriodogram(logret));
    S('sig', 'haar', () => engHaar(prices));
    S('sig', 'hilbert', () => engHilbert(prices));
    S('sig', 'fisher', () => engFisherTransform(prices));

    // FAMILI F — filter
    S('filt', 'kalman', () => engKalman(prices));
    S('filt', 'hp', () => engHP(logp, hpFac));
    S('filt', 'cusum', () => engCusum(logret));
    S('filt', 'ss', () => engSuperSmoother(prices));
    S('filt', 'sg', () => engSGDerivative(prices));

    // FAMILI G — ekonofisika
    S('econ', 'diff', () => engDiffusion(logp));
    S('econ', 'markov', () => engMarkov(logret));
    S('econ', 'lb', () => engLjungBox(logret, 12));
    S('econ', 'er', () => engKaufmanER(prices, 20));
    S('econ', 'chop', () => engChoppiness(prices, 14));
    S('econ', 'granger', () => engGrangerProxy(logret, ctx.btcReturns));

    // FAMILI H — portofolio (iratio butuh hasil btc → jalankan setelah btc)
    S('port', 'btc', () => engVsBTC(logret, ctx.btcReturns));
    S('port', 'tail', () => engTailDep(logret, ctx.btcReturns));
    S('port', 'ssratio', () => engSharpeSortino(logret));
    S('port', 'iratio', () => engInfoRatio(logret, ctx.btcReturns, bundle.port.btc));
    S('port', 'kelly', () => engKelly(logret));
    S('port', 'var', () => engVaR95(logret));
    S('port', 'sr', () => engSRLevels(prices));

    // FAMILI K — walk-forward validasi out-of-sample
    S('replay', 'wf', () => engWalkForward(prices));

    bundle.okCount = ok;
    bundle.enginesRun = run;
    bundle.chg = { h1: ctx.chg1h, h24: ctx.chg24h, h7d: ctx.chg7d };
    bundle.turnover = ctx.mcapUsd > 0 && ctx.volumeUsd > 0 ? ctx.volumeUsd / ctx.mcapUsd : null;
    return bundle;
  }

  // Monte Carlo dijalankan terpisah (hanya untuk koin teratas — hemat waktu)
  function attachMonteCarlo(bundle) {
    try {
      if (!bundle.mc) {
        const prices = bundle._prices;
        if (!prices || prices.length < 48) return;
        const logret = [];
        for (let i = 1; i < prices.length; i++) logret.push(Math.log(prices[i] / prices[i - 1]));
        bundle.mc = engMonteCarlo(logret, 24, 2000, bundle.sym + String(bundle.chg ? bundle.chg.h7d : ''));
      }
    } catch (e) { bundle.mc = null; }
  }

  /* ════════════════════════════════════════════════════════════════
     3. STATISTIK POPULASI (robust: median/MAD — tahan outlier, Huber)
     ════════════════════════════════════════════════════════════════ */

  function finalizePopulation(bundles) {
    const pick = {
      hurst: (b) => (b.meanRev.hurstRS && b.meanRev.dfa ? (b.meanRev.hurstRS.H + b.meanRev.dfa.H) / 2 : null),
      garchNext: (b) => (b.vol.garch ? b.vol.garch.nextPct : null),
      garchRatio: (b) => (b.vol.garch ? b.vol.garch.ratio : null),
      bollBw: (b) => (b.vol.boll ? b.vol.boll.bwPct : null),
      ouHL: (b) => (b.meanRev.ou && isNum(b.meanRev.ou.halfLife) && b.meanRev.ou.halfLife > 0 ? b.meanRev.ou.halfLife : null),
      permEnt: (b) => (b.info.perm ? b.info.perm.norm : null),
      lz: (b) => (b.info.lz ? b.info.lz.norm : null),
      sharpe: (b) => (b.port.ssratio ? b.port.ssratio.sharpe : null),
      kelly: (b) => (b.port.kelly ? b.port.kelly.kelly : null),
      beta: (b) => (b.port.btc ? b.port.btc.beta : null),
      idio: (b) => (b.port.btc ? b.port.btc.idioPctPerHour : null),
      amihud: (b) => (b.vol.amihud ? b.vol.amihud.illiq : null),
      lyap: (b) => (b.mom.lyap ? b.mom.lyap.lambda : null),
      er: (b) => (b.econ.er ? b.econ.er.er : null),
      chop: (b) => (b.econ.chop ? b.econ.chop.chop : null),
      turnover: (b) => b.turnover,
      vaR: (b) => (b.port.var ? b.port.var.param95 : null),
      alpha: (b) => (b.port.btc ? b.port.btc.alphaPerDayPct : null),
      fisher: (b) => (b.sig.fisher ? b.sig.fisher.fisher : null),
    };
    const pop = { fields: {}, pctRank: {}, thresholds: {} };
    const pctRanks = {};
    for (const key in pick) {
      const vals = [];
      for (const b of bundles) {
        const v = pick[key](b);
        if (isNum(v)) { vals.push(v); b['_' + key] = v; }
      }
      if (vals.length < 8) continue;
      const sortedV = sortedCopy(vals);
      const med = median(vals);
      const m = mad(vals);
      pop.fields[key] = {
        median: med,
        mad: m,
        robustSigma: 1.4826 * m,
        p10: quantile(sortedV, 0.1), p15: quantile(sortedV, 0.15),
        p25: quantile(sortedV, 0.25), p75: quantile(sortedV, 0.75),
        p85: quantile(sortedV, 0.85), p90: quantile(sortedV, 0.9),
        n: vals.length,
      };
      // persentil rank tiap koin
      for (const b of bundles) {
        if (!isNum(b['_' + key])) continue;
        let below = 0;
        for (const v of vals) if (v < b['_' + key]) below++;
        if (!pctRanks[b.sym]) pctRanks[b.sym] = {};
        pctRanks[b.sym][key] = below / vals.length;
        // robust-z
        b['z_' + key] = m > 0 ? (b['_' + key] - med) / (1.4826 * m) : 0;
      }
    }
    pop.pctRank = pctRanks;
    // ambang penting
    if (pop.fields.bollBw) pop.thresholds.squeeze = pop.fields.bollBw.p10;
    if (pop.fields.garchNext) pop.thresholds.highVol = pop.fields.garchNext.p90;
    if (pop.fields.garchNext) pop.thresholds.lowVol = pop.fields.garchNext.p10;
    if (pop.fields.hurst) {
      pop.thresholds.trending = pop.fields.hurst.p85;
      pop.thresholds.meanRevert = pop.fields.hurst.p15;
    }
    return pop;
  }

  /* ════════════════════════════════════════════════════════════════
     4. ENGINE PASAR — FAMILI I: JARINGAN KORELASI & REGIME
     ════════════════════════════════════════════════════════════════ */

  /**
   * runMarketEngines(coins, bundles, extras)
   * coins  : array coin CoinGecko aktif (punya sparkline)
   * bundles: Map id → bundle
   * extras : { fundingRates[] } untuk MQS
   */
  function runMarketEngines(coins, bundles, extras) {
    const M = { network: null, cross: null, mqs: null, regime: null };

    // ── I1+I2+I3: jaringan korelasi top-40 ──
    try {
      const top = coins
        .filter((c) => c.sparkline_in_7d && c.sparkline_in_7d.price && c.sparkline_in_7d.price.length >= 120 && !isStableSym(c.symbol))
        .sort((a, b) => (a.market_cap_rank || 999) - (b.market_cap_rank || 999))
        .slice(0, 40);
      if (top.length >= 12) {
        const rets = top.map((c) => {
          const p = c.sparkline_in_7d.price;
          const out = [];
          for (let i = 1; i < p.length; i++) out.push(Math.log(p[i] / p[i - 1]));
          return out;
        });
        const T = rets[0].length, N = top.length;
        // matriks korelasi N×N
        const C = Array.from({ length: N }, () => new Float64Array(N));
        let accCorr = 0, cntCorr = 0;
        for (let i = 0; i < N; i++) {
          for (let j = i; j < N; j++) {
            const r = i === j ? 1 : clamp(corr(rets[i], rets[j]) || 0, -1, 1);
            C[i][j] = r; C[j][i] = r;
            if (i !== j) { accCorr += r; cntCorr++; }
          }
        }
        const eig = jacobiEigen(C);
        const lam1 = eig.values[0];
        const trace = N;
        // Marchenko-Pastur upper edge (random matrix noise bound)
        const q = N / T;
        const mpPlus = (1 + Math.sqrt(q)) ** 2;
        // Absorption ratio (Kritzman 2009): fraksi eigenvalue terkecil
        // yang menjelaskan 20% varians (≈ k/N; tinggi = sistemik/rapuh)
        const valsAsc = eig.values.slice().reverse();
        let cum = 0, k20 = 0;
        for (let i = 0; i < valsAsc.length; i++) {
          cum += valsAsc[i];
          k20 = i + 1;
          if (cum >= 0.2 * trace) break;
        }
        const absorption = k20 / N;
        // loading market-mode per koin (eigenvector λ1) + korelasi dgn mode pasar
        const w1 = eig.vectors[0];
        const norm = Math.sqrt(sum(w1.map((v) => v * v))) || 1;
        const marketMode = new Float64Array(T);
        for (let i = 0; i < N; i++) for (let t = 0; t < T; t++) marketMode[t] += (w1[i] / norm) * rets[i][t];
        const loadings = {};
        top.forEach((c, i) => {
          loadings[(c.symbol || '').toUpperCase()] = {
            loading: w1[i] / norm,
            corrMarket: clamp(corr(rets[i], Array.from(marketMode)) || 0, -1, 1),
          };
        });
        M.network = {
          n: N, T, lam1, lam1Share: lam1 / trace, mpPlus, aboveMP: lam1 > mpPlus,
          avgCorr: cntCorr ? accCorr / cntCorr : null,
          absorption, loadings,
          eigTop5: eig.values.slice(0, 5),
        };
        // simpan matriks return untuk cluster map & portofolio tingkat pasar
        M.rets = { syms: top.map((c) => (c.symbol || '').toUpperCase()), rets };
      }
    } catch (e) { M.network = null; }

    // ── I4: statistik lintas-seksi ──
    try {
      const ch24 = coins.map((c) => c.price_change_percentage_24h_in_currency).filter(isNum);
      const ch1 = coins.map((c) => c.price_change_percentage_1h_in_currency).filter(isNum);
      const breadth = ch24.length ? ch24.filter((v) => v > 0).length / ch24.length : null;
      const adv1 = ch1.filter((v) => v > 0).length, dec1 = ch1.length - adv1;
      const mcOsc = ch1.length ? (adv1 - dec1) / ch1.length : null; // proxy McClellan
      M.cross = {
        breadth, dispersion: ch24.length > 8 ? stdev(ch24) : null,
        skewCS: ch24.length > 8 ? skewness(ch24) : null,
        mcOsc,
        up1hPct: ch1.length ? adv1 / ch1.length : null,
      };
    } catch (e) { M.cross = null; }

    // ── I5: Market Quality Score v2 + klasifikasi regime ──
    try {
      const ch24 = coins.map((c) => c.price_change_percentage_24h_in_currency).filter(isNum);
      const breadth = ch24.length ? ch24.filter((v) => v > 0).length / ch24.length : 0.5;
      // skor breadth: 50% = seimbang; >55% risk-on; <35% risk-off
      const breadthScore = breadth > 0.58 ? 92 : breadth > 0.5 ? 78 : breadth > 0.42 ? 58 : breadth > 0.33 ? 35 : 18;
      // skor funding (stres derivatif)
      const rates = (extras && extras.fundingRates) || [];
      let fundingScore = 60;
      if (rates.length > 10) {
        const avg = mean(rates);
        const share = rates.filter((r) => Math.abs(r) > 0.05).length / rates.length;
        fundingScore = clamp(85 - Math.abs(avg) * 400 - share * 90, 5, 95);
      }
      // skor sistemik: absorption ratio & korelasi tinggi = rapuh
      let systemic = 60;
      if (M.network) {
        const a = M.network.absorption;   // 0..1 (tinggi = rapuh)
        const c = M.network.avgCorr || 0;
        systemic = clamp(95 - a * 140 - Math.max(0, c - 0.35) * 110, 5, 95);
      }
      // skor vol regime dari GARCH agregat (support Map maupun Object)
      let volScore = 60;
      const ratios = [];
      const bundleList = bundles instanceof Map ? Array.from(bundles.values()) : Object.values(bundles || {});
      for (const b of bundleList) {
        const g = b && b.vol && b.vol.garch;
        if (g && isNum(g.ratio)) ratios.push(g.ratio);
      }
      if (ratios.length > 10) {
        const med = median(ratios);
        volScore = clamp(100 - Math.max(0, med - 1.1) * 200 - Math.max(0, 0.85 - med) * 80, 5, 95);
      }
      const score = Math.round(breadthScore * 0.3 + fundingScore * 0.2 + systemic * 0.25 + volScore * 0.25);
      const zone = score >= 65 ? 'GREEN' : score >= 40 ? 'YELLOW' : 'RED';
      // regime
      let regime = 'NEUTRAL';
      if (M.network && M.cross) {
        const trending = M.network.avgCorr > 0.55 && Math.abs((M.cross.breadth || 0.5) - 0.5) > 0.1;
        const systemicHigh = M.network.absorption > 0.45;
        if (systemicHigh && breadth < 0.4) regime = 'CRISIS / HIGH-SYSTEMIC';
        else if (breadth > 0.6 && trending) regime = 'RISK-ON TRENDING';
        else if (breadth < 0.38 && trending) regime = 'RISK-OFF TRENDING';
        else if (M.network.avgCorr < 0.4) regime = 'DISPERSI / STOCK-PICKING';
        else regime = 'CHOPPY / MIXED';
      }
      const label = zone === 'GREEN'
        ? 'Kondisi cukup layak untuk screening'
        : zone === 'YELLOW'
          ? 'Hati-hati — kurangi ukuran posisi, kondisi campuran'
          : 'Hindari trading agresif — kondisi pasar tidak sehat';
      M.mqs = {
        score, zone, label, breadthPct: Math.round(breadth * 100),
        components: { breadthScore: Math.round(breadthScore), fundingScore: Math.round(fundingScore), systemicScore: Math.round(systemic), volScore: Math.round(volScore) },
      };
      M.regime = regime;
    } catch (e) { M.mqs = null; M.regime = 'NEUTRAL'; }

    return M;
  }

  function isStableSym(sym) {
    const s = (sym || '').toLowerCase();
    return ['usdt', 'usdc', 'dai', 'busd', 'tusd', 'usdd', 'fdusd', 'pyusd', 'usde', 'usdp', 'gusd', 'frax', 'lusd', 'susd', 'eurs', 'eurt', 'usdj', 'ust'].includes(s);
  }

  /* ════════════════════════════════════════════════════════════════
     5. META ENSEMBLE — FAMILI J
     ════════════════════════════════════════════════════════════════ */

  /**
   * metaEnsemble(bundle, core, pop)
   * core = hasil Engine #1 (composite v2) {rawScore, components:{momZ, rsiZ, fundZ, rsZ, emaScore}}
   * return {pUp, score, votes[], fisher, agreePct, drivers[]}
   */
  function metaEnsemble(b, core, pop) {
    const V = [];
    const add = (name, w, vote, detail) => {
      if (isNum(vote) && vote !== 0 || (isNum(vote) && vote === 0)) {
        V.push({ name, w: Math.abs(w), vote: clamp(vote, -1, 1), detail: detail || '' });
      }
    };
    const chg7d = b.chg ? b.chg.h7d : 0;
    const chg24 = b.chg ? b.chg.h24 : 0;

    // 1. core composite
    if (core && isNum(core.rawScore)) add('Core v2', 0.16, core.rawScore / 100, `skor inti ${Math.round(core.rawScore)}`);
    // 2. Kalman slope
    if (b.filt.kalman && isNum(b.filt.kalman.snr) && isNum(b.filt.kalman.slopePct)) {
      add('Kalman', 0.09, Math.tanh(b.filt.kalman.snr / 2) * Math.sign(b.filt.kalman.slopePct),
        `slope ${b.filt.kalman.slopePct.toFixed(3)}%/j SNR ${b.filt.kalman.snr.toFixed(1)}`);
    }
    // 3. HP cycle (kontra-deviasi)
    if (b.filt.hp && isNum(b.filt.hp.cycleZ)) add('HP cycle', 0.07, -Math.tanh(b.filt.hp.cycleZ / 1.5), `cycleZ ${b.filt.hp.cycleZ.toFixed(2)}`);
    // 4. HP trend slope
    if (b.filt.hp && isNum(b.filt.hp.trendSlopePct)) add('HP trend', 0.08, Math.tanh(b.filt.hp.trendSlopePct * 2.2), `tren ${b.filt.hp.trendSlopePct.toFixed(3)}%/j`);
    // 5. Hurst persistence — H>0.5: tren 7d cenderung lanjut; H<0.5: cenderung balik
    if (isNum(b._hurst) && isNum(chg7d)) {
      const h = b._hurst;
      const per = clamp((h - 0.5) / 0.18, -1, 1);
      const dir7 = Math.sign(chg7d) || 1;
      add('Hurst', 0.07, h >= 0.5 ? dir7 * per : -dir7 * Math.abs(per),
        `H=${h.toFixed(2)} ${h > 0.54 ? 'persisten' : h < 0.46 ? 'anti-persisten' : 'random-walk'}`);
    }
    // 6. Variance ratio
    if (b.meanRev.vr && isNum(b.meanRev.vr.z4)) {
      add('Variance ratio', 0.06, Math.tanh(b.meanRev.vr.z4 / 2) * Math.sign(chg24 || 1),
        `VR(4)=${b.meanRev.vr.vr4?.toFixed(2)} z=${b.meanRev.vr.z4.toFixed(2)}`);
    }
    // 7. Super smoother
    if (b.filt.ss && isNum(b.filt.ss.slopePctPerHour)) add('SuperSmoother', 0.07, Math.tanh(b.filt.ss.slopePctPerHour * 2.5), `slope ${b.filt.ss.slopePctPerHour.toFixed(3)}%/j`);
    // 8. Kaufman ER
    if (b.econ.er && isNum(b.econ.er.er)) add('Kaufman ER', 0.06, (b.econ.er.dir || 0) * b.econ.er.er, `ER ${b.econ.er.er.toFixed(2)}`);
    // 9. Fisher transform (kontra saat ekstrem)
    if (b.sig.fisher && isNum(b.sig.fisher.fisher)) add('Fisher', 0.05, -Math.tanh(b.sig.fisher.fisher / 1.8), `F ${b.sig.fisher.fisher.toFixed(2)}`);
    // 10. OU pull (hanya jika stasioner)
    if (b.meanRev.ou && b.meanRev.ou.stationary && isNum(b.meanRev.ou.devZ)) {
      add('OU pull', 0.06, -Math.tanh(b.meanRev.ou.devZ / 1.6),
        `HL ${b.meanRev.ou.halfLife ? b.meanRev.ou.halfLife.toFixed(0) + 'j' : '∞'} devZ ${b.meanRev.ou.devZ.toFixed(2)}`);
    }
    // 11. Relative strength vs BTC
    if (core && core.components && isNum(core.components.rsZ)) add('RS vs BTC', 0.06, Math.tanh(core.components.rsZ / 1.8), `z=${core.components.rsZ.toFixed(2)}`);
    // 12. Funding squeeze
    if (core && core.components && isNum(core.components.fundZ)) add('Funding', 0.07, Math.tanh(-core.components.fundZ / 1.5), `z=${core.components.fundZ.toFixed(2)}`);
    // 13. Wavelet trend
    if (b.sig.haar && isNum(b.sig.haar.domDir)) add('Haar wavelet', 0.05, b.sig.haar.domDir, `skala dominan ${b.sig.haar.domScale}j`);
    // 14. Markov persistence
    if (b.econ.markov) add('Markov', 0.04, clamp(b.econ.markov.pUU - b.econ.markov.pDD, -1, 1) * 2,
      `pUU ${b.econ.markov.pUU.toFixed(2)} pDD ${b.econ.markov.pDD.toFixed(2)}`);
    // 15. CUSUM drift
    if (b.filt.cusum && isNum(b.filt.cusum.postDriftPct)) add('CUSUM', 0.05, Math.tanh(b.filt.cusum.postDriftPct / 0.4), `drift post-break ${b.filt.cusum.postDriftPct.toFixed(2)}%/j`);
    // 16. Einstein diffusion — β>1 super-difusi: arah 7d cenderung lanjut
    if (b.econ.diff && isNum(b.econ.diff.beta) && isNum(chg7d)) {
      const dir7 = Math.sign(chg7d) || 1;
      add('Einstein difusi', 0.03, dir7 * clamp((b.econ.diff.beta - 1) / 0.25, -1, 1),
        `β=${b.econ.diff.beta.toFixed(2)} ${b.econ.diff.verdict}`);
    }
    // 17. [UPGRADE] Walk-Forward OOS — validasi kejujuran sinyal momentum koin ini
    if (b.replay && b.replay.wf && b.replay.wf.n >= 2) {
      const dir24 = Math.sign(chg24 || chg7d || 1);
      const wfVote = (b.replay.wf.hitRate - 0.5) * 2 * dir24;
      add('Walk-Forward OOS', 0.06, wfVote, `hit-rate ${Math.round(b.replay.wf.hitRate * 100)}% (${b.replay.wf.n} uji)`);
    }

    if (!V.length) return null;
    const wSum = sum(V.map((v) => v.w)) || 1;
    let S = 0;
    for (const v of V) S += v.w * v.vote;
    S /= wSum;
    const pUp = 1 / (1 + Math.exp(-2.4 * S));
    const score = Math.round(Math.abs(2 * pUp - 1) * 100);
    const dirSign = pUp >= 0.5 ? 1 : -1;

    // agreement berbobot
    let agreeW = 0, totW = 0;
    for (const v of V) {
      if (v.vote !== 0) { totW += v.w; if (Math.sign(v.vote) === dirSign) agreeW += v.w; }
    }
    const agreePct = totW > 0 ? Math.round((agreeW / totW) * 100) : 50;

    // Fisher 1934 (Directional Upgrade) — hanya gabungkan z-stat yang SEARAH dengan konsensus
    const zs = [];
    if (core && core.components) {
      if (isNum(core.components.momZ)) zs.push(core.components.momZ);
      if (isNum(core.components.rsiZ)) zs.push(-core.components.rsiZ);
      if (isNum(core.components.fundZ)) zs.push(-core.components.fundZ);
      if (isNum(core.components.rsZ)) zs.push(core.components.rsZ);
    }
    if (b.meanRev.vr && isNum(b.meanRev.vr.z4)) zs.push(b.meanRev.vr.z4 * Math.sign(chg24 || 1));
    if (b.filt.kalman && isNum(b.filt.kalman.snr)) zs.push(Math.sign(b.filt.kalman.slopePct || 1) * b.filt.kalman.snr);
    if (b.filt.hp && isNum(b.filt.hp.cycleZ)) zs.push(-b.filt.hp.cycleZ);
    if (b.meanRev.ou && isNum(b.meanRev.ou.tStat)) zs.push(Math.abs(b.meanRev.ou.tStat) * -Math.sign(b.meanRev.ou.devZ || 1));
    const alignedZs = zs.filter((z) => Math.sign(z) === dirSign);
    let fisher = null;
    if (alignedZs.length >= 3) {
      let chi2 = 0;
      for (const z of alignedZs) chi2 += -2 * Math.log(twoSidedP(z));
      const df = 2 * alignedZs.length;
      fisher = { chi2, df, p: clamp(1 - chiSqP(chi2, df), 1e-10, 1) };
    }

    // driver utama (kontribusi terbesar searah)
    const drivers = V.filter((v) => Math.sign(v.vote) === dirSign && Math.abs(v.vote) > 0.1)
      .sort((a, c) => c.w * Math.abs(c.vote) - a.w * Math.abs(a.vote)).slice(0, 3)
      .map((v) => `${v.name}: ${v.detail}`);

    return { pUp, score, direction: dirSign > 0 ? 'LONG' : 'SHORT', votes: V, fisher, agreePct, drivers, S };
  }

  /* ════════════════════════════════════════════════════════════════
     6. REGISTRY — kebenaran tunggal daftar engine (dipakai UI + TXT)
     ════════════════════════════════════════════════════════════════ */

  const ENGINE_REGISTRY = [
    // CORE
    { id: 'core', fam: 'CORE', name: 'Composite Core v2', credit: 'model z-score lintas-populasi (5 komponen + interaksi non-linear)' },
    // A — VOLATILITAS
    { id: 'rv', fam: 'A·VOLATILITAS', name: 'Realized Vol Term Structure', credit: 'realized volatility 24/72/168 jam' },
    { id: 'garch', fam: 'A·VOLATILITAS', name: 'GARCH(1,1) Forecaster', credit: 'Engle (Nobel 2003) & Bollerslev 1986 — σ²ₜ=ω+αε²ₜ₋₁+βσ²ₜ₋₁, MLE Nelder-Mead' },
    { id: 'parkinson', fam: 'A·VOLATILITAS', name: 'Parkinson Range Vol', credit: 'Parkinson 1980 — σ²=⟨ln(H/L)²⟩/4ln2' },
    { id: 'gk', fam: 'A·VOLATILITAS', name: 'Garman-Klass OHLC Vol', credit: 'Garman & Klass 1980' },
    { id: 'vov', fam: 'A·VOLATILITAS', name: 'Vol-of-Vol', credit: 'koefisien variasi rolling-volatility' },
    { id: 'boll', fam: 'A·VOLATILITAS', name: 'Bollinger Squeeze & %B', credit: 'Bollinger 1983' },
    { id: 'donchian', fam: 'A·VOLATILITAS', name: 'Donchian Range Position', credit: 'Donchian — posisi dalam range 7 hari' },
    { id: 'amihud', fam: 'A·VOLATILITAS', name: 'Amihud Illiquidity', credit: 'Amihud 2002 — |r|/dollar-volume' },
    // B — MEAN REVERSION & FRAKTAL
    { id: 'ou', fam: 'B·MEAN-REV', name: 'Ornstein-Uhlenbeck + Half-Life', credit: 'Uhlenbeck & Ornstein 1930 — dX=θ(μ−X)dt+σdW; HL=ln2/θ' },
    { id: 'adf', fam: 'B·MEAN-REV', name: 'Dickey-Fuller t-Stat', credit: 'Dickey & Fuller 1979 — stasionaritas AR(1)' },
    { id: 'hurstRS', fam: 'B·MEAN-REV', name: 'Hurst R/S Analysis', credit: 'Hurst 1951, Mandelbrot — log(R/S) vs log(n)' },
    { id: 'dfa', fam: 'B·MEAN-REV', name: 'DFA Hurst', credit: 'Peng et al. 1994 — detrended fluctuation analysis' },
    { id: 'vr', fam: 'B·MEAN-REV', name: 'Lo-MacKinlay Variance Ratio', credit: 'Lo & MacKinlay 1988 — VR(q)=σ²(q)/qσ²(1), z asimtotik' },
    { id: 'katz', fam: 'B·MEAN-REV', name: 'Katz Fractal Dimension', credit: 'Katz 1988' },
    { id: 'higuchi', fam: 'B·MEAN-REV', name: 'Higuchi Fractal Dimension', credit: 'Higuchi 1988' },
    { id: 'cross', fam: 'B·MEAN-REV', name: 'Level-Crossing Rate', credit: 'Rice 1945 (first-passage) — silang-median vs iid' },
    // C — INFORMASI
    { id: 'shannon', fam: 'C·INFORMASI', name: 'Shannon Entropy', credit: 'Shannon 1948 — H=−Σp·ln p' },
    { id: 'perm', fam: 'C·INFORMASI', name: 'Permutation Entropy', credit: 'Bandt & Pompe 2002' },
    { id: 'lz', fam: 'C·INFORMASI', name: 'Lempel-Ziv LZ76', credit: 'Lempel & Ziv 1976' },
    { id: 'spectral', fam: 'C·INFORMASI', name: 'Spectral Flatness (Wiener)', credit: 'Wiener entropy — rata2 geometrik/aritmetik periodogram' },
    { id: 'ks', fam: 'C·INFORMASI', name: 'Kolmogorov-Smirnov Normality', credit: 'Kolmogorov 1933, Smirnov 1948' },
    // D — MOMEN & EKOR
    { id: 'jb', fam: 'D·MOMEN/EKOR', name: 'Skew-Kurtosis + Jarque-Bera', credit: 'Jarque & Bera 1980 — JB=n/6(S²+K²/4)' },
    { id: 'hill', fam: 'D·MOMEN/EKOR', name: 'Hill Tail Index', credit: 'Hill 1975 — α̂=k/Σln(x/u)' },
    { id: 'zipf', fam: 'D·MOMEN/EKOR', name: 'Zipf Power-Law Slope', credit: 'Auerbach 1913, Zipf 1949' },
    { id: 'lyap', fam: 'D·MOMEN/EKOR', name: 'Lyapunov Exponent (Rosenstein)', credit: 'Rosenstein et al. 1993 — deteksi chaos' },
    { id: 'dd', fam: 'D·MOMEN/EKOR', name: 'Drawdown & Ulcer Index', credit: 'Martin 1987' },
    // E — SINYAL
    { id: 'period', fam: 'E·SINYAL', name: 'FFT Periodogram Cycle', credit: 'Fourier 1822, Schuster 1898' },
    { id: 'specent', fam: 'E·SINYAL', name: 'Spectral Entropy', credit: 'Shannon spectral entropy' },
    { id: 'haar', fam: 'E·SINYAL', name: 'Haar Wavelet MRA', credit: 'Haar 1910 — energi per skala 2-32 jam' },
    { id: 'hilbert', fam: 'E·SINYAL', name: 'Hilbert Analytic Phase', credit: 'Hilbert 1912, Gabor 1946 — fase/amplitudo instanan' },
    { id: 'fisher', fam: 'E·SINYAL', name: 'Fisher Transform', credit: 'Ehlers 2002 — y=½ln((1+x)/(1−x))' },
    // F — FILTER
    { id: 'kalman', fam: 'F·FILTER', name: 'Kalman Filter Local Trend', credit: 'Kálmán 1960 — state-space level+slope' },
    { id: 'hp', fam: 'F·FILTER', name: 'Hodrick-Prescott Trend-Cycle', credit: 'Hodrick & Prescott 1997 — min Σ(x−τ)²+λΣ(Δ²τ)²' },
    { id: 'cusum', fam: 'F·FILTER', name: 'CUSUM Change-Point', credit: 'Page 1954' },
    { id: 'ss', fam: 'F·FILTER', name: 'Ehlers Super Smoother', credit: 'Ehlers 2013 — filter 2 kutub teredam kritis' },
    { id: 'sg', fam: 'F·FILTER', name: 'Savitzky-Golay Derivative', credit: 'Savitzky & Golay 1964' },
    // G — EKONOFISIKA
    { id: 'diff', fam: 'G·EKONOFISIKA', name: 'Einstein Diffusion Scaling', credit: 'Einstein 1905 — ⟨x²⟩=2Dt, eksponen β' },
    { id: 'markov', fam: 'G·EKONOFISIKA', name: 'Markov Transition Chain', credit: 'Markov 1906' },
    { id: 'lb', fam: 'G·EKONOFISIKA', name: 'Ljung-Box Autocorr Test', credit: 'Ljung & Box 1978 — Q=n(n+2)Σρ̂²/(n−k)' },
    { id: 'er', fam: 'G·EKONOFISIKA', name: 'Kaufman Efficiency Ratio', credit: 'Kaufman 1995' },
    { id: 'chop', fam: 'G·EKONOFISIKA', name: 'Choppiness Index', credit: 'Dreiss — 100·log₁₀(Σ|Δ|/range)/log₁₀(n)' },
    { id: 'granger', fam: 'G·EKONOFISIKA', name: 'Lagged X-Corr vs BTC', credit: 'proxy Granger 1969' },
    // H — PORTOFOLIO
    { id: 'btc', fam: 'H·PORTOFOLIO', name: 'OLS Beta/Alpha vs BTC', credit: 'Sharpe 1964 (CAPM), Markowitz' },
    { id: 'idio', fam: 'H·PORTOFOLIO', name: 'Idiosyncratic Volatility', credit: 'Black-Jensen-Scholes 1972' },
    { id: 'tail', fam: 'H·PORTOFOLIO', name: 'Tail Dependence λL/λU', credit: 'Embrechts et al. — kopula ekor' },
    { id: 'ssratio', fam: 'H·PORTOFOLIO', name: 'Sharpe & Sortino', credit: 'Sharpe 1966, Sortino — annualized √8760' },
    { id: 'iratio', fam: 'H·PORTOFOLIO', name: 'Information Ratio', credit: 'Treynor-Black 1973' },
    { id: 'kelly', fam: 'H·PORTOFOLIO', name: 'Kelly Criterion', credit: 'Kelly 1956 — f*=(μ+σ²/2)/σ²' },
    { id: 'var', fam: 'H·PORTOFOLIO', name: 'Value-at-Risk 95%', credit: 'JP Morgan RiskMetrics 1994' },
    { id: 'mc', fam: 'H·PORTOFOLIO', name: 'Monte Carlo Block-Bootstrap', credit: 'Efron 1979, Künsch 1989 — 2000 lintasan' },
    { id: 'sr', fam: 'H·PORTOFOLIO', name: 'S/R Kernel Clustering', credit: 'k-means 1D atas ekstrema lokal' },
    // I — PASAR
    { id: 'eig', fam: 'I·PASAR', name: 'Correlation Eigen-Spectrum', credit: 'Jacobi 1846 — dekomposisi matriks korelasi top-40' },
    { id: 'mp', fam: 'I·PASAR', name: 'Marchenko-Pastur Bound', credit: 'Marchenko & Pastur 1967 — λ₊=(1+√(N/T))²' },
    { id: 'absorb', fam: 'I·PASAR', name: 'Absorption Ratio', credit: 'Kritzman et al. 2009 — risiko sistemik' },
    { id: 'crosssec', fam: 'I·PASAR', name: 'Breadth-Dispersion-McClellan', credit: 'statistik lintas-seksi klasik' },
    { id: 'mqs', fam: 'I·PASAR', name: 'Market Quality Score v2', credit: 'komposit 4 pilar + klasifikasi regime' },
    // K — REPLAY & VALIDASI
    { id: 'wf', fam: 'K·REPLAY', name: 'Walk-Forward Out-of-Sample', credit: 'validasi mini: momentum in-sample → cek arah 24/48/72j OOS (hit-rate)' },
    // L — PORTOFOLIO PASAR
    { id: 'portb', fam: 'L·PORTO-PASAR', name: 'Basket Long-Short Invers-Vol', credit: 'Markowitz-lite — bobot 1/σ per sisi, vol dari kovarians penuh, net beta' },
    // M — EVENT RADAR
    { id: 'radar', fam: 'M·EVENT', name: 'Event Radar Lintas-Engine', credit: 'pindai ekstrema: squeeze, CUSUM break, innovation shock, skew MC, gagal-OOS' },
    // N — CLUSTER
    { id: 'clust', fam: 'N·CLUSTER', name: 'Cluster Map Average-Linkage', credit: 'agglomerative clustering atas jarak korelasi — deteksi redundansi' },
    // J — META
    { id: 'ens', fam: 'J·META', name: 'Bayesian Inverse-Variance Ensemble', credit: 'Bayes — 16 vote berbobot → logistic p_up' },
    { id: 'fisherc', fam: 'J·META', name: 'Fisher Combined Probability', credit: 'Fisher 1934 — χ²=−2Σln p' },
    { id: 'confw', fam: 'J·META', name: 'Confidence-Weighted Ranking', credit: 'agreement berbobot ×√confidence' },
    { id: 'hist', fam: 'J·META', name: 'Scan-History Delta', credit: 'localStorage — perbandingan rank/skor/arah vs scan sebelumnya' },
  ];

  /* ════════════════════════════════════════════════════════════════
     7. SELF-TEST (dipakai di konsol / Node — tidak aktif di produksi UI)
     ════════════════════════════════════════════════════════════════ */

  function selfTest() {
    const rnd = mulberry32(42);
    const n = 168;
    const mk = (gen) => {
      const p = [100];
      for (let i = 1; i < n; i++) p.push(Math.max(1e-6, p[i - 1] * Math.exp(gen())));
      return p;
    };
    const noise = mk(() => 0.002 * (rnd() * 2 - 1) * Math.sqrt(3));
    const trend = mk(() => 0.0018 + 0.001 * (rnd() * 2 - 1));
    const mr = (() => { // AR(1) level mean-reverting, φ=0.94 → HL≈ln2/−ln0.94≈11.2 jam
      let x = 0; const p = [];
      for (let i = 0; i < n; i++) { x = 0.94 * x + 0.002 * (rnd() * 2 - 1) * Math.sqrt(3); p.push(100 * Math.exp(x)); }
      return p;
    })();
    const sine = (() => {
      const p = [];
      for (let i = 0; i < n; i++) p.push(100 + 5 * Math.sin((2 * Math.PI * i) / 48) + 0.3 * (rnd() * 2 - 1));
      return p;
    })();
    const ctx = (prices) => ({ id: 'x', sym: 'X', prices, chg1h: 0, chg24h: 0, chg7d: 0, volumeUsd: 1e8, mcapUsd: 1e9, btcReturns: null });
    const R = {};
    const bNoise = runCoinEngines(ctx(noise));
    const bTrend = runCoinEngines(ctx(trend));
    const bMR = runCoinEngines(ctx(mr));
    const bSine = runCoinEngines(ctx(sine));
    R.hurstNoise = bNoise.meanRev.hurstRS && bNoise.meanRev.dfa ? (bNoise.meanRev.hurstRS.H + bNoise.meanRev.dfa.H) / 2 : null;
    R.hurstTrend = bTrend.meanRev.hurstRS && bTrend.meanRev.dfa ? (bTrend.meanRev.hurstRS.H + bTrend.meanRev.dfa.H) / 2 : null;
    R.hurstMR = bMR.meanRev.hurstRS && bMR.meanRev.dfa ? (bMR.meanRev.hurstRS.H + bMR.meanRev.dfa.H) / 2 : null;
    R.vrTrend = bTrend.meanRev.vr ? bTrend.meanRev.vr.vr4 : null;
    R.vrMR = bMR.meanRev.vr ? bMR.meanRev.vr.vr4 : null;
    R.ouHLmr = bMR.meanRev.ou ? bMR.meanRev.ou.halfLife : null;
    R.dfTmr = bMR.meanRev.ou ? bMR.meanRev.ou.tStat : null;
    R.dfTtrend = bTrend.meanRev.ou ? bTrend.meanRev.ou.tStat : null;
    R.kalmanTrend = bTrend.filt.kalman ? bTrend.filt.kalman.slopePct : null;
    R.kalmanMR = bMR.filt.kalman ? bMR.filt.kalman.slopePct : null;
    R.hpCycleSineAmp = bSine.filt.hp ? stdev(bSine.filt.hp.cycle) : null;
    R.periodSine = bSine.sig.period ? bSine.sig.period.domPeriod : null;
    R.lzNoise = bNoise.info.lz ? bNoise.info.lz.norm : null;
    R.lbNoise = bNoise.econ.lb ? bNoise.econ.lb.p : null;
    R.lbTrend = bTrend.econ.lb ? bTrend.econ.lb.p : null;
    R.diffBetaTrend = bTrend.econ.diff ? bTrend.econ.diff.beta : null;
    R.garchTrend = bTrend.vol.garch ? bTrend.vol.garch.nextPct : null;
    R.mc = engMonteCarlo([].concat(...Array.from({ length: 167 }, () => [0.001])), 24, 500, 't');
    R.chiSqCheck = { p95_10: chiSqP(18.307, 10) }; // harus ≈ 0.95
    R.jacobiCheck = (() => {
      const A = [[2, 1, 0], [1, 2, 1], [0, 1, 2]];
      const e = jacobiEigen(A);
      return e.values; // harus ≈ [2+√2, 2, 2−√2]
    })();
    return R;
  }

  /* ── Ekspor ── */
  return {
    // utilitas (untuk app.js & testing)
    mean, stdev, median, quantile, mad, corr, ols, clamp,
    normCdf, twoSidedP, chiSqP,
    // engine per koin / pasar / meta
    runCoinEngines, attachMonteCarlo, finalizePopulation, runMarketEngines, metaEnsemble,
    // engine pasar tingkat lanjut (batch 2)
    buildPortfolio, eventRadar, clusterCoins,
    // untuk testing/debug
    engWalkForward, engGarch, engOU,
    // util kecil
    mulberry32, hashSeed, ENGINE_REGISTRY,
    selfTest,
  };
})();

/* kompatibilitas Node (untuk pengujian) */
if (typeof module !== 'undefined' && module.exports) module.exports = QE;
