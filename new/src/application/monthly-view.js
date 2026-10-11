// 월간 현황 화면 값 – 그 달 날짜만 세고 이월은 없다 (주간 정산과 별개의 요약)
import { mondayOf, startOfDay } from "../domain/dates.js";
import { summarizeMonth } from "../domain/monthly.js";
import { toDateKey } from "./ledger.js";

export function monthRange(year, month) {
    const lastDate = new Date(year, month, 0);
    return {
        first: toDateKey(new Date(year, month - 1, 1)),
        last: toDateKey(lastDate),
        lastMonday: toDateKey(mondayOf(lastDate)),
    };
}

/**
 * status: "paid"(그 달 마지막 주까지 정산) | "unpaid" | "none"(낼 벌금 없음)
 */
export function buildMonthly({ group, members, records, payments, year, month, today = new Date() }) {
    const { first, last, lastMonday } = monthRange(year, month);
    const bonusEnabled = group.bonus_enabled !== false;

    const rows = [...members]
        .filter(m => m.start_week <= last)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(member => {
            const mine = records.filter(r => r.user_id === member.user_id);
            const summary = summarizeMonth(mine, year, month, { fineUnit: group.fine_unit, today, bonusEnabled });
            const paid = payments.some(p => p.user_id === member.user_id && p.settled_through_week >= lastMonday);
            return {
                userId: member.user_id,
                nickname: member.nickname,
                ...summary,
                status: summary.fine === 0 ? "none" : paid ? "paid" : "unpaid",
            };
        });

    const total = rows.reduce((sum, r) => ({
        penalty: sum.penalty + r.penalty, bonus: sum.bonus + r.bonus, fine: sum.fine + r.fine,
    }), { penalty: 0, bonus: 0, fine: 0 });

    return { year, month, first, last, bonusEnabled, inProgress: startOfDay(today) <= new Date(year, month - 1, Number(last.slice(8))), rows, total };
}
