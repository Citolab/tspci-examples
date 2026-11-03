import { defineConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";

// npm test: every story's play function, in Chromium
export default defineConfig({
  // VITE_CACHE_DIR: a cache of its own, for test runs side by side
  cacheDir: process.env.VITE_CACHE_DIR ?? "node_modules/.vite",
  test: {
    projects: [
      {
        extends: true,
        plugins: [storybookTest({ configDir: ".storybook" })],
        test: {
          name: "storybook",
          // the 3D examples each start WebGL and animate: too many files at once and their stories time out
          maxWorkers: 4,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
