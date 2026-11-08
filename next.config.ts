import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The slide renderer reads two font files off disk at request time.
  // Next traces imports, not runtime readFile calls, so without this the
  // fonts are left out of the serverless bundle and every slide fails
  // with ENOENT once deployed, while working perfectly in local dev.
  outputFileTracingIncludes: {
    "/api/slide": ["./assets/fonts/**", "./assets/brand/**"],
  },
};

export default nextConfig;
