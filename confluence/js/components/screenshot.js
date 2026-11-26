/**
 * components/screenshot.js — tombol "Simpan Gambar Halaman" di paling
 * bawah, memakai html2canvas (bundled lokal di js/vendor/, bukan CDN
 * eksternal, supaya tidak bergantung pada uptime pihak ketiga saat
 * dijalankan dari python -m http.server di jaringan lokal/terbatas).
 *
 * Menangkap `.wrap` (seluruh konten dashboard), TERMASUK saat Mode Ringkas
 * aktif — html2canvas mengikuti computed style, jadi elemen yang di-hide
 * lewat display:none otomatis tidak ikut ter-capture, konsisten dengan apa
 * yang dilihat pengguna di layar saat itu.
 */
import { $ } from '../utils/dom.js';

function buildFilename(){
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `XT-CONF-radar-brief-${stamp}.png`;
}

/**
 * @param {(msg:string) => void} showToast
 */
export function wireScreenshotButton(showToast){
  const btn = $('screenshotBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (typeof html2canvas === 'undefined'){
      showToast('❌ Gagal memuat library screenshot — cek koneksi/file js/vendor/html2canvas.min.js');
      return;
    }

    const target = document.querySelector('.wrap');
    if (!target){
      showToast('❌ Tidak menemukan konten halaman untuk di-screenshot');
      return;
    }

    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span>⏳</span> <span>Exporting…</span>';
    btn.disabled = true;

    try{
      const canvas = await html2canvas(target, {
        backgroundColor: '#0a0c12',
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        logging: false
      });

      canvas.toBlob((blob) => {
        if (!blob){
          showToast('❌ Gagal membuat file gambar');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = buildFilename();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('✓ Gambar PNG tersimpan — siap dibagikan');
      }, 'image/png');
    }catch(err){
      console.error('Screenshot gagal:', err);
      showToast('❌ Gagal membuat screenshot: ' + err.message);
    }finally{
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  });
}
