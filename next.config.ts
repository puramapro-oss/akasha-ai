import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"
import path from "path"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const nextConfig: NextConfig = {
  transpilePackages: ["@purama/smarana", "@purama/entraide"],
  experimental: {
    externalDir: true,
  },
  outputFileTracingRoot: path.join(__dirname, ".."),
  turbopack: {
    root: path.join(__dirname, ".."),
    resolveAlias: {
      "@purama/entraide": "../packages/purama-entraide/src/index.ts",
    },
  },
}

export default withNextIntl(nextConfig)
