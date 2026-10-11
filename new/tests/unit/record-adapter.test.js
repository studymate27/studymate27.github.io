import { describe, expect, it } from "vitest";
import { paidWeekKeysFrom, toWeeksMap } from "../../src/domain/record-adapter.js";
import { computeFineState } from "../../src/domain/fines.js";

const rec = (date, study, start, bonus = null, dayOff = false) =>
    ({ date, study_done: study, start_done: start, bonus_done: bonus, is_day_off: dayOff });

describe("toWeeksMap", () => {
    it("일 단위 기록을 주(월~일) 단위 7칸 배열로 모은다", () => {
        const map = toWeeksMap([
            rec("2026-10-05", false, true),          // 월
            rec("2026-10-11", true, null, true),     // 일
            rec("2026-10-07", null, null, null, true), // 수 Day Off
        ]);
        expect(Object.keys(map)).toEqual(["week_2026-10-5"]);
        const row = map["week_2026-10-5"];
        expect(row.study_done_list).toEqual([false, null, null, null, null, null, true]);
        expect(row.start_done_list).toEqual([true, null, null, null, null, null, null]);
        expect(row.bonus_done_list).toEqual([null, null, null, null, null, null, true]);
        expect(row.time_done_list).toEqual([false, false, true, false, false, false, false]);
    });

    it("월 경계에 걸친 주는 한 주로 묶는다", () => {
        const map = toWeeksMap([rec("2026-09-30", false, null), rec("2026-10-02", false, null)]);
        expect(Object.keys(map)).toEqual(["week_2026-9-28"]);
    });

    it("빈 목록이면 빈 객체", () => {
        expect(toWeeksMap([])).toEqual({});
    });
});

describe("paidWeekKeysFrom", () => {
    it("정산 주(settled_through_week)를 주 키로 바꾼다 – 주 중간 날짜도 그 주 월요일로", () => {
        expect(paidWeekKeysFrom([
            { settled_through_week: "2026-09-28" },
            { settled_through_week: "2026-10-08" },
        ])).toEqual(["week_2026-9-28", "week_2026-10-5"]);
    });

    it("새 모델 납부 기록으로도 legacy와 같은 정산 의미를 갖는다", () => {
        const records = [
            rec("2026-09-21", false, false),
            rec("2026-09-28", false, null),
            rec("2026-10-05", false, null),
        ];
        const options = { today: new Date(2026, 9, 30), paidWeekKeys: paidWeekKeysFrom([{ settled_through_week: "2026-09-28" }]) };
        const map = toWeeksMap(records);
        // 9/28 주에 납부 → 9/21 주는 정산됨
        expect(computeFineState("week_2026-9-21", map, "week_2026-9-21", options).settledThroughTarget).toBe(true);
        // 10/5 주는 납부 이후라 미정산
        expect(computeFineState("week_2026-10-5", map, "week_2026-9-21", options).unsettledPoints).toBe(-1);
    });
});
