// 월간 현황: 그 달에 속한 날짜만 센다. 주간 정산과 달리 이월은 없다.
import { parseDateKey, startOfDay } from "./dates.js";

/**
 * @param {Array<{date: string, study_done, start_done, bonus_done, is_day_off}>} records 한 멤버의 일 단위 기록
 * @param {number} year
 * @param {number} month 1~12
 * @param {object} options
 * @param {number} options.fineUnit 벌점 1점당 벌금
 * @param {Date} [options.today]
 * @param {boolean} [options.bonusEnabled]
 * @returns {{penalty: number, bonus: number, net: number, fine: number, recordedDays: number}}
 */
export function summarizeMonth(records, year, month, { fineUnit, today = new Date(), bonusEnabled = true }) {
    const base = startOfDay(today);
    let penalty = 0;
    let bonus = 0;
    let recordedDays = 0;

    for (const record of records) {
        const date = parseDateKey(record.date);
        if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue;
        if (date > base || record.is_day_off) continue;

        const dayPenalty = (record.study_done === false ? 1 : 0) + (record.start_done === false ? 1 : 0);
        const dayBonus = bonusEnabled && record.bonus_done === true ? 1 : 0;
        const hasRecord = record.study_done !== null || record.start_done !== null || record.bonus_done === true;

        penalty += dayPenalty;
        bonus += dayBonus;
        if (hasRecord) recordedDays += 1;
    }

    return { penalty, bonus, net: bonus - penalty, fine: Math.max(0, penalty - bonus) * fineUnit, recordedDays };
}
