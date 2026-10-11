import { describe, expect, it } from "vitest";
import { buildLedger, canEditMember, nextCheckValue, toDateKey, weekDays } from "../../src/application/ledger.js";

const MON = new Date(2026, 9, 5); // 2026-10-05(월)
const group = { id: "g", edit_mode: "self", bonus_enabled: true, fine_unit: 500, default_start_time: "08:40:00" };
const members = [
    { user_id: "a", nickname: "에이", role: "admin", sort_order: 0, start_week: "2026-09-28" },
    { user_id: "b", nickname: "비", role: "member", sort_order: 1, start_week: "2026-10-05" },
    { user_id: "late", nickname: "늦게옴", role: "member", sort_order: 2, start_week: "2026-10-12" },
];
const rec = (user_id, date, values) => ({ user_id, date, study_done: null, start_done: null, bonus_done: null, is_day_off: false, ...values });

describe("nextCheckValue", () => {
    it("빈칸 → ○ → X → 빈칸", () => {
        expect(nextCheckValue(null)).toBe(true);
        expect(nextCheckValue(true)).toBe(false);
        expect(nextCheckValue(false)).toBe(null);
    });
});

describe("canEditMember (DB의 can_edit_member와 같은 규칙)", () => {
    it.each([
        ["self", "admin", "a", "b", true],
        ["self", "member", "b", "b", true],
        ["self", "member", "b", "a", false],
        ["admin_only", "admin", "a", "b", true],
        ["admin_only", "member", "b", "b", false],
    ])("%s 모드, %s(%s)가 %s의 기록 → %s", (mode, role, me, target, expected) => {
        expect(canEditMember({ edit_mode: mode }, { userId: me, role }, target)).toBe(expected);
    });
});

describe("toDateKey / weekDays", () => {
    it("DB용 날짜 문자열과 월~일 7일", () => {
        expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
        const days = weekDays(MON);
        expect(days.map(d => d.key)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
        expect(days[0].label).toBe("10/5(월)");
    });
});

describe("buildLedger", () => {
    const base = {
        group, members, monday: MON,
        me: { userId: "b", role: "member" },
        today: new Date(2026, 9, 7, 12), // 수요일
        now: new Date(2026, 9, 7, 12),
        targets: [{ user_id: "b", weekday: 0, start_time: "09:00:00" }],
        payments: [],
    };

    it("이번 주 이후에 들어온 멤버는 숨기고 순서를 지킨다", () => {
        const ledger = buildLedger({ ...base, records: [] });
        expect(ledger.rows.map(r => r.nickname)).toEqual(["에이", "비"]);
    });

    it("요일별 시작 시간은 멤버 설정, 없으면 그룹 기본값", () => {
        const ledger = buildLedger({ ...base, records: [] });
        expect(ledger.rows[1].targets).toEqual(["09:00", "08:40", "08:40", "08:40", "08:40", "08:40", "08:40"]);
        expect(ledger.rows[0].targets[0]).toBe("08:40");
    });

    it("칸마다 값·Day Off·미래 여부·수정 가능 여부를 담는다", () => {
        const ledger = buildLedger({
            ...base,
            records: [rec("b", "2026-10-05", { study_done: false, start_done: true }), rec("b", "2026-10-06", { is_day_off: true })],
        });
        const b = ledger.rows[1];
        expect(b.canEdit).toBe(true);
        expect(ledger.rows[0].canEdit).toBe(false);
        expect(b.days[0]).toMatchObject({ study: false, start: true, bonus: null, isOff: false, isFuture: false, score: { text: "-1" } });
        expect(b.days[1]).toMatchObject({ isOff: true, score: { text: "DAY OFF" } });
        expect(b.days[3]).toMatchObject({ isFuture: true });
        expect(b.dayOffIndices).toEqual([1]);
    });

    it("이월·벌금은 시작 주부터 이어서 계산하고 벌금 단위를 곱한다", () => {
        const ledger = buildLedger({
            ...base,
            records: [
                rec("a", "2026-09-28", { bonus_done: true }),       // 지난주 +1 → 이월
                rec("a", "2026-10-05", { study_done: false, start_done: false }), // 이번 주 -2
            ],
        });
        const a = ledger.rows[0];
        expect(a.score).toEqual({ carryIn: 1, rawChange: -2, final: -1 });
        expect(a.fine).toMatchObject({ amount: -500, display: "-₩500", tone: "is-negative", settled: false });
    });

    it("상점을 끄면 상점이 점수·벌금에서 빠진다", () => {
        const ledger = buildLedger({
            ...base,
            group: { ...group, bonus_enabled: false },
            records: [rec("b", "2026-10-05", { study_done: false, bonus_done: true })],
        });
        expect(ledger.rows[1].fine.amount).toBe(-500);
        expect(ledger.bonusEnabled).toBe(false);
    });

    it("납부는 주가 끝난 뒤(일요일 18시)에만, 방장만 할 수 있다", () => {
        const sundayEvening = new Date(2026, 9, 11, 18, 0);
        const before = buildLedger({ ...base, records: [] });
        expect(before.weekEnded).toBe(false);
        const afterAsMember = buildLedger({ ...base, now: sundayEvening, today: sundayEvening, records: [] });
        expect(afterAsMember.weekEnded).toBe(true);
        expect(afterAsMember.canMarkPaid).toBe(false);
        const afterAsAdmin = buildLedger({ ...base, me: { userId: "a", role: "admin" }, now: sundayEvening, today: sundayEvening, records: [] });
        expect(afterAsAdmin.canMarkPaid).toBe(true);
    });

    it("이번 주 납부 기록이 있으면 정산 완료로 표시한다", () => {
        const ledger = buildLedger({
            ...base,
            records: [rec("b", "2026-10-05", { study_done: false })],
            payments: [{ user_id: "b", settled_through_week: "2026-10-05" }],
        });
        expect(ledger.rows[1].fine).toMatchObject({ settled: true, paidThisWeek: true, amount: 0 });
    });
});
