import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["node:sqlite", "pg"],
  distDir: process.env.BUILD_OUT || ".next",
  devIndicators: false,
  outputFileTracingExcludes: {
    "/*": [
      "./data/**/*",
      "./outputs/**/*",
      "./work/**/*",
      "./backups/**/*",
      "./test-results/**/*",
    ],
  },
};
export default config;
