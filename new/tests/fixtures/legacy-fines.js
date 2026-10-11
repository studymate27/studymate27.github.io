// legacy/src/main.js 62~133행의 벌금 정산 로직을 그대로 복사한 것 (동작 비교용 – 수정 금지)
import { parseWeekKeyDate } from "../../../legacy/src/domain/dates.js";
import { computeWeekRaw } from "../../../legacy/src/domain/scoring.js";

function readRowMeta(row) {
    if (!row || !row.Notes) return {};
    try {
        const parsed = JSON.parse(row.Notes);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch(e) {
        return {};
    }
}

function writeRowMeta(row, updates) {
    return JSON.stringify({ ...readRowMeta(row), ...updates });
}

function isFinePaid(friend) {
    return readRowMeta(friend).finePaid === true;
}

function weekTime(weekKey) {
    const date = parseWeekKeyDate(weekKey);
    return date ? date.getTime() : null;
}

function hasPaymentAtOrAfter(targetWeekKey, weeksMap) {
    const targetTime = weekTime(targetWeekKey);
    if (targetTime === null || !weeksMap) return false;
    return Object.entries(weeksMap).some(([weekKey, row]) => {
        const rowTime = weekTime(weekKey);
        return rowTime !== null && rowTime >= targetTime && isFinePaid(row);
    });
}

function lastPaymentTimeOnOrBefore(targetWeekKey, weeksMap) {
    const targetTime = weekTime(targetWeekKey);
    if (targetTime === null || !weeksMap) return null;
    let paidTime = null;
    Object.entries(weeksMap).forEach(([weekKey, row]) => {
        const rowTime = weekTime(weekKey);
        if (rowTime !== null && rowTime <= targetTime && isFinePaid(row)) {
            paidTime = paidTime === null ? rowTime : Math.max(paidTime, rowTime);
        }
    });
    return paidTime;
}

function computeFineState(targetWeekKey, weeksMap, startWeekKey) {
    let cursor = parseWeekKeyDate(startWeekKey);
    const target = parseWeekKeyDate(targetWeekKey);
    if (!cursor || !target) return { unsettledPoints: 0, settledThroughTarget: false };

    if (hasPaymentAtOrAfter(targetWeekKey, weeksMap)) {
        return { unsettledPoints: 0, settledThroughTarget: true };
    }

    const paidThroughTime = lastPaymentTimeOnOrBefore(targetWeekKey, weeksMap);

    let balance = 0;
    let safety = 0;
    while (cursor <= target && safety < 400) {
        safety++;
        const wk = `week_${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
        const currentTime = cursor.getTime();
        const row = weeksMap ? weeksMap[wk] : null;
        const raw = computeWeekRaw(row, wk);
        if (paidThroughTime === null || currentTime > paidThroughTime) {
            balance += raw;
        }
        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + 7);
    }
    return { unsettledPoints: balance, settledThroughTarget: balance === 0 };
}

export { computeFineState, isFinePaid };
