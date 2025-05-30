import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  allowedDevOrigins: [`${process.env.AUTH_URL}`],
  reactStrictMode: false,
};

export default nextConfig;
