import { datesForWeekKey, parseWeekKeyDate } from "./dates.js";

export function dayDelta(studyDone, goalDone, bonusDone, isDayOff) {
    if (isDayOff) return 0;
    let d = 0;
    if (!studyDone) d -= 1;
    if (!goalDone) d -= 1;
    if (bonusDone) d += 1;
    return d;
}

export function dayDeltaDisplay(studyDone, goalDone, bonusDone, isDayOff, isFuture) {
    if (isDayOff) return { text: "☁️", cls: "text-amber-500" };
    if (isFuture) return { text: "-", cls: "text-slate-300" };
    const d = dayDelta(studyDone, goalDone, bonusDone, false);
    if (d > 0) return { text: "+" + d, cls: "text-emerald-600 font-extrabold" };
    if (d < 0) return { text: String(d), cls: "text-rose-600 font-extrabold" };
    return { text: "0", cls: "text-slate-400 font-bold" };
}

export function computeWeekRaw(row, weekKey) {
    const dates = datesForWeekKey(weekKey);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const studyArr = (row && row.study_done_list && row.study_done_list.length === 7) ? row.study_done_list : [false,false,false,false,false,false,false];
    const startArr = (row && row.start_done_list && row.start_done_list.length === 7) ? row.start_done_list : [false,false,false,false,false,false,false];
    const bonusArr = (row && row.bonus_done_list && row.bonus_done_list.length === 7) ? row.bonus_done_list : [false,false,false,false,false,false,false];
    const dayOffUsed = row ? !!row.day_off_used : false;
    const dayOffDay = row ? row.day_off_day : -1;
    let sum = 0;
    for (let i = 0; i < 7; i++) {
        if (dates[i] > today) continue;
        const isOff = dayOffUsed && dayOffDay === i;
        if (isOff) continue;
        sum += dayDelta(!!studyArr[i], !!startArr[i], !!bonusArr[i], false);
    }
    return sum;
}

export function computeScoreChain(name, targetWeekKey, weeksMap, startWeekKey) {
    if (!startWeekKey) return { carryIn: 0, rawChange: 0, final: 0 };
    let cursor = parseWeekKeyDate(startWeekKey);
    const target = parseWeekKeyDate(targetWeekKey);
    if (!cursor || !target) return { carryIn: 0, rawChange: 0, final: 0 };
    let carry = 0;
    let safety = 0;
    while (cursor <= target && safety < 400) {
        safety++;
        const wk = `week_${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
        const row = weeksMap ? weeksMap[wk] : null;
        const raw = computeWeekRaw(row, wk);
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
