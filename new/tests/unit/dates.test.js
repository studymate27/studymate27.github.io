import { describe, expect, it } from "vitest";
import { formatDday, getDday, getWeekDates } from "../../src/domain/dates.js";

describe("getDday", () => {
    it("목표일까지 남은 날짜 수를 센다", () => {
        expect(getDday(new Date(2026, 10, 19), new Date(2026, 9, 11))).toBe(39);
    });

    it("시각과 관계없이 날짜 단위로 센다", () => {
        expect(getDday(new Date(2026, 9, 12, 0, 1), new Date(2026, 9, 11, 23, 59))).toBe(1);
    });
});

describe("formatDday", () => {
    it.each([
        [3, "D-3"],
        [0, "D-Day"],
        [-2, "D+2"],
    ])("%i → %s", (days, label) => {
        expect(formatDday(days)).toBe(label);
    });
});

describe("getWeekDates", () => {
    it("월요일부터 일요일까지 7일을 돌려준다", () => {
        const week = getWeekDates(0);
        expect(week).toHaveLength(7);
        expect(week[0].label).toMatch(/\(월\)$/);
        expect(week[6].label).toMatch(/\(일\)$/);
    });
});
