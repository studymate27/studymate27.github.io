import { parseWeekKeyDate, weekKeyOf } from "./dates.js";
import { computeWeekRaw } from "./scoring.js";

function weekTime(weekKey) {
    const date = parseWeekKeyDate(weekKey);
    return date ? date.getTime() : null;
}

/**
 * 대상 주 기준 미정산 벌금 상태.
 * - 대상 주 또는 그 이후 주에 납부 기록이 있으면 대상 주까지 정산된 것으로 본다.
 * - 아니면 마지막 납부 주 다음 주부터 대상 주까지의 점수를 합산한다 (상점이 벌점을 깎음).
 * unsettledPoints가 음수면 낼 벌금이 남아 있다는 뜻이다.
 *
 * @param {object} [options]
 * @param {Iterable<string>} [options.paidWeekKeys] 납부(정산) 처리된 주 키 목록
 * @param {Date} [options.today]
 * @param {boolean} [options.bonusEnabled]
 */
export function computeFineState(targetWeekKey, weeksMap, startWeekKey, { paidWeekKeys = [], ...scoreOptions } = {}) {
    let cursor = parseWeekKeyDate(startWeekKey);
    const target = parseWeekKeyDate(targetWeekKey);
    if (!cursor || !target) return { unsettledPoints: 0, settledThroughTarget: false };

    const targetTime = target.getTime();
    const paidTimes = [...paidWeekKeys].map(weekTime).filter(time => time !== null);

    if (paidTimes.some(time => time >= targetTime)) {
        return { unsettledPoints: 0, settledThroughTarget: true };
    }

    const paidBefore = paidTimes.filter(time => time <= targetTime);
    const paidThroughTime = paidBefore.length ? Math.max(...paidBefore) : null;

    let balance = 0;
    let safety = 0;
    while (cursor <= target && safety < 400) {
        safety++;
        const wk = weekKeyOf(cursor);
        const row = weeksMap ? weeksMap[wk] : null;
        if (paidThroughTime === null || cursor.getTime() > paidThroughTime) {
            balance += computeWeekRaw(row, wk, scoreOptions);
        }
        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + 7);
    }
    return { unsettledPoints: balance, settledThroughTarget: balance === 0 };
}
