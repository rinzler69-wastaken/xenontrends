================================================================================
 CRYPTO SCAN QUANTUM v3.1 — 65 Engine Kuantitatif Institusional
 Top 10 Bullish / Top 10 Bearish (Free Algo)
================================================================================

CARA JALANKAN
  1. Ekstrak zip ini ke satu folder.
  2. Buka terminal di folder itu.
  3. Jalankan:
       python -m http.server 8080
  4. Buka browser: http://localhost:8080
  5. Klik "SCAN SEKARANG" (butuh ±10-25 detik — 65 engine × 150 koin).
  6. KLIK KOIN MANA PUN setelah scan → modal berisi HASIL SEMUA 65 ENGINE
     untuk koin itu (metrik, p-value, Monte Carlo, walk-forward, persentil).
  7. SCAN KEDUA dan seterusnya → badge riwayat muncul di tiap koin:
     ▲N = naik N peringkat dari scan sebelumnya, ▼N = turun, ⇄ = arah berubah.

ISI FOLDER
  index.html    markup + section dashboard/matrix/radar/basket/modal
  style.css     tampilan
  app.js        orkestrasi scan 6 fase, skor core v2, render, export TXT/CSV/PNG
  engines.js    PUSTAKA 65 ENGINE KUANTITATIF (pure math, tanpa dependensi)
  README.txt    file ini

FITUR SAVE (aktif setelah scan)
  · 📄 SAVE ALL .TXT  — LAPORAN KUANTITATIF LENGKAP 9 SECTION. Berisi SEMUA
    hasil dari SEMUA 65 engine:
      [1] Market Regime Dashboard — MQS v2 4-pilar, jaringan korelasi
          eigen-spectrum (Jacobi), batas noise Marchenko-Pastur, absorption
          ratio sistemik, breadth/dispersi/McClellan, klasifikasi regime.
      [2] Top 10 Bullish — deep dive per koin: core v2 + ensemble Bayesian +
          Fisher χ² + SEMUA engine per famili (A Volatilitas, B Mean-Reversion,
          C Informasi, D Momen/Ekor, E Sinyal, F Filter, G Ekonofisika,
          H Portofolio, K Walk-Forward) lengkap dengan persentil populasi.
      [3] Top 10 Bearish — sama seperti [2].
      [4] Engine Matrix — distribusi populasi (median/robust-σ/p10..p90)
          + layar khusus (leaders & laggards per engine).
      [5] Event Radar + Basket Long-Short + Cluster Map.
      [6] Lampiran — seluruh koin urut blend skor.
      [7] Perbandingan dengan scan sebelumnya (rank/skor/arah + yang keluar).
      [8] Metodologi — registry lengkap 65 engine + rumus + penemunya.
      [9] Disclaimer & batasan statistik.
  · 📊 SAVE CSV — seluruh koin × 109 kolom metrik engine (siap Excel/Python).
  · 🖼 SAVE IMAGE — PNG 2x siap bagikan ke grup. Logo koin dimuat on-demand.

================================================================================
 65 ENGINE — 14 FAMILI (rumus & penemu)
================================================================================
  CORE  Composite v2 — z-score lintas-populasi 5 komponen (momentum ATR-adj,
        RSI, EMA cross, funding OI-discount, RS vs BTC) + bonus konfluensi +
        penalti exhaustion berbasis deceleration.

  A · VOLATILITAS & REGIME
        GARCH(1,1) MLE (Engle — Nobel 2003 & Bollerslev 1986); Parkinson 1980;
        Garman-Klass 1980; realized vol term-structure 24/72/168j;
        vol-of-vol; Bollinger squeeze & %B; Donchian position; Amihud 2002.

  B · MEAN REVERSION & FRAKTAL
        Ornstein-Uhlenbeck 1930 + half-life ln2/θ; Dickey-Fuller 1979 t-stat;
        Hurst R/S 1951 (Mandelbrot); DFA (Peng et al. 1994); Lo-MacKinlay
        variance ratio 1988; Katz 1988 & Higuchi 1988 fractal dimension;
        level-crossing rate (Rice 1945).

  C · TEORI INFORMASI
        Shannon entropy 1948; permutation entropy (Bandt-Pompe 2002);
        Lempel-Ziv LZ76 1976; spectral flatness (Wiener);
        Kolmogorov-Smirnov normality (Kolmogorov 1933 / Smirnov 1948).

  D · MOMEN TINGGI & EKOR
        Skew/kurtosis + Jarque-Bera 1980; Hill tail index 1975;
        Zipf/Auerbach power-law; Lyapunov exponent (Rosenstein et al. 1993 —
        deteksi chaos); drawdown + Ulcer index (Martin 1987).

  E · SIGNAL PROCESSING
        FFT periodogram (Fourier 1822) + interpolasi parabolik; spectral
        entropy; Haar wavelet MRA 1910; Hilbert analytic signal (Gabor 1946);
        Fisher transform (Ehlers 2002).

  F · STATE-SPACE & FILTER
        Kalman filter local-linear-trend (Kálmán 1960) + innovation monitoring;
        Hodrick-Prescott 1997 (Cholesky per-scan); CUSUM change-point
        (Page 1954); Ehlers Super Smoother 2013; Savitzky-Golay 1964 derivative.

  G · EKONOFISIKA & MEMORY
        Difusi Einstein 1905 (⟨x²⟩=2Dt — eksponen β: super/sub-difusi);
        rantai transisi Markov 1906 + distribusi stasioner; Ljung-Box 1978;
        Kaufman efficiency ratio 1995; Choppiness index; lagged cross-corr
        vs BTC (proxy Granger 1969 — koin "memimpin" BTC?).

  H · PORTOFOLIO & RISIKO
        OLS beta/alpha/R²/t vs BTC (Sharpe 1964 CAPM); idiosyncratic vol
        (Black-Jensen-Scholes); tail dependence λU/λL (Embrechts); Sharpe 1966
        & Sortino annualized; information ratio (Treynor-Black); Kelly
        criterion 1956 f*=(μ+σ²/2)/σ²; VaR 95% parametrik+historis
        (RiskMetrics); Monte Carlo block-bootstrap 2000 lintasan (Efron 1979,
        Künsch 1989); support/resistance kernel clustering (k-means 1D).

  I · PASAR (lintas-koin)
        Eigen-spectrum matriks korelasi top-40 (dekomposisi Jacobi 1846);
        batas noise Marchenko-Pastur 1967 λ₊=(1+√(N/T))²; absorption ratio
        risiko sistemik (Kritzman et al. 2009); breadth/dispersion/skew
        lintas-seksi + McClellan; Market Quality Score v2 (4 pilar) +
        klasifikasi regime (RISK-ON/RISK-OFF/CRISIS/DISPERSI/CHOPPY).

  K · WALK-FORWARD & VALIDASI (baru v3.1)
        Validasi out-of-sample mini per koin: pada checkpoint t=96/120/144,
        momentum 72-jam in-sample dibandingkan dengan pergerakan AKTUAL
        24/48/72 jam sesudahnya (horizon adaptif, min 12 jam). Hit-rate
        0% = momentum koin ini GAGAL terbukti di OOS (anti-momentum),
        100% = terkonfirmasi. Muncul di modal, TXT (famili K·OOS), dan
        Event Radar ("momentum GAGAL/terkonfirmasi di out-of-sample").

  L · PORTO-PASAR (baru v3.1)
        Basket long-short market-neutral dari 6 long + 6 short terbaik:
        bobot invers-volatilitas per sisi (gross 100%+100%), volatilitas
        portofolio dari MATRIKS KOVARIANS PENUH (bukan penjumlahan naif),
        net beta vs BTC, korelasi rata-rata konstituen, VaR95 harian.

  M · EVENT RADAR (baru v3.1)
        Pindai ekstrema lintas semua engine untuk seluruh pasar: funding
        |z|>2 (squeeze/flush), GARCH ratio>1.5 atau <0.7 (expanding/squeeze),
        Bollinger squeeze populasi p10, CUSUM break-point ≤12 jam, Fisher
        ekstrem, Kalman innovation shock >2.5σ, Monte Carlo skew (>75%/25%),
        dan hasil walk-forward. Maks 24 koin paling "berisik".

  N · CLUSTER MAP (baru v3.1)
        Clustering agglomerative average-linkage atas matriks korelasi
        top-40 (threshold 0.72). Koin dalam cluster yang sama = redundan;
        panduan diversifikasi: pilih maksimal satu koin per cluster.

  J · META
        Ensemble Bayesian 16-vote berbobot → fungsi logistik p(skor naik);
        Fisher combined probability 1934 (χ²=−2Σln p, df=2k);
        confidence-weighted ranking √conf;
        delta riwayat scan (localStorage — rank/skor/arah vs scan sebelumnya).

SKOR AKHIR
  blend = 60% ensemble Bayesian + 40% core v2, dikali √confidence saat ranking.
  Klik koin → modal menampilkan drivers utama, sparkline, pita Monte Carlo
  24 jam (P5/P25/P50/P75/P95 + probabilitas naik), dan seluruh 60 engine.

VALIDASI YANG SUDAH DILAKUKAN (data sintetis, lihat test-diag.js &
test-integration.js — jalankan dengan `node test-integration.js`)
  · Jacobi eigen benar eksak (2±√2); CDF chi-square akurat (0.9499994 @p95).
  · GARCH kalibrasi: noise σ1% → long-run 1.0237%/jam ✔
  · Parkinson/GK kalibrasi: 0.9991 / 0.9997 vs teori 1.0 ✔
  · OU: AR(1) φ=0.9 → HL≈5.6j (teori 6.6), DF t=−11 signifikan ✔
  · Hurst: noise 0.49 / tren 0.56 / mean-revert 0.31 ✔
  · VR(4): tren 1.35 vs mean-revert 0.77 ✔; Ljung-Box p benar ✔
  · HP filter: amplitudo siklus sinus terpulihkan 3.53 vs teori 3.54 ✔
  · Walk-forward: checkpoint momentum 2.89σ → OOS +14.6% BENAR ✔
  · Portfolio: sisi long = 100% pas, net beta ≈ 0 ✔
  · Integrasi penuh 60 koin (167 titik, sama dgn data real):
    TXT 9 section tanpa NaN, CSV 109 kolom ✔ (17 checks PASS)
  · Browser real scan: 127 koin × 65 engine dalam 8.9-21.8 detik ✔
  · Bug yang ditemukan & diperbaiki saat uji real: sparkline CoinGecko
    ternyata 167 titik (bukan 168) — walk-forward kini adaptif;
    cache browser — script tag pakai ?v=31 (naikkan saat update file).

BATASAN (WAJIB DIPAHAMI)
  · BUKAN sinyal tervalidasi. Semua engine heuristik; belum di-backtest
    out-of-sample dengan biaya transaksi.
  · Semua estimator dihitung dari 168 titik data (7 hari per-jam) → galat
    sampel besar. Sharpe/Kelly/alpha 7-hari SANGAT noisy — pakai sebagai
    peringkat RELATIF antar koin, bukan estimasi absolut.
  · Market Quality Score merah (contoh: regime CRISIS/HIGH-SYSTEMIC) =
    hindari entry agresif; filter momentum menurun tajam saat breadth <20%.
  · Rate limit CoinGecko gratis — jika gagal, tunggu 60 detik.
  · Selalu DYOR + manajemen risiko (stop loss, position sizing).

DEPLOY KE HOSTING GRATIS (opsional)
  Murni file statis — upload apa adanya ke GitHub Pages / Cloudflare Pages /
  Netlify Drop / Vercel. Tidak perlu build step.

CUSTOMIZE CEPAT
  · Jumlah koin per panel   : app.js → const TOP_N = 10
  · Bobot ensemble/vote     : engines.js → metaEnsemble() (angka bobot 0.03-0.16)
  · Bobot core v2           : app.js → scoreCore() (30/18/10/27/12 + interaksi)
  · Blend ensemble vs core  : app.js → renderResults() → 0.6/0.4
  · Jumlah lintasan Monte Carlo: engines.js → engMonteCarlo(…, 2000, …)
  · Jumlah koin jaringan korelasi: engines.js → runMarketEngines() slice(0, 40)
  · Warna                   : style.css → :root

CATATAN VERSI
  v3.1 — tambahan 5 engine (65 total, 14 famili): K walk-forward
  out-of-sample (validasi mini per koin), L basket long-short invers-vol,
  M event radar lintas-engine, N cluster map average-linkage,
  + delta riwayat scan via localStorage (badge ▲▼⇄ di daftar koin & TXT
  section [7]). Perbaikan: walk-forward adaptif utk sparkline 167 titik;
  cache-bust ?v=31 pada script tag; CSV 107→109 kolom (wfHitRate, wfN);
  TXT 7→9 section. Save All TXT kini ~800 baris / 71 KB per scan.
  v3 (QUANTUM) — penambahan engines.js: 60 engine / 10 famili (GARCH MLE,
  OU+half-life, DF test, Hurst R/S + DFA, variance ratio, fractal dimensions,
  Shannon/permutation/LZ entropy, KS test, Jarque-Bera, Hill tail, Lyapunov,
  FFT + parabolic refine, Haar, Hilbert, Fisher, Kalman, HP, CUSUM,
  Super Smoother, Savitzky-Golay, difusi Einstein, Markov, Ljung-Box,
  Kaufman, Choppiness, Granger proxy, CAPM beta/alpha, tail dependence,
  Sharpe/Sortino/IR, Kelly, VaR, Monte Carlo bootstrap, S/R clustering,
  Jacobi eigen + Marchenko-Pastur + absorption ratio, MQS v2 + regime,
  ensemble Bayesian + Fisher gabungan). app.js: ensemble blend, modal detail
  60 engine per koin, market dashboard, engine matrix, progress 5 fase,
  SAVE ALL .TXT, SAVE CSV. Stablecoin filter diperluas
  (harga ≈$1 + identitas USD). Fitur lama (SAVE IMAGE, methodology, dsb)
  dipertahankan.
  v2 — core composite z-score lintas-populasi + interaksi non-linear.

================================================================================
