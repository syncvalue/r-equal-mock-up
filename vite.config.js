import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: 'index.html', gmosign: 'gmosign/index.html', honsha: 'honsha/index.html' },
    },
  },
});
