import type { Preview } from "@storybook/html-vite";
import { configure, prettyDOM } from "storybook/test";

// A PCI renders in a shadow root, and testing-library cannot print one: show what is in it when a query fails
configure({
  getElementError: (message, container) => {
    const root = container as unknown as Node;
    const dom =
      root instanceof ShadowRoot
        ? [...root.children].filter((child) => child.tagName !== "STYLE").map((child) => prettyDOM(child, 7000)).join("\n")
        : prettyDOM(container, 7000);
    const error = new Error([message, dom].filter(Boolean).join("\n\n"));
    error.name = "TestingLibraryElementError";
    return error;
  },
});

const preview: Preview = {
  parameters: {
    layout: "padded",
  },
};

export default preview;
