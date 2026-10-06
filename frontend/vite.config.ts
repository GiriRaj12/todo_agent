import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const target = process.env.BACKEND_URL ?? 'http://localhost:3000';

const proxy = {
  '/api': { target, changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy }, // npm run dev
  preview: { proxy, host: true, port: 8080 },
  test: {
    globals: true, // Enables global describe, it, expect, vi, etc.
    environment: 'jsdom',
  },
});