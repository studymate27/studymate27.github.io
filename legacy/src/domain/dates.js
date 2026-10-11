import { MASTER_WEEK_KEY, SETTINGS_WEEK_KEY } from "../application/settings.js";

export function parseDateKey(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function parseWeekKeyDate(weekKey) {
    if (!weekKey || weekKey === MASTER_WEEK_KEY || weekKey === SETTINGS_WEEK_KEY || !weekKey.startsWith("week_")) return null;
    return parseDateKey(weekKey.replace("week_", ""));
}

export function datesForWeekKey(weekKey) {
    const monday = parseWeekKeyDate(weekKey);
    const arr = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        arr.push(d);
    }
    return arr;
}

export function getWeekDates(offset) {
    const current = new Date();
    current.setDate(current.getDate() + (offset * 7));
    const distanceToMonday = (current.getDay() === 0 ? 7 : current.getDay()) - 1;
    const monday = new Date(current.setDate(current.getDate() - distanceToMonday));
    const days = ["월", "화", "수", "목", "금", "토", "일"];
    return days.map((day, idx) => {
        const nextDay = new Date(monday);
        nextDay.setDate(monday.getDate() + idx);
        return {
            label: `${nextDay.getMonth() + 1}/${nextDay.getDate()}(${day})`,
            storageKey: `${nextDay.getFullYear()}-${nextDay.getMonth() + 1}-${nextDay.getDate()}`
        };
    });
}

export function getDday(targetDate, today = new Date()) {
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    return Math.round((target - base) / (1000 * 60 * 60 * 24));
}

export function formatDday(days) {
    if (days > 0) return `D-${days}`;
    if (days === 0) return "D-Day";
    return `D+${Math.abs(days)}`;
}
