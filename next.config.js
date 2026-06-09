/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Media is streamed through our own route handler, so no remote image config needed.
};

module.exports = nextConfig;
