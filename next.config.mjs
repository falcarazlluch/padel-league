/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Lint runs separately via `pnpm lint` and CI; tseslint's projectService
  // emits parsing errors during `next build` for worker files that live in a
  // separate tsconfig (tsconfig.worker.json), which Next treats as fatal.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
