// Small helpers shared by the kitchen pages.
export const errMsg = (e: any): string => e?.error?.errors?.[0]?.message || e?.error?.message || 'Something went wrong. Try again.';

// Resizes a photo to at most 1024 px and returns JPEG base64 (less bandwidth, faster analysis).
export function resizeToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1] ?? '');
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}
export const STYLES = `
 :host{display:block;max-width:760px;margin:0 auto;padding:16px}
 h2{margin:0 0 4px} .sub{color:#566a63;font-size:14px;margin:0 0 14px}
 .card{background:#fff;border:1px solid #cbd9d3;border-radius:14px;padding:14px;margin:0 0 12px}
 .row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap} .sp{justify-content:space-between}
 label{display:block;font-size:13px;color:#566a63;margin:6px 0 3px}
 input,select{width:100%;padding:9px 10px;border:1px solid #cbd9d3;border-radius:9px;font:inherit;box-sizing:border-box}
 button{border:0;border-radius:10px;padding:10px 16px;background:#0f5a46;color:#fff;font:inherit;font-weight:600;cursor:pointer}
 button.alt{background:#dcebe5;color:#12231e} button:disabled{opacity:.5}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px} .big{font-size:26px;font-weight:800}
 .tag{font-size:12px;padding:2px 8px;border-radius:99px;background:#dcebe5} .low{background:#b86e00;color:#fff} .ok{background:#1b7a4f;color:#fff} .bad{background:#b3392a;color:#fff}
 .g{color:#1b7a4f} .a{color:#b86e00} .r{color:#b3392a} .note{font-size:12px;color:#566a63}
 .bar{height:12px;border-radius:6px;background:#0f5a46} .track{background:#dcebe5;border-radius:6px}
 .msg{padding:10px 12px;border-radius:10px;background:#dcebe5;margin:0 0 12px} .err{background:#f6d9d4;color:#7a1f14}
`;
