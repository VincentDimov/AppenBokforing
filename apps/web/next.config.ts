import type { NextConfig } from "next";

const apiInternalUrl = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternalUrl}/:path*`
      }
    ];
  }
};

export default nextConfig;
