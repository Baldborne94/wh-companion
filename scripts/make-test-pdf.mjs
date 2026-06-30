// Generates a minimal, valid 2-page PDF fixture for the E2E reader test.
// Run: node scripts/make-test-pdf.mjs  → writes e2e/fixtures/test-book.pdf
//
// The PdfReader rasterises pages to <canvas>, so the test asserts on the reader
// chrome (the "1 / 2" page counter) rather than text — a 2-page document proves
// pdf.js parsed the file and read its page count.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../e2e/fixtures/test-book.pdf');

const stream = (text) => `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
const s1 = stream('Page One');
const s2 = stream('Page Two');

// Object bodies, 1-indexed by position (obj N is objects[N-1]).
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R /Resources << /Font << /F1 6 0 R >> >> >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 7 0 R /Resources << /Font << /F1 6 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(s1)} >>\nstream\n${s1}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(s2)} >>\nstream\n${s2}\nendstream`,
];

let pdf = '%PDF-1.4\n';
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});

const xrefOffset = Buffer.byteLength(pdf);
const pad = (n) => String(n).padStart(10, '0');
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += '0000000000 65535 f \n';
offsets.forEach((o) => { pdf += `${pad(o)} 00000 n \n`; });
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, pdf, 'latin1');
console.log('wrote', OUT, Buffer.byteLength(pdf), 'bytes; pages: 2');
