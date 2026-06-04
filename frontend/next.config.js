/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this app so Next doesn't infer it from a stray
  // lockfile higher up the tree (this is a self-contained app, not a monorepo).
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
