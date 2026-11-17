import QRCode from './qrcode/index.js';
import QRErrorCorrectLevel from './qrcode/QRErrorCorrectLevel.js';

export function qrSvg(value, size = 280) {
  const qr = new QRCode(0, QRErrorCorrectLevel.M);
  qr.addData(String(value));
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const total = count + quiet * 2;
  const cell = size / total;
  const paths = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        const x = (c + quiet) * cell;
        const y = (r + quiet) * cell;
        paths.push(`M${x.toFixed(2)} ${y.toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR Code de pareamento"><rect width="100%" height="100%" fill="#fff"/><path d="${paths.join('')}" fill="#111"/></svg>`;
}
