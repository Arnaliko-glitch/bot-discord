const { resolve } = require('node:path');

require('dotenv').config({ path: resolve(__dirname, '../../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@discord-bot-dashboard/shared', '@discord-bot-dashboard/database'],
  output: 'standalone',
};

module.exports = nextConfig;
