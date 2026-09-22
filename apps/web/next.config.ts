import type { NextConfig } from "next";

const configuredApiInternalUrl = process.env.API_INTERNAL_URL?.trim();

if (process.env.NODE_ENV === "production" && !configuredApiInternalUrl) {
  throw new Error(
    "API_INTERNAL_URL must be set to the public HTTPS origin of the LedgerApp API in production."
  );
}

const apiInternalUrl = (configuredApiInternalUrl ?? "http://localhost:4000").replace(/\/$/, "");

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
