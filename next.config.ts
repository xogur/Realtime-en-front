import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  reactCompiler: true,
  devIndicators: false,
  serverExternalPackages: ["puppeteer-core", "@aws-sdk/client-s3"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
