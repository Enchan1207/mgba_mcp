import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          globals: true,
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          globals: true,
          include: ["src/**/*.integration.test.ts"],
          fileParallelism: false,
          pool: "forks",
        },
      },
    ],
  },
});
