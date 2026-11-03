import type { StorybookConfig } from "@storybook/html-vite";
import { tspci } from "./vite-plugin-tspci.ts";

// One Storybook for all examples: each PCI keeps its stories next to its source (tspci-*/src/*.stories.ts).
// TSPCI_STORIES=tspci-likert narrows it to one PCI: `npm run storybook` and `npm run test:stories` in a PCI's folder.
const only = process.env.TSPCI_STORIES;

const config: StorybookConfig = {
  stories: [only ? `../${only}/src/**/*.stories.ts` : "../tspci-*/src/**/*.stories.ts"],
  addons: ["@storybook/addon-vitest"],
  framework: "@storybook/html-vite",
  viteFinal: async (config) => {
    config.plugins = [...(config.plugins ?? []), tspci()];
    return config;
  },
};

export default config;
