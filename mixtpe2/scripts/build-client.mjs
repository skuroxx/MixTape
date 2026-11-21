// Builds the browser assets: client/* (readable source, never served) -> public/* (minified + mangled).
// Runs automatically before `next dev` and `next build` (see package.json).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { minify } from 'terser';
import { transform } from 'esbuild';

const src = new URL('../client/', import.meta.url);
const out = new URL('../public/', import.meta.url);
await mkdir(out, { recursive: true });

const prod = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' || process.argv.includes('--prod');

async function js(name, wrap) {
  let code = await readFile(new URL(name, src), 'utf8');
  if (wrap) code = `(()=>{\n${code}\n})();`;   // makes every top-level name local, so it can be mangled
  const r = await minify(code, {
    ecma: 2020,
    compress: { passes: 2, drop_console: prod, pure_getters: true, unsafe_arrows: true },
    mangle: { toplevel: true },
    format: { comments: false, ascii_only: false },
  });
  if (!r.code) throw new Error('terser produced no output for ' + name);
  await writeFile(new URL(name, out), r.code);
  return [code.length, r.code.length];
}
async function css(name) {
  const code = await readFile(new URL(name, src), 'utf8');
  const r = await transform(code, { loader: 'css', minify: true });
  await writeFile(new URL(name, out), r.code);
  return [code.length, r.code.length];
}

const rows = {
  'app.js': await js('app.js', true),
  'amlyrics.js': await js('amlyrics.js', false), // already an IIFE that attaches to window
  'style.css': await css('style.css'),
  'amlyrics.css': await css('amlyrics.css'),
};
for (const [n, [a, b]] of Object.entries(rows)) console.log(`client build  ${n.padEnd(13)} ${(a / 1024).toFixed(1)} KB -> ${(b / 1024).toFixed(1)} KB`);
