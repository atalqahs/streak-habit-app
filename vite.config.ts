/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Recursively lists files in a directory as POSIX paths relative to it. */
function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listFiles(full).map((f) => `${name}/${f}`);
    return [name];
  });
}

/**
 * Emits a dependency-free service worker that precaches the full app shell.
 * The cache version is a hash of every precached URL and file content, so each
 * deploy that changes anything gets a fresh cache and stale caches are removed.
 */
function serviceWorker(): Plugin {
  return {
    name: 'habits-service-worker',
    apply: 'build',
    enforce: 'post',
    // writeBundle sees every emitted file (JS, CSS, HTML), unlike generateBundle.
    writeBundle(options, bundle) {
      const outDir = options.dir!;
      const publicDir = join(process.cwd(), 'public');
      // Splash screens are captured by iOS at install time, so they are not precached.
      const publicFiles = listFiles(publicDir).filter((f) => !f.startsWith('.') && !f.includes('splash-'));
      const files = ['./', ...Object.keys(bundle).filter((f) => f !== 'index.html'), ...publicFiles]
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .map((f) => (f === './' ? f : `./${f}`));
      const hash = createHash('sha256').update(files.join('\n'));
      for (const chunk of Object.values(bundle)) hash.update('code' in chunk ? chunk.code : chunk.source);
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(join(process.cwd(), 'src/sw-template.js'), 'utf8');
      writeFileSync(
        join(outDir, 'sw.js'),
        template
          .replace('__VERSION__', JSON.stringify(version))
          .replace('__PRECACHE__', JSON.stringify(files)),
      );
    },
  };
}

export default defineConfig({
  // Relative base keeps every asset, the manifest and the service worker scope
  // correct on GitHub Pages project sites (/<repo>/) and on custom domains.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
  },
  plugins: [react(), serviceWorker()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    modulePreload: false,
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
