// Produce a single self-contained HTML file by inlining styles.css and app.js
// into index.html. No dependencies. Run with: node build.js
//
// Output: standalone.html in the project root. You can email this file to
// yourself and open it directly in a mobile browser.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const htmlPath = path.join(ROOT, 'index.html');
const cssPath = path.join(ROOT, 'styles.css');
const jsPath = path.join(ROOT, 'app.js');
const vocabJsPath = path.join(ROOT, 'data', 'vocab-data.js');
const outPath = path.join(ROOT, 'standalone.html');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const vocabJs = fs.existsSync(vocabJsPath) ? fs.readFileSync(vocabJsPath, 'utf8') : '';

// Escape </script> inside the embedded JS so it doesn't prematurely close the tag.
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');
const safeVocabJs = vocabJs.replace(/<\/script>/gi, '<\\/script>');

let out = html
  .replace(
    /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?\s*>/,
    `<style>\n${css}\n</style>`
  )
  .replace(
    /<script\s+src="data\/vocab-data\.js">\s*<\/script>/,
    vocabJs ? `<script>\n${safeVocabJs}\n</script>` : ''
  )
  .replace(
    /<script\s+src="app\.js">\s*<\/script>/,
    `<script>\n${safeJs}\n</script>`
  );

if (out.includes('href="styles.css"') || out.includes('src="app.js"')) {
  console.error('build.js: failed to inline one or more files.');
  console.error('  Check that index.html still references styles.css and app.js by their exact names.');
  process.exit(1);
}

fs.writeFileSync(outPath, out);
const kb = (out.length / 1024).toFixed(1);
console.log(`Wrote standalone.html (${kb} KB). You can email or transfer this single file.`);
