import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // záložka Môj kalendár bola zrušená – staré odkazy vedú do kalendára / prehľadu
  async redirects() {
    return [
      { source: "/moj-kalendar/prehlad", destination: "/moj-prehlad", permanent: false },
      { source: "/moj-kalendar", destination: "/kalendar", permanent: false },
    ];
  },
};

export default nextConfig;
