/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/district', destination: '/who-funds', permanent: true },
      { source: '/research', destination: '/influence', permanent: true },
    ];
  },
};
export default nextConfig;
