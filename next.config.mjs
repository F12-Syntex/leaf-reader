/** @type {import('next').NextConfig} */
const nextConfig = {
  /* pin the workspace root explicitly — an unrelated lockfile up the directory
     tree (C:\Users\synte\package-lock.json) otherwise makes Next.js guess wrong */
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
