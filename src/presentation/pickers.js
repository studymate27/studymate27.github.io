let bonusPickerResolve = null;
let timePickerResolve = null;
let dayOffResolve = null;

export function openBonusPicker(defaultVal) {
    return new Promise(resolve => {
        bonusPickerResolve = resolve;
        const sel = document.getElementById("bonus-hour-select");
        const options = [];
        for (let v = 3; v <= 15; v += 0.5) options.push(v);
        sel.innerHTML = options.map(v => {
            const label = Number.isInteger(v) ? `${v}` : v.toFixed(1);
            const selected = Math.abs(v - defaultVal) < 0.01 ? "selected" : "";
            return `<option value="${v}" ${selected}>${label}</option>`;
        }).join("");
        const modal = document.getElementById("bonus-picker-modal");
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    });
}

export function closeBonusPicker(confirmed) {
    const modal = document.getElementById("bonus-picker-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    if (bonusPickerResolve) {
        bonusPickerResolve(confirmed ? parseFloat(document.getElementById("bonus-hour-select").value) : null);
        bonusPickerResolve = null;
    }
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
        document.getElementById("time-picker-title").innerText = title || "목표 시간 선택";
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

export function openDayOffPicker(defaultUsed, defaultDay) {
    return new Promise(resolve => {
        dayOffResolve = resolve;
        const days = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
        const sel = document.getElementById("do-select");
        sel.innerHTML = `<option value="-1">해제 (사용 안 함)</option>` +
            days.map((d, i) => `<option value="${i}" ${defaultUsed && defaultDay === i ? "selected" : ""}>${d}</option>`).join("");
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
        dayOffResolve(confirmed ? parseInt(document.getElementById("do-select").value, 10) : null);
        dayOffResolve = null;
    }
}
