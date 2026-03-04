const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const watch = process.argv.includes('--watch');

// Copy the inspector overlay script to dist as-is (vanilla JS, no bundling needed)
const copyOverlayScript = {
  name: 'copy-overlay',
  setup(build) {
    build.onEnd(() => {
      const src = path.join(__dirname, 'src', 'overlay', 'inspector.js');
      const dest = path.join(__dirname, 'dist', 'overlay', 'inspector.js');
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/vscode/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
  plugins: [copyOverlayScript],
};

/** @type {import('esbuild').BuildOptions} */
const cliConfig = {
  entryPoints: ['src/cli.ts'],
  bundle: true,
  outfile: 'dist/cli.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
  plugins: [copyOverlayScript],
};

async function main() {
  if (watch) {
    const [extCtx, cliCtx] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(cliConfig),
    ]);
    await Promise.all([extCtx.watch(), cliCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(cliConfig),
    ]);
    console.log('Build complete.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
