// 주간 장부 화면에 필요한 값을 한 번에 계산한다 (DOM과 무관한 순수 로직)
import { parseDateKey, startOfDay, weekKeyOf } from "../domain/dates.js";
import { computeFineState } from "../domain/fines.js";
import { paidWeekKeysFrom, toWeeksMap } from "../domain/record-adapter.js";
import { computeScoreChain, dayDeltaDisplay, dayOffIndices } from "../domain/scoring.js";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const emptyWeek = () => [null, null, null, null, null, null, null];

/** 체크 칸 순환: 빈칸 → ○(지킴) → X(못 지킴) → 빈칸 */
export function nextCheckValue(value) {
    if (value === null || value === undefined) return true;
    if (value === true) return false;
    return null;
}

/** DB의 can_edit_member와 같은 규칙 – 화면에서 버튼을 잠그는 용도 (실제 차단은 DB가 함) */
export function canEditMember(group, me, targetUserId) {
    if (me.role === "admin") return true;
    return group.edit_mode === "self" && targetUserId === me.userId;
}

export function toDateKey(date) {
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function weekDays(monday) {
    return DAY_LABELS.map((day, i) => {
        const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        return { date, key: toDateKey(date), label: `${date.getMonth() + 1}/${date.getDate()}(${day})` };
    });
}

function formatWon(amount) {
    if (amount < 0) return `-₩${Math.abs(amount).toLocaleString()}`;
    if (amount > 0) return `+₩${amount.toLocaleString()}`;
    return "₩0";
}

/**
 * @param {object} input
 * @param {object} input.group    groups 행
 * @param {Array}  input.members  group_members 행
 * @param {Array}  input.records  daily_records 행 (그룹 전체, 이번 주 일요일까지)
 * @param {Array}  input.payments fine_payments 행
 * @param {Array}  input.targets  member_day_targets 행
 * @param {Date}   input.monday   보고 있는 주의 월요일
 * @param {{userId: string, role: string}} input.me
 */
export function buildLedger({ group, members, records, payments, targets, monday, me, today = new Date(), now = new Date() }) {
    const days = weekDays(monday);
    const weekKey = weekKeyOf(monday);
    const mondayKey = toDateKey(monday);
    const base = startOfDay(today);
    const bonusEnabled = group.bonus_enabled !== false;
    const defaultTarget = String(group.default_start_time ?? "08:40").slice(0, 5);

    const weekEnd = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 18, 0, 0, 0);
    const weekEnded = weekEnd <= now;
    const isAdmin = me.role === "admin";

    const byUser = groupBy(records, r => r.user_id);
    const paymentsByUser = groupBy(payments, p => p.user_id);
    const targetsByUser = groupBy(targets, t => t.user_id);
    const scoreOptions = { today, bonusEnabled };

    const rows = [...members]
        .filter(m => m.start_week <= mondayKey)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(member => {
            const weeksMap = toWeeksMap(byUser.get(member.user_id) ?? []);
            const row = weeksMap[weekKey] ?? {
                study_done_list: emptyWeek(), start_done_list: emptyWeek(), bonus_done_list: emptyWeek(),
                time_done_list: emptyWeek().map(() => false),
            };
            const offs = dayOffIndices(row);
            const startWeekKey = weekKeyOf(parseDateKey(member.start_week));
            const memberPayments = paymentsByUser.get(member.user_id) ?? [];
            const paidWeekKeys = paidWeekKeysFrom(memberPayments);

            const score = computeScoreChain(weekKey, weeksMap, startWeekKey, scoreOptions);
            const fineState = computeFineState(weekKey, weeksMap, startWeekKey, { ...scoreOptions, paidWeekKeys });
            const amount = fineState.unsettledPoints * group.fine_unit;

            const memberTargets = Array(7).fill(defaultTarget);
            for (const t of targetsByUser.get(member.user_id) ?? []) memberTargets[t.weekday] = String(t.start_time).slice(0, 5);

            return {
                userId: member.user_id,
                nickname: member.nickname,
                role: member.role,
                canEdit: canEditMember(group, me, member.user_id),
                targets: memberTargets,
                dayOffIndices: offs,
                days: days.map((day, i) => {
                    const isOff = offs.includes(i);
                    const isFuture = day.date > base;
                    const study = row.study_done_list[i];
                    const start = row.start_done_list[i];
                    const bonus = row.bonus_done_list[i];
                    return {
                        key: day.key, study, start, bonus, isOff, isFuture,
                        score: dayDeltaDisplay(study, start, bonus, isOff, isFuture, bonusEnabled),
                    };
                }),
                score,
                fine: {
                    amount,
                    display: formatWon(amount),
                    tone: amount < 0 ? "is-negative" : amount > 0 ? "is-positive" : "is-zero",
                    settled: fineState.settledThroughTarget,
                    paidThisWeek: memberPayments.some(p => p.settled_through_week === mondayKey),
                    overdue: weekEnded && amount < 0,
                },
            };
        });

    return { days, weekKey, mondayKey, weekEnded, bonusEnabled, canMarkPaid: isAdmin && weekEnded, rows };
}

function groupBy(items, keyOf) {
    const map = new Map();
    for (const item of items ?? []) {
        const key = keyOf(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    }
    return map;
}
