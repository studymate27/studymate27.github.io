// 무작위 기록으로 새 계산 로직과 legacy 로직의 결과가 같은지 비교
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as legacy from "../../../legacy/src/domain/scoring.js";
import { computeFineState as legacyFineState } from "../fixtures/legacy-fines.js";
import { computeScoreChain, computeWeekRaw } from "../../src/domain/scoring.js";
import { computeFineState } from "../../src/domain/fines.js";
import { seeded } from "../helpers.js";

const TODAY = new Date(2026, 9, 8, 14, 0); // 2026-10-08(목) – 마지막 주는 일부만 지난 상태
const START = new Date(2026, 6, 6);         // 2026-07-06(월)
const WEEKS = 14;

const keyOf = d => `week_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const weekKeys = Array.from({ length: WEEKS }, (_, i) => {
    const d = new Date(START);
    d.setDate(d.getDate() + i * 7);
    return keyOf(d);
});

function randomMember(rand) {
    const pick = () => [null, true, false][Math.floor(rand() * 3)];
    const map = {};
    const paid = [];
    weekKeys.forEach(wk => {
        if (rand() < 0.1) return; // 기록 없는 주
        const isPaid = rand() < 0.2;
        if (isPaid) paid.push(wk);
        map[wk] = {
            study_done_list: Array.from({ length: 7 }, pick),
            start_done_list: Array.from({ length: 7 }, pick),
            bonus_done_list: Array.from({ length: 7 }, () => (rand() < 0.25 ? true : null)),
            time_done_list: Array.from({ length: 7 }, () => rand() < 0.1),
            Notes: JSON.stringify({ finePaid: isPaid }),
        };
    });
    return { map, paid };
}

describe("legacy와 결과 비교 (무작위 200명 × 14주)", () => {
    beforeAll(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(TODAY);
    });
    afterAll(() => vi.useRealTimers());

    const rand = seeded(20261011);
    const members = Array.from({ length: 200 }, () => randomMember(rand));
    const opts = paid => ({ today: TODAY, paidWeekKeys: paid });

    it("computeWeekRaw", () => {
        members.forEach(({ map }) => weekKeys.forEach(wk => {
            expect(computeWeekRaw(map[wk], wk, opts([]))).toBe(legacy.computeWeekRaw(map[wk], wk));
        }));
    });

    it("computeScoreChain", () => {
        members.forEach(({ map }) => weekKeys.forEach(wk => {
            expect(computeScoreChain(wk, map, weekKeys[0], opts([])))
                .toEqual(legacy.computeScoreChain("x", wk, map, weekKeys[0]));
        }));
    });

    it("computeFineState", () => {
        members.forEach(({ map, paid }) => weekKeys.forEach(wk => {
            expect(computeFineState(wk, map, weekKeys[0], opts(paid)))
                .toEqual(legacyFineState(wk, map, weekKeys[0]));
        }));
    });
});
