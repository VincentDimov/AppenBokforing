import type { NextConfig } from "next";

import { contentSecurityPolicy } from "./lib/content-security-policy";

const configuredApiInternalUrl = process.env.API_INTERNAL_URL?.trim();

if (process.env.NODE_ENV === "production" && !configuredApiInternalUrl) {
  throw new Error(
    "API_INTERNAL_URL must be set to the public HTTPS origin of the LedgerApp API in production."
  );
}

const apiInternalUrl = (configuredApiInternalUrl ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy(process.env.NODE_ENV)
          }
        ]
      }
    ];
  },
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
