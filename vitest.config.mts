import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "test/configs-compat.test.ts"],
    fileParallelism: false,
    setupFiles: ["./test/setup.ts"],
  },
});
