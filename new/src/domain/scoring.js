import { datesForWeekKey, parseWeekKeyDate, startOfDay, weekKeyOf } from "./dates.js";

export function dayDelta(studyDone, goalDone, bonusDone, isDayOff, bonusEnabled = true) {
    if (isDayOff) return 0;
    let d = 0;
    if (studyDone === false) d -= 1;
    if (goalDone === false) d -= 1;
    if (bonusEnabled && bonusDone === true) d += 1;
    return d;
}

export function dayDeltaDisplay(studyDone, goalDone, bonusDone, isDayOff, isFuture, bonusEnabled = true) {
    if (isDayOff) return { text: "DAY OFF", cls: "dayoff-score" };
    if (isFuture) return { text: "-", cls: "text-slate-300" };
    const hasBonus = bonusEnabled && bonusDone === true;
    if (studyDone === null && goalDone === null && !hasBonus) {
        return { text: "-", cls: "text-slate-300" };
    }
    const d = dayDelta(studyDone, goalDone, bonusDone, false, bonusEnabled);
    if (d > 0) return { text: "+" + d, cls: "text-emerald-600 font-extrabold" };
    if (d < 0) return { text: String(d), cls: "text-rose-600 font-extrabold" };
    return { text: "0", cls: "text-slate-400 font-bold" };
}

export function dayOffIndices(row) {
    if (!row) return [];
    if (Array.isArray(row.time_done_list) && row.time_done_list.length === 7 && row.time_done_list.some(value => value === true)) {
        return row.time_done_list
            .map((value, index) => value === true ? index : -1)
            .filter(index => index >= 0);
    }
    if (row.day_off_used && Number.isInteger(row.day_off_day)) return [row.day_off_day];
    return [];
}

/**
 * 한 주의 점수 합. 오늘 이후 날짜와 Day Off는 제외한다.
 * @param {object} [options]
 * @param {Date} [options.today] 기준일 (기본: 지금)
 * @param {boolean} [options.bonusEnabled] 상점 사용 여부 (기본: true)
 */
export function computeWeekRaw(row, weekKey, { today = new Date(), bonusEnabled = true } = {}) {
    const dates = datesForWeekKey(weekKey);
    const base = startOfDay(today);
    const emptyWeek = [null, null, null, null, null, null, null];
    const studyArr = (row && row.study_done_list && row.study_done_list.length === 7) ? row.study_done_list : emptyWeek;
    const startArr = (row && row.start_done_list && row.start_done_list.length === 7) ? row.start_done_list : emptyWeek;
    const bonusArr = (row && row.bonus_done_list && row.bonus_done_list.length === 7) ? row.bonus_done_list : emptyWeek;
    const dayOffs = dayOffIndices(row);
    let sum = 0;
    for (let i = 0; i < 7; i++) {
        if (dates[i] > base) continue;
        if (dayOffs.includes(i)) continue;
        sum += dayDelta(studyArr[i], startArr[i], bonusArr[i], false, bonusEnabled);
    }
    return sum;
}

/**
 * 시작 주부터 대상 주까지 점수를 이어서 계산한다.
 * 양수(상점 잔액)는 다음 주로 이월하고, 음수(벌점)는 이월하지 않는다.
 */
export function computeScoreChain(targetWeekKey, weeksMap, startWeekKey, options = {}) {
    if (!startWeekKey) return { carryIn: 0, rawChange: 0, final: 0 };
    let cursor = parseWeekKeyDate(startWeekKey);
    const target = parseWeekKeyDate(targetWeekKey);
    if (!cursor || !target) return { carryIn: 0, rawChange: 0, final: 0 };
    let carry = 0;
    let safety = 0;
    while (cursor <= target && safety < 400) {
        safety++;
        const wk = weekKeyOf(cursor);
        const row = weeksMap ? weeksMap[wk] : null;
        const raw = computeWeekRaw(row, wk, options);
        const total = carry + raw;
        if (wk === targetWeekKey) {
            return { carryIn: carry, rawChange: raw, final: total };
        }
        carry = total >= 0 ? total : 0;
        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + 7);
    }
    return { carryIn: carry, rawChange: 0, final: carry };
}
