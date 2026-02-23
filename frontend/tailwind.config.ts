import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "node-source": "var(--node-source)",
        "node-pattern": "var(--node-pattern)",
        "node-cep-pattern": "var(--node-cep-pattern)",
        "node-transform": "var(--node-transform)",
        "node-sink": "var(--node-sink)",
      },
      borderColor: {
        "node-source": "var(--node-source)",
        "node-pattern": "var(--node-pattern)",
        "node-transform": "var(--node-transform)",
        "node-sink": "var(--node-sink)",
      },
    },
  },
  plugins: [],
};

export default config;
