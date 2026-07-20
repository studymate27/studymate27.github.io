let bonusPickerResolve = null;
let timePickerResolve = null;
let dayOffResolve = null;
let targetWeekResolve = null;
let fineUnitResolve = null;

const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];

function normalizeTimeText(value) {
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
        const hour = Math.min(23, Number(compact.slice(0, 2)));
        const minute = Math.min(59, Number(compact.slice(2, 3).padEnd(2, "0")));
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    if (compact.length === 4) {
        const hour = Math.min(23, Number(compact.slice(0, 2)));
        const minute = Math.min(59, Number(compact.slice(2, 4)));
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    return "08:40";
}

function formatTimeTyping(value) {
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

export function openBonusPicker(defaultVal, title = "상점 기준 시간") {
    return new Promise(resolve => {
        bonusPickerResolve = resolve;
        const input = document.getElementById("bonus-hour-input");
        input.value = Number.isFinite(defaultVal) ? String(defaultVal) : "7";
        document.getElementById("bonus-picker-title").innerText = title;
        const modal = document.getElementById("bonus-picker-modal");
        modal.classList.remove("hidden");
        modal.classList.add("flex");
        setTimeout(() => input.focus(), 0);
    });
}

export function closeBonusPicker(confirmed) {
    const modal = document.getElementById("bonus-picker-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    if (bonusPickerResolve) {
        if (!confirmed) {
            bonusPickerResolve(null);
        } else {
            const raw = parseFloat(document.getElementById("bonus-hour-input").value);
            const value = Number.isFinite(raw) ? Math.min(15, Math.max(3, Math.round(raw * 2) / 2)) : 7;
            bonusPickerResolve(value);
        }
        bonusPickerResolve = null;
    }
}

export function openFineUnitPicker(defaultVal) {
    return new Promise(resolve => {
        fineUnitResolve = resolve;
        const input = document.getElementById("fine-unit-input");
        input.value = Number.isFinite(defaultVal) ? String(defaultVal) : "500";
        const modal = document.getElementById("fine-unit-picker-modal");
        modal.classList.remove("hidden");
        modal.classList.add("flex");
        setTimeout(() => input.focus(), 0);
    });
}

export function closeFineUnitPicker(confirmed) {
    const modal = document.getElementById("fine-unit-picker-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    if (!fineUnitResolve) return;
    if (!confirmed) {
        fineUnitResolve(null);
    } else {
        const raw = parseInt(document.getElementById("fine-unit-input").value, 10);
        const value = Number.isFinite(raw) ? Math.min(100000, Math.max(100, Math.round(raw / 100) * 100)) : 500;
        fineUnitResolve(value);
    }
    fineUnitResolve = null;
}

export function openTimePicker(defaultTime, title) {
    return new Promise(resolve => {
        timePickerResolve = resolve;
        const [dh, dm] = (defaultTime || "08:40").split(":");
        const hourSel = document.getElementById("tp-hour");
        const minSel = document.getElementById("tp-minute");
        hourSel.innerHTML = Array.from({length: 24}, (_, i) => {
            const h = String(i).padStart(2, "0");
            return `<option value="${h}" ${h === dh ? "selected" : ""}>${h}시</option>`;
        }).join("");
        minSel.innerHTML = Array.from({length: 12}, (_, i) => {
            const m = String(i * 5).padStart(2, "0");
            return `<option value="${m}" ${m === dm ? "selected" : ""}>${m}분</option>`;
        }).join("");
        document.getElementById("time-picker-title").innerText = title || "시작 시간 선택";
        const modal = document.getElementById("time-picker-modal");
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    });
}

export function closeTimePicker(confirmed) {
    const modal = document.getElementById("time-picker-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    if (timePickerResolve) {
        if (confirmed) {
            const h = document.getElementById("tp-hour").value;
            const m = document.getElementById("tp-minute").value;
            timePickerResolve(`${h}:${m}`);
        } else {
            timePickerResolve(null);
        }
        timePickerResolve = null;
    }
}

export function openDayOffPicker(defaultDays) {
    return new Promise(resolve => {
        dayOffResolve = resolve;
        const selected = new Set(Array.isArray(defaultDays) ? defaultDays : []);
        const fields = document.getElementById("dayoff-week-fields");
        fields.innerHTML = dayLabels.map((day, index) => `
            <button type="button" data-dayoff-day="${index}" class="dayoff-week-button ${selected.has(index) ? "is-selected" : ""}">
                ${day}
            </button>
        `).join("");
        fields.querySelectorAll("[data-dayoff-day]").forEach(button => {
            button.addEventListener("click", () => {
                button.classList.toggle("is-selected");
            });
        });
        const modal = document.getElementById("dayoff-picker-modal");
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    });
}

export function closeDayOffPicker(confirmed) {
    const modal = document.getElementById("dayoff-picker-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    if (dayOffResolve) {
        const values = [...document.querySelectorAll("[data-dayoff-day].is-selected")]
            .map(button => Number(button.dataset.dayoffDay))
            .sort((a, b) => a - b);
        dayOffResolve(confirmed ? values : null);
        dayOffResolve = null;
    }
}

export function openTargetWeekPicker(defaultTargets) {
    return new Promise(resolve => {
        targetWeekResolve = resolve;
        const fields = document.getElementById("target-week-fields");
        fields.innerHTML = dayLabels.map((day, index) => {
            const value = defaultTargets[index] || "08:40";
            return `
                <label class="target-week-field">
                    <span>${day}</span>
                    <input type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="13:00" value="${value}" data-target-day="${index}" />
                </label>
            `;
        }).join("");
        fields.querySelectorAll("[data-target-day]").forEach(input => {
            input.addEventListener("input", () => {
                input.value = formatTimeTyping(input.value);
            });
            input.addEventListener("blur", () => {
                input.value = normalizeTimeText(input.value);
            });
        });
        const modal = document.getElementById("target-week-modal");
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    });
}

export function closeTargetWeekPicker(confirmed) {
    const modal = document.getElementById("target-week-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    if (!targetWeekResolve) return;
    if (!confirmed) {
        targetWeekResolve(null);
    } else {
        const values = [...document.querySelectorAll("[data-target-day]")]
            .sort((a, b) => Number(a.dataset.targetDay) - Number(b.dataset.targetDay))
            .map(input => normalizeTimeText(input.value));
        targetWeekResolve(values);
    }
    targetWeekResolve = null;
}
