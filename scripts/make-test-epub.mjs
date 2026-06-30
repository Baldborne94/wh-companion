// Generates a minimal, valid EPUB fixture for E2E reader tests.
// Run: node scripts/make-test-epub.mjs  → writes e2e/fixtures/test-book.epub
import JSZip from 'jszip';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../e2e/fixtures/test-book.epub');

const CHAPTER_PHRASE = 'In the grim darkness of the far future there is only war.';

const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:e2e-test-book-0001</dc:identifier>
    <dc:title>E2E Test Tome</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`;

const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc"><ol><li><a href="chapter1.xhtml">Chapter One</a></li></ol></nav>
  </body>
</html>`;

const chapter1 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter One</title></head>
  <body>
    <h1>Chapter One</h1>
    <p>${CHAPTER_PHRASE}</p>
  </body>
</html>`;

const zip = new JSZip();
// mimetype must be the first entry and stored uncompressed per the EPUB spec.
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
zip.file('META-INF/container.xml', container);
zip.file('OEBPS/content.opf', opf);
zip.file('OEBPS/nav.xhtml', nav);
zip.file('OEBPS/chapter1.xhtml', chapter1);

const buf = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log('wrote', OUT, buf.length, 'bytes; phrase:', CHAPTER_PHRASE);
