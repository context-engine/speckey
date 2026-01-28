import type { StorybookConfig } from "@storybook/svelte-vite";

const config: StorybookConfig = {
    stories: ["../src/**/*.stories.@(js|ts|svelte)"],
    addons: ["@storybook/addon-essentials"],
    framework: {
        name: "@storybook/svelte-vite",
        options: {},
    },
    docs: {
        autodocs: "tag",
    },
};

export default config;
