// legacy/src/presentation/pickers.js의 시간 입력 정리 로직 (3자리 입력 처리만 고침)

export function normalizeTimeText(value) {
    const raw = String(value || "").trim();
    const colonMatch = raw.match(/^(\d{1,2})(?::(\d{0,2}))?$/);
    if (colonMatch) {
        const hour = Math.min(23, Number(colonMatch[1] || 0));
        const minute = Math.min(59, Number((colonMatch[2] || "0").padEnd(2, "0")));
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    const compact = raw.replace(/[^\d]/g, "");
    if (compact.length === 1 || compact.length === 2) {
        const hour = Math.min(23, Number(compact));
        return `${String(hour).padStart(2, "0")}:00`;
    }
    if (compact.length === 3) {
        // 930 → 09:30 (legacy는 93시로 읽어 23:00이 되던 문제를 고침)
        const hour = Math.min(23, Number(compact.slice(0, 1)));
        const minute = Math.min(59, Number(compact.slice(1, 3)));
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    if (compact.length === 4) {
        const hour = Math.min(23, Number(compact.slice(0, 2)));
        const minute = Math.min(59, Number(compact.slice(2, 4)));
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    return "08:40";
}

export function formatTimeTyping(value) {
    const digits = String(value || "").replace(/[^\d]/g, "").slice(0, 4);
    if (digits.length <= 1) return digits;
    const hour = Math.min(23, Number(digits.slice(0, 2)));
    if (digits.length === 2) return String(hour).padStart(2, "0");
    const minuteDigits = digits.slice(2);
    const minute = Math.min(59, Number(minuteDigits.padEnd(2, "0")));
    const minuteText = minuteDigits.length === 1
        ? Number(minuteDigits) > 5 ? "59" : minuteDigits
        : String(minute).padStart(2, "0");
    return `${String(hour).padStart(2, "0")}:${minuteText}`;
}
