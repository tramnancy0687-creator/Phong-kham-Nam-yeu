/** @type {import('next').NextConfig} */
const nextConfig = {
  // Chuyển /api/* sang server Node.js → trình duyệt gọi cùng origin, không cần CORS
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL || 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
