import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Read environment variables from the repo root `.env`
  const env = loadEnv(mode, '..', '');

  const devPort = Number(env.VITE_DEV_SERVER_PORT) || 3000;
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5000';

  return {
    envDir: '..',
    plugins: [react()],
    server: {
      port: devPort,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});
