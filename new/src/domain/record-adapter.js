// 새 DB의 일 단위 기록(daily_records)을 기존 계산 로직이 쓰는 주간 배열 모양으로 바꾼다.
import { mondayOf, parseDateKey, weekKeyOf } from "./dates.js";

const emptyWeek = () => [null, null, null, null, null, null, null];

/**
 * @param {Array<{date: string, study_done: boolean|null, start_done: boolean|null, bonus_done: boolean|null, is_day_off: boolean}>} records
 * @returns {Record<string, {study_done_list, start_done_list, bonus_done_list, time_done_list}>}
 */
export function toWeeksMap(records) {
    const map = {};
    for (const record of records) {
        const date = parseDateKey(record.date);
        const weekKey = weekKeyOf(mondayOf(date));
        const row = map[weekKey] ??= {
            study_done_list: emptyWeek(),
            start_done_list: emptyWeek(),
            bonus_done_list: emptyWeek(),
            time_done_list: emptyWeek().map(() => false),
        };
        const i = (date.getDay() + 6) % 7;
        row.study_done_list[i] = record.study_done ?? null;
        row.start_done_list[i] = record.start_done ?? null;
        row.bonus_done_list[i] = record.bonus_done ?? null;
        row.time_done_list[i] = record.is_day_off === true;
    }
    return map;
}

/** fine_payments 행들 → 정산된 주 키 목록 */
export function paidWeekKeysFrom(payments) {
    return payments.map(p => weekKeyOf(mondayOf(parseDateKey(p.settled_through_week))));
}
