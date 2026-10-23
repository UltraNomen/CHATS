// QR matrix for otpauth:// enrollment URIs.
import qrcode from 'qrcode-generator';

export function qrMatrix(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount() + 2;
  const cells = [];
  for (let r = -1; r < n - 1; r++) for (let c = -1; c < n - 1; c++) cells.push(r >= 0 && c >= 0 && r < n - 2 && c < n - 2 && q.isDark(r, c));
  return { n, cells };
}
