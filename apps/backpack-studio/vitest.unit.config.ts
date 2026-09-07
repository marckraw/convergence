import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    include: ['src/**/*.unit.test.tsx'],
    environment: 'jsdom',
    restoreMocks: true,
  },
})
