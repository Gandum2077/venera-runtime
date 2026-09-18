import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/configs-compat.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
