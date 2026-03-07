/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    '@ai8future/chassis',
    '@ai8future/config',
    '@ai8future/errors',
    '@ai8future/logger',
    '@ai8future/registry',
    '@ai8future/secval',
    '@ai8future/work',
    '@ai8future/testkit',
  ],
  // Chassis packages are ESM-only (no "require" export condition).
  // Webpack needs the "import" condition for resolution.
  webpack: (config) => {
    if (!config.resolve.conditionNames.includes('import')) {
      config.resolve.conditionNames.unshift('import');
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
