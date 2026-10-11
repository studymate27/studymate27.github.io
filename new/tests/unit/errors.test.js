import { describe, expect, it } from "vitest";
import { errorMessage } from "../../src/application/errors.js";

describe("errorMessage", () => {
    it.each([
        ["Invalid login credentials", "이메일 또는 비밀번호가 맞지 않아요."],
        ["Email not confirmed", "이메일 인증이 아직 안 됐어요. 받은 편지함의 인증 메일을 확인해 주세요."],
        ["User already registered", "이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해 주세요."],
        ["Password should be at least 6 characters.", "비밀번호는 6자 이상이어야 해요."],
        ["New password should be different from the old password.", "이전과 다른 비밀번호를 입력해 주세요."],
        ["For security purposes, you can only request this after 42 seconds.", "잠시 후 다시 시도해 주세요. (42초 후 가능)"],
        ["Email rate limit exceeded", "메일을 너무 자주 요청했어요. 잠시 후 다시 시도해 주세요."],
        ["Unable to validate email address: invalid format", "이메일 형식이 올바르지 않아요."],
        ["not_admin", "방장만 할 수 있어요."],
        ["last_admin", "그룹에 방장이 최소 1명은 있어야 해요. 먼저 다른 멤버를 방장으로 지정해 주세요."],
        ["dday_limit", "디데이는 3개까지 등록할 수 있어요."],
        ["invalid_invite_code", "초대 코드가 올바르지 않아요. 방장에게 새 링크를 받아 주세요."],
        ["invalid_nickname", "닉네임은 1~20자로 입력해 주세요."],
    ])("%s", (message, expected) => {
        expect(errorMessage({ message })).toBe(expected);
    });

    it("RLS 거부는 권한 안내로", () => {
        expect(errorMessage({ code: "42501", message: "new row violates row-level security policy" }))
            .toBe("수정 권한이 없어요.");
    });

    it("RLS로 걸러져 바뀐 행이 없을 때도 권한 안내로", () => {
        expect(errorMessage({ code: "PGRST116", message: "Cannot coerce the result to a single JSON object" }))
            .toBe("수정 권한이 없어요.");
    });

    it("모르는 오류는 원문과 함께 일반 안내", () => {
        expect(errorMessage({ message: "boom" })).toBe("문제가 생겼어요. 잠시 후 다시 시도해 주세요. (boom)");
        expect(errorMessage(null)).toBe("문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
    });

    it("화면에서 만든 안내 문장은 그대로", () => {
        expect(errorMessage({ userMessage: "비밀번호 확인이 일치하지 않아요." })).toBe("비밀번호 확인이 일치하지 않아요.");
    });

    it("네트워크 오류", () => {
        expect(errorMessage(new TypeError("Failed to fetch"))).toBe("인터넷 연결을 확인해 주세요.");
    });
});
