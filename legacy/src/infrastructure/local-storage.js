import { ORDER_STORAGE_KEY } from "../application/settings.js";

export function readLocalBackup(weekKey) {
    const saved = localStorage.getItem(`local_backup_${weekKey}`);
    return saved ? JSON.parse(saved) : [];
}

export function writeLocalBackup(weekKey, rows) {
    localStorage.setItem(`local_backup_${weekKey}`, JSON.stringify(rows));
}

export function readFriendOrder() {
    try { return JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) || "[]"); } catch(e) { return []; }
}

export function writeFriendOrder(orderNames) {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orderNames));
}
