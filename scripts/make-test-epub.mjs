// Generates a minimal, valid EPUB fixture for E2E reader tests.
// Run: node scripts/make-test-epub.mjs  → writes e2e/fixtures/test-book.epub
//
// Two chapters so TOC navigation is observable: jumping to chapter two swaps the
// rendered text. CHAPTER_ONE_PHRASE / CHAPTER_TWO_PHRASE are mirrored in the specs.
import JSZip from 'jszip';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../e2e/fixtures/test-book.epub');

const CHAPTER_ONE_PHRASE = 'In the grim darkness of the far future there is only war.';
const CHAPTER_TWO_PHRASE = 'Only in death does duty end, brother.';

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
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;

const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <ol>
        <li><a href="chapter1.xhtml">Chapter One</a></li>
        <li><a href="chapter2.xhtml">Chapter Two</a></li>
      </ol>
    </nav>
  </body>
</html>`;

const chapter = (title, phrase) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${title}</title></head>
  <body>
    <h1>${title}</h1>
    <p>${phrase}</p>
  </body>
</html>`;

const zip = new JSZip();
// mimetype must be the first entry and stored uncompressed per the EPUB spec.
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
zip.file('META-INF/container.xml', container);
zip.file('OEBPS/content.opf', opf);
zip.file('OEBPS/nav.xhtml', nav);
zip.file('OEBPS/chapter1.xhtml', chapter('Chapter One', CHAPTER_ONE_PHRASE));
zip.file('OEBPS/chapter2.xhtml', chapter('Chapter Two', CHAPTER_TWO_PHRASE));

const buf = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log('wrote', OUT, buf.length, 'bytes');
console.log('  ch1:', CHAPTER_ONE_PHRASE);
console.log('  ch2:', CHAPTER_TWO_PHRASE);
