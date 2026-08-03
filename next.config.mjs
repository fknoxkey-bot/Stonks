import createMDX from '@next/mdx';

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'mdx'],
  // better-sqlite3 is a native module — never let the bundler touch it.
  serverExternalPackages: ['better-sqlite3'],
};

export default withMDX(nextConfig);
