import { normalizeTimeText } from "../domain/time-input.js";

const fail = userMessage => { throw { userMessage }; };

function hours(value, label) {
    const n = Number(String(value ?? "").trim());
    if (!Number.isFinite(n) || n < 0 || n > 24 || String(value).trim() === "") fail(`${label}은 0~24시간 사이로 입력해 주세요.`);
    return Math.round(n * 10) / 10;
}

/** 그룹 설정 폼(FormData 또는 Map) → groups 컬럼 값. 잘못된 값이면 { userMessage } 를 던진다 */
export function parseSettingsForm(form) {
    const name = String(form.get("name") ?? "").trim();
    if (!name || name.length > 40) fail("그룹 이름을 입력해 주세요.");

    const fine = Number(String(form.get("fine_unit") ?? "").replace(/[,\s]/g, ""));
    if (!Number.isInteger(fine) || fine < 0 || fine > 1000000) fail("벌금 단위는 0원 이상 1,000,000원 이하로 입력해 주세요.");

    const editMode = form.get("edit_mode");
    if (editMode !== "self" && editMode !== "admin_only") fail("기록 권한을 골라 주세요.");

    return {
        name,
        min_study_hours: hours(form.get("min_study_hours"), "공부 시간"),
        bonus_enabled: form.get("bonus_enabled") === "on",
        bonus_hours: hours(form.get("bonus_hours"), "상점 기준 시간"),
        fine_unit: fine,
        default_start_time: normalizeTimeText(form.get("default_start_time")),
        edit_mode: editMode,
    };
}
