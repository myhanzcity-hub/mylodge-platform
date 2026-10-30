import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
 webpack(config, { webpack }) {
  config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^cloudflare:workers$/, path.resolve("lib/server/cloudflare-stub.ts")));
  return config;
 },
 async rewrites() { return process.env.MYLODGE_RUNTIME === "vercel" ? [{source:"/signin-with-chatgpt",destination:"/api/preview-session"}] : []; }
};
export default config;
