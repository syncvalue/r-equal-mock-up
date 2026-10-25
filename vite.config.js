import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: 'index.html', tablet: 'tablet/index.html', gmosign: 'gmosign/index.html', honsha: 'honsha/index.html', accounting: 'accounting/index.html', warehouse: 'warehouse/index.html', callcenter: 'callcenter/index.html', master: 'master/index.html' }, // トップ（index.html）は画面一覧
    },
  },
});
