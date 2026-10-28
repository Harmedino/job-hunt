import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "mammoth",
  ],
  outputFileTracingIncludes: {
    "/api/applications/*/documents": ["./src/assets/fonts/*.ttf"],
    "/api/resumes/*/export": ["./src/assets/fonts/*.ttf"],
    "/api/resumes/*/readability": ["./src/assets/fonts/*.ttf", "./node_modules/pdf-parse/dist/worker/pdf.worker.mjs", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/resumes/*/pdf": ["./src/assets/fonts/*.ttf"],
    "/api/documents/*": ["./src/assets/fonts/*.ttf"],
    "/api/cv": [
      "./node_modules/pdf-parse/dist/worker/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
  allowedDevOrigins: ["127.0.0.1"],
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
