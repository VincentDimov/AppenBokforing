import type { NextConfig } from "next";

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
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
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
