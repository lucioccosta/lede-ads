import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Lab LAN / acesso por IP no modo dev (senão o Next bloqueia chunks/_next)
  allowedDevOrigins: ["192.168.10.142", "localhost", "127.0.0.1"],
};

export default nextConfig;
