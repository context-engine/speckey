import type { Preview } from "@storybook/svelte";

// Import Svelte Flow styles
import "@xyflow/svelte/dist/style.css";

const preview: Preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        backgrounds: {
            default: "light",
            values: [
                { name: "light", value: "#ffffff" },
                { name: "dark", value: "#1a1a1a" },
            ],
        },
        // Full-height layout for diagram stories
        layout: "fullscreen",
    },
};

export default preview;
