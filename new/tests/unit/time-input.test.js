import { describe, expect, it } from "vitest";
import { formatTimeTyping, normalizeTimeText } from "../../src/domain/time-input.js";

describe("normalizeTimeText (legacy pickers.js와 동일)", () => {
    it.each([
        ["9", "09:00"], ["09", "09:00"], ["930", "09:30"], ["0930", "09:30"], ["9:5", "09:50"],
        ["13:00", "13:00"], ["25:99", "23:59"], ["", "08:40"], ["abc", "08:40"],
    ])("%s → %s", (input, expected) => {
        expect(normalizeTimeText(input)).toBe(expected);
    });
});

describe("formatTimeTyping", () => {
    it.each([["0", "0"], ["09", "09"], ["093", "09:3"], ["0930", "09:30"], ["0977", "09:59"], ["29", "23"]])("%s → %s", (input, expected) => {
        expect(formatTimeTyping(input)).toBe(expected);
    });
});
