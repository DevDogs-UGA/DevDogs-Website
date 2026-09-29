import { defineConfig } from 'vitest/config'

// Only the deck's own logic; the workshop submodules have tests of their own.
export default defineConfig({
  test: { include: ['worker/**/*.test.ts', 'theme/**/*.test.ts'] },
})
