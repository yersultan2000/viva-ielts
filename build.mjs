/**
 * Build script. Bundles the React + TypeScript app with esbuild into ./dist,
 * ready for GitHub Pages (relative asset paths, hash routing, .nojekyll).
 *
 *   node build.mjs           production build
 *   node build.mjs --serve   dev server with rebuild on change, http://localhost:5173
 *
 * VIVA_API_URL (optional) bakes a default backend URL into the build. It is a
 * public URL, not a secret. Users can also set or change it in Settings.
 */
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

const serve = process.argv.includes('--serve');

// Minimal .env reader so local builds can set VIVA_API_URL without extra packages.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const options = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  jsx: 'automatic',
  outdir: 'dist/assets',
  entryNames: serve ? '[name]' : '[name]-[hash]',
  minify: !serve,
  sourcemap: serve,
  metafile: true,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(serve ? 'development' : 'production'),
    'import.meta.env.VIVA_API_URL': JSON.stringify(process.env.VIVA_API_URL || ''),
  },
};

async function writeHtml(metafile) {
  const outs = Object.keys(metafile.outputs).map((f) => basename(f));
  const js = outs.find((f) => f.endsWith('.js'));
  const css = outs.find((f) => f.endsWith('.css'));
  if (!js || !css) throw new Error('Build did not produce both a script and a stylesheet.');
  const html = (await readFile('index.html', 'utf8'))
    .replace('<script type="module" src="./src/main.tsx"></script>', `<script type="module" src="./assets/${js}"></script>`)
    .replace('</head>', `  <link rel="stylesheet" href="./assets/${css}" />\n  </head>`);
  await writeFile('dist/index.html', html);
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await writeFile('dist/.nojekyll', '');

if (serve) {
  const ctx = await context({
    ...options,
    plugins: [{ name: 'html', setup: (b) => b.onEnd((r) => (r.metafile ? writeHtml(r.metafile) : undefined)) }],
  });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 5173 });
  console.log(`\nViva is running at http://localhost:${port}\n`);
} else {
  const result = await build(options);
  await writeHtml(result.metafile);
  console.log('Built to ./dist');
}
