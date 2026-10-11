import { describe, expect, it } from "vitest";
import { computeFineState } from "../../src/domain/fines.js";
import { F, N, T, empty, week } from "../helpers.js";

const START = "week_2026-9-21";
const W1 = "week_2026-9-21";
const W2 = "week_2026-9-28";
const W3 = "week_2026-10-5";
const opts = (extra = {}) => ({ today: new Date(2026, 9, 30), ...extra });

const minus2 = week([F, F, N, N, N, N, N], empty(), empty());
const minus1 = week([F, N, N, N, N, N, N], empty(), empty());
const plus1 = week(empty(), empty(), [T, N, N, N, N, N, N]);

describe("computeFineState", () => {
    it("납부 기록이 없으면 시작 주부터 모두 합산한다", () => {
        const map = { [W1]: minus2, [W2]: minus1, [W3]: minus1 };
        expect(computeFineState(W3, map, START, opts()))
            .toEqual({ unsettledPoints: -4, settledThroughTarget: false });
    });

    it("상점이 미납 벌점을 깎는다", () => {
        const map = { [W1]: minus2, [W2]: plus1 };
        expect(computeFineState(W2, map, START, opts()).unsettledPoints).toBe(-1);
    });

    it("이후 주에 납부하면 이전 주도 정산된 것으로 본다", () => {
        const map = { [W1]: minus2, [W2]: minus1, [W3]: minus1 };
        expect(computeFineState(W1, map, START, opts({ paidWeekKeys: [W3] })))
            .toEqual({ unsettledPoints: 0, settledThroughTarget: true });
    });

    it("마지막 납부 이후 주만 미정산으로 합산한다", () => {
        const map = { [W1]: minus2, [W2]: minus1, [W3]: minus1 };
        expect(computeFineState(W3, map, START, opts({ paidWeekKeys: [W1] })))
            .toEqual({ unsettledPoints: -2, settledThroughTarget: false });
    });

    it("상점을 끄면 상점이 벌점을 깎지 않는다", () => {
        const map = { [W1]: minus2, [W2]: plus1 };
        expect(computeFineState(W2, map, START, opts({ bonusEnabled: false })).unsettledPoints).toBe(-2);
    });

    it("시작 주가 없으면 정산할 것이 없다", () => {
        expect(computeFineState(W2, {}, null, opts()))
            .toEqual({ unsettledPoints: 0, settledThroughTarget: false });
    });
});
