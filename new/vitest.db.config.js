// DB 권한 테스트: 로컬 Supabase(`npx supabase start`)가 떠 있어야 한다. `npm run test:db`
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/db/**/*.test.js"],
        fileParallelism: false,
        testTimeout: 20000,
        hookTimeout: 60000,
    },
});
