import { describe, expect, it } from "vitest";
import { createReturnToStore } from "../../src/application/return-to.js";

const memory = () => {
    const map = new Map();
    return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
};

describe("createReturnToStore", () => {
    it("저장·조회·삭제", () => {
        const store = createReturnToStore(memory(), () => 1000);
        store.save("#/join/AB12CD34");
        expect(store.get()).toBe("#/join/AB12CD34");
        store.clear();
        expect(store.get()).toBeNull();
    });

    it("하루가 지나면 버린다", () => {
        let now = 0;
        const store = createReturnToStore(memory(), () => now);
        store.save("#/join/AB12CD34");
        now = 25 * 60 * 60 * 1000;
        expect(store.get()).toBeNull();
    });

    it("앱 안의 해시 주소만 받는다", () => {
        const store = createReturnToStore(memory(), () => 0);
        store.save("https://evil.example");
        expect(store.get()).toBeNull();
    });

    it("저장소를 쓸 수 없어도 오류 없이 동작한다", () => {
        const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
        const store = createReturnToStore(broken, () => 0);
        store.save("#/groups");
        expect(store.get()).toBeNull();
        store.clear();
    });
});
