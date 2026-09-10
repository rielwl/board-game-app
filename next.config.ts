import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // BoardGameGeek serves game art from these hosts. Remote images are optional:
  // the UI always degrades to a text-only tile when an image fails to load.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cf.geekdo-images.com' },
      { protocol: 'https', hostname: 'images.geekdo.com' },
    ],
  },
  serverExternalPackages: ['@prisma/client'],
};

export default nextConfig;
