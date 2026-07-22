import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * v86 uses node:crypto and node:fs/promises internally,
   * which webpack cannot bundle for the browser.
   * We externalize it completely and load libv86.js via a runtime
   * <script> tag in V86Controller instead.
   */
  webpack: (config) => {
    const externals = Array.isArray(config.externals) ? config.externals : [];
    config.externals = [...externals, 'v86'];
    return config;
  },
};

export default nextConfig;
