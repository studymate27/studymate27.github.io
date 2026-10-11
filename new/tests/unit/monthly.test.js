import { describe, expect, it } from "vitest";
import { summarizeMonth } from "../../src/domain/monthly.js";

const rec = (date, study, start, bonus = null, dayOff = false) =>
    ({ date, study_done: study, start_done: start, bonus_done: bonus, is_day_off: dayOff });
const opts = (extra = {}) => ({ today: new Date(2026, 10, 30), fineUnit: 500, ...extra });

describe("summarizeMonth", () => {
    // 9/28(월) ~ 10/4(일) 주가 9월과 10월에 걸쳐 있음
    const records = [
        rec("2026-09-29", false, false),       // 9월: 벌점 2
        rec("2026-09-30", true, true, true),   // 9월: 상점 1
        rec("2026-10-01", false, true),        // 10월: 벌점 1
        rec("2026-10-02", false, false, true), // 10월: 벌점 2, 상점 1
        rec("2026-10-03", false, false, null, true), // 10월: Day Off – 제외
    ];

    it("월 경계 주의 기록을 날짜 기준으로 각 달에 나눈다", () => {
        expect(summarizeMonth(records, 2026, 9, opts()))
            .toEqual({ penalty: 2, bonus: 1, net: -1, fine: 500, recordedDays: 2 });
        expect(summarizeMonth(records, 2026, 10, opts()))
            .toEqual({ penalty: 3, bonus: 1, net: -2, fine: 1000, recordedDays: 2 });
    });

    it("상점이 벌점보다 많으면 벌금은 0 (다음 달로 이월하지 않음)", () => {
        const r = [rec("2026-10-01", null, null, true), rec("2026-10-02", null, null, true)];
        expect(summarizeMonth(r, 2026, 10, opts())).toMatchObject({ net: 2, fine: 0 });
        expect(summarizeMonth(r, 2026, 11, opts())).toMatchObject({ net: 0, fine: 0, recordedDays: 0 });
    });

    it("상점을 끄면 상점을 세지 않는다", () => {
        expect(summarizeMonth(records, 2026, 10, opts({ bonusEnabled: false })))
            .toMatchObject({ bonus: 0, net: -3, fine: 1500 });
    });

    it("오늘 이후 날짜는 세지 않는다 (오늘은 포함)", () => {
        expect(summarizeMonth(records, 2026, 10, opts({ today: new Date(2026, 9, 1, 9) })))
            .toMatchObject({ penalty: 1, recordedDays: 1 });
    });
});
