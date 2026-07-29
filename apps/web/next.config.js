/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@discord-bot-dashboard/shared', '@discord-bot-dashboard/database'],
  output: 'standalone',
};

module.exports = nextConfig;
