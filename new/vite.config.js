import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    base: "/app/",
    plugins: [tailwindcss()],
    test: {
        include: ["tests/**/*.test.js"],
        coverage: {
            include: ["src/domain/**"],
        },
    },
});
