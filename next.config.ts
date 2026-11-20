import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd()),
  serverExternalPackages: [
    'coze-coding-dev-sdk',
    'mammoth',
    'pdf-parse',
    'word-extractor',
  ],
  webpack: (config, { dev }) => {
    if (dev && config.cache && config.cache.type === 'filesystem') {
      config.cache.cacheDirectory = path.resolve(
        'node_modules/.cache/next-webpack',
      );
    }
    return config;
  },
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
