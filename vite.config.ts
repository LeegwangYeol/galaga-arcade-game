/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { proceduralOgPlugin } from './src/renderer/og/vitePlugin';

export default defineConfig({
  base: './',
  plugins: [proceduralOgPlugin()],
  server: {
    port: 3000,
    host: true,
    open: false,
  },
  preview: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    minify: 'esbuild',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          audio: ['./src/audio/SoundSynth.ts', './src/audio/MusicJingles.ts'],
          bosses: ['./src/core/boss/BossFactory.ts', './src/core/boss/BaseBoss.ts'],
        },
      },
    },
  },
  esbuild: {
    legalComments: 'none',
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
