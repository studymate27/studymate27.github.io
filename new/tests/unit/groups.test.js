import { describe, expect, it } from "vitest";
import { defaultNickname, parseInviteCode, upcomingDdays } from "../../src/application/groups.js";

describe("parseInviteCode", () => {
    it.each([
        ["AB23CD45", "AB23CD45"],
        ["ab23cd45", "AB23CD45"],
        ["  AB23 CD45 ", "AB23CD45"],
        ["https://studymate27.github.io/app/#/join/AB23CD45", "AB23CD45"],
        ["https://studymate27.github.io/app/#/join/ab23cd45/", "AB23CD45"],
        ["친구가 보낸 링크 https://studymate27.github.io/app/#/join/AB23CD45 눌러줘", "AB23CD45"],
    ])("%s → %s", (input, expected) => {
        expect(parseInviteCode(input)).toBe(expected);
    });

    it.each(["", "ABC", "AB23CD45X", "AB23CD4O", "https://example.com"])("잘못된 입력 %s → null", input => {
        expect(parseInviteCode(input)).toBeNull();
    });
});

describe("defaultNickname", () => {
    it("프로필 이름이 있으면 그것을, 없으면 이메일 앞부분을 쓴다 (20자 제한)", () => {
        expect(defaultNickname({ user_metadata: { full_name: "이서진" }, email: "a@b.c" })).toBe("이서진");
        expect(defaultNickname({ user_metadata: {}, email: "studyking@gmail.com" })).toBe("studyking");
        expect(defaultNickname({ user_metadata: {}, email: "a".repeat(30) + "@x.com" })).toHaveLength(20);
        expect(defaultNickname(null)).toBe("");
    });
});

describe("upcomingDdays", () => {
    const today = new Date(2026, 9, 11);
    it("날짜순으로 정렬하고 D-day 문구를 붙인다", () => {
        expect(upcomingDdays([
            { label: "수능", target_date: "2026-11-19" },
            { label: "모의고사", target_date: "2026-10-11" },
            { label: "지난 시험", target_date: "2026-10-01" },
        ], today)).toEqual([
            { label: "지난 시험", text: "D+10" },
            { label: "모의고사", text: "D-Day" },
            { label: "수능", text: "D-39" },
        ]);
    });
});
