/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  images: {
    // Local images in /public are served without any domain config.
    // Add remote hostnames here if you ever pull images from external URLs.
    formats: ['image/webp', 'image/avif'],
  },
};

module.exports = nextConfig;
