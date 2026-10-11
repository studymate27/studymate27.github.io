import { describe, expect, it } from "vitest";
import { buildMonthly, monthRange } from "../../src/application/monthly-view.js";

const group = { bonus_enabled: true, fine_unit: 500 };
const members = [
    { user_id: "a", nickname: "에이", role: "admin", sort_order: 0, start_week: "2026-09-28" },
    { user_id: "b", nickname: "비", role: "member", sort_order: 1, start_week: "2026-10-05" },
    { user_id: "late", nickname: "다음달", role: "member", sort_order: 2, start_week: "2026-11-02" },
];
const rec = (user_id, date, v) => ({ user_id, date, study_done: null, start_done: null, bonus_done: null, is_day_off: false, ...v });

describe("monthRange", () => {
    it("그 달의 첫날·마지막날, 마지막 날이 속한 주의 월요일", () => {
        expect(monthRange(2026, 10)).toEqual({ first: "2026-10-01", last: "2026-10-31", lastMonday: "2026-10-26" });
        expect(monthRange(2026, 2)).toEqual({ first: "2026-02-01", last: "2026-02-28", lastMonday: "2026-02-23" });
    });
});

describe("buildMonthly", () => {
    const today = new Date(2026, 10, 15);
    const records = [
        rec("a", "2026-10-01", { study_done: false, start_done: false }),
        rec("a", "2026-10-02", { bonus_done: true }),
        rec("b", "2026-10-06", { study_done: false }),
    ];

    it("그 달에 시작한 멤버까지 보여주고 합계를 낸다", () => {
        const view = buildMonthly({ group, members, records, payments: [], year: 2026, month: 10, today });
        expect(view.rows.map(r => r.nickname)).toEqual(["에이", "비"]);
        expect(view.rows[0]).toMatchObject({ penalty: 2, bonus: 1, net: -1, fine: 500, status: "unpaid" });
        expect(view.rows[1]).toMatchObject({ penalty: 1, fine: 500 });
        expect(view.total).toEqual({ penalty: 3, bonus: 1, fine: 1000 });
    });

    it("마지막 주까지 정산 기록이 있으면 정산 완료, 벌금이 없으면 해당 없음", () => {
        const view = buildMonthly({
            group, members, records: [...records, rec("b", "2026-10-07", { bonus_done: true })],
            payments: [{ user_id: "a", settled_through_week: "2026-11-02" }],
            year: 2026, month: 10, today,
        });
        expect(view.rows[0].status).toBe("paid");
        expect(view.rows[1]).toMatchObject({ fine: 0, status: "none" });
    });

    it("상점을 끄면 상점 열 없이 계산", () => {
        const view = buildMonthly({ group: { ...group, bonus_enabled: false }, members, records, payments: [], year: 2026, month: 10, today });
        expect(view.bonusEnabled).toBe(false);
        expect(view.rows[0]).toMatchObject({ bonus: 0, fine: 1000 });
    });

    it("아직 끝나지 않은 달은 진행 중으로 표시", () => {
        expect(buildMonthly({ group, members, records, payments: [], year: 2026, month: 11, today }).inProgress).toBe(true);
        expect(buildMonthly({ group, members, records, payments: [], year: 2026, month: 10, today }).inProgress).toBe(false);
    });
});
