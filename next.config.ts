import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // TypeScript errors are NOT ignored — failing the build on type
  // errors is intentional. ESLint runs separately via `npm run lint`.
};

export default nextConfig;
