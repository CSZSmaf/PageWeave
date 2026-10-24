import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({command}) => ({
  plugins: [react(), ...(command === 'serve' ? [{ name: 'local-dev-csp', transformIndexHtml: (html: string) => html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';") }] : [])],
  base: './', server: { host: '127.0.0.1' }, build: { target: 'chrome140' },
}));
