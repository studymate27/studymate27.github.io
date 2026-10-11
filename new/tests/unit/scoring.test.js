import { describe, expect, it } from "vitest";
import { computeScoreChain, computeWeekRaw, dayDelta, dayDeltaDisplay } from "../../src/domain/scoring.js";
import { F, N, T, empty, week } from "../helpers.js";

// 2026-10-05(월) 주차. 기준일은 그다음 주라 7일 모두 과거.
const WK = "week_2026-10-5";
const AFTER = { today: new Date(2026, 9, 14) };

describe("dayDelta", () => {
    it.each([
        [[N, N, N, false], 0],
        [[F, N, N, false], -1],
        [[N, F, N, false], -1],
        [[F, F, N, false], -2],
        [[T, T, T, false], 1],
        [[F, F, T, false], -1],
        [[F, F, T, true], 0],
    ])("%j → %i", (args, expected) => {
        expect(dayDelta(...args)).toBe(expected);
    });

    it("상점을 끄면 상점이 반영되지 않는다", () => {
        expect(dayDelta(T, T, T, false, false)).toBe(0);
        expect(dayDelta(F, N, T, false, false)).toBe(-1);
    });
});

describe("dayDeltaDisplay", () => {
    it("상점을 끄면 상점만 있는 날은 '-'로 보인다", () => {
        expect(dayDeltaDisplay(N, N, T, false, false).text).toBe("+1");
        expect(dayDeltaDisplay(N, N, T, false, false, false).text).toBe("-");
    });
});

describe("computeWeekRaw", () => {
    it("7일 점수를 합산한다", () => {
        const row = week([F, T, T, T, T, T, T], [T, F, T, T, T, T, T], [N, N, T, N, N, N, N]);
        expect(computeWeekRaw(row, WK, AFTER)).toBe(-1);
    });

    it("Day Off 날은 제외한다", () => {
        const row = week([F, F, T, T, T, T, T], empty(), empty(), [0]);
        expect(computeWeekRaw(row, WK, AFTER)).toBe(-1);
    });

    it("오늘 이후 날짜는 제외한다 (오늘은 포함)", () => {
        const row = week([F, F, F, F, F, F, F], empty(), empty());
        expect(computeWeekRaw(row, WK, { today: new Date(2026, 9, 7, 15, 0) })).toBe(-3);
    });

    it("행이 없으면 0", () => {
        expect(computeWeekRaw(null, WK, AFTER)).toBe(0);
    });

    it("상점을 끄면 상점이 합산되지 않는다", () => {
        const row = week(empty(), empty(), [T, T, N, N, N, N, N]);
        expect(computeWeekRaw(row, WK, { ...AFTER, bonusEnabled: false })).toBe(0);
    });
});

describe("computeScoreChain", () => {
    const today = { today: new Date(2026, 9, 30) };
    const minus2 = week([F, F, N, N, N, N, N], empty(), empty());
    const plus3 = week(empty(), empty(), [T, T, T, N, N, N, N]);

    it("벌점(음수)은 다음 주로 이월하지 않는다", () => {
        const map = { "week_2026-10-5": minus2, "week_2026-10-12": plus3 };
        expect(computeScoreChain("week_2026-10-12", map, "week_2026-10-5", today))
            .toEqual({ carryIn: 0, rawChange: 3, final: 3 });
    });

    it("상점(양수)은 다음 주로 이월한다", () => {
        const map = { "week_2026-10-5": plus3, "week_2026-10-12": minus2 };
        expect(computeScoreChain("week_2026-10-12", map, "week_2026-10-5", today))
            .toEqual({ carryIn: 3, rawChange: -2, final: 1 });
    });

    it("시작 주가 없으면 0", () => {
        expect(computeScoreChain("week_2026-10-12", {}, null, today))
            .toEqual({ carryIn: 0, rawChange: 0, final: 0 });
    });
});
