/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@discord-bot-dashboard/shared', '@discord-bot-dashboard/database'],
  output: 'standalone',
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
