import { describe, expect, it } from "vitest";
import { parseSettingsForm } from "../../src/application/settings-form.js";

const form = values => new Map(Object.entries({
    name: "수능 스터디", min_study_hours: "3", bonus_enabled: "on", bonus_hours: "7",
    fine_unit: "500", default_start_time: "8:40", edit_mode: "self", ...values,
}));

describe("parseSettingsForm", () => {
    it("입력값을 DB 컬럼 값으로 바꾼다", () => {
        expect(parseSettingsForm(form({}))).toEqual({
            name: "수능 스터디", min_study_hours: 3, bonus_enabled: true, bonus_hours: 7,
            fine_unit: 500, default_start_time: "08:40", edit_mode: "self",
        });
    });

    it("체크 해제된 상점은 false, 소수 시간과 쉼표 금액 허용", () => {
        const map = form({ min_study_hours: "2.5", fine_unit: "1,000", edit_mode: "admin_only" });
        map.delete("bonus_enabled");
        expect(parseSettingsForm(map)).toMatchObject({ min_study_hours: 2.5, bonus_enabled: false, fine_unit: 1000, edit_mode: "admin_only" });
    });

    it.each([
        [{ name: "  " }, "그룹 이름을 입력해 주세요."],
        [{ min_study_hours: "25" }, "공부 시간은 0~24시간 사이로 입력해 주세요."],
        [{ bonus_hours: "abc" }, "상점 기준 시간은 0~24시간 사이로 입력해 주세요."],
        [{ fine_unit: "-1" }, "벌금 단위는 0원 이상 1,000,000원 이하로 입력해 주세요."],
        [{ edit_mode: "x" }, "기록 권한을 골라 주세요."],
    ])("%j → 오류", (values, message) => {
        expect(() => parseSettingsForm(form(values))).toThrow(expect.objectContaining({ userMessage: message }));
    });
});
