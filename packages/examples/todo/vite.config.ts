import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@share': path.resolve(import.meta.dirname, '../.share')
    }
  }
});