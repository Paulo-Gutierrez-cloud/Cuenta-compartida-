import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  distDir: process.env.OUTPUT_DIR || ".next",
};

export default nextConfig;
