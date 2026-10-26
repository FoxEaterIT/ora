import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "src-tauri/target/**",
      "src/generated/prisma/**",
      "scripts/export-uninstall-data.cjs",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
