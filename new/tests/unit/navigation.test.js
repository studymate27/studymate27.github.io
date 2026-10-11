import { describe, expect, it } from "vitest";
import { parseRoute, resolveNavigation } from "../../src/application/navigation.js";

describe("parseRoute", () => {
    it.each([
        ["", { name: "home", params: {} }],
        ["#/", { name: "home", params: {} }],
        ["#/login", { name: "login", params: {} }],
        ["#/signup", { name: "signup", params: {} }],
        ["#/forgot", { name: "forgot", params: {} }],
        ["#/reset", { name: "reset", params: {} }],
        ["#/groups", { name: "groups", params: {} }],
        ["#/account", { name: "account", params: {} }],
        ["#/join/AB12CD34", { name: "join", params: { code: "AB12CD34" } }],
        ["#/g/123e4567", { name: "group", params: { id: "123e4567", tab: "week" } }],
        ["#/g/123e4567/month", { name: "group", params: { id: "123e4567", tab: "month" } }],
        ["#/g/123e4567/manage", { name: "group", params: { id: "123e4567", tab: "manage" } }],
        ["#/g/123e4567/oops", { name: "notFound", params: {} }],
        ["#/nowhere", { name: "notFound", params: {} }],
    ])("%s", (hash, expected) => {
        expect(parseRoute(hash)).toEqual(expected);
    });

    it("끝의 슬래시와 쿼리는 무시한다", () => {
        expect(parseRoute("#/groups/")).toEqual({ name: "groups", params: {} });
        expect(parseRoute("#/login?x=1")).toEqual({ name: "login", params: {} });
    });

    it("초대 코드에 들어간 인코딩 문자를 풀어 준다", () => {
        expect(parseRoute("#/join/ab%2012")).toEqual({ name: "join", params: { code: "ab 12" } });
    });
});

describe("resolveNavigation", () => {
    const nav = (hash, hasSession, returnTo = null) => resolveNavigation(parseRoute(hash), hash, { hasSession, returnTo });

    it("로그인 안 한 채 보호된 화면에 가면 로그인으로 보내고 원래 주소를 기억한다", () => {
        expect(nav("#/join/AB12CD34", false)).toEqual({ redirect: "#/login", saveReturnTo: "#/join/AB12CD34" });
        expect(nav("#/g/abc/month", false)).toEqual({ redirect: "#/login", saveReturnTo: "#/g/abc/month" });
    });

    it("첫 화면: 로그인 안 했으면 로그인, 했으면 그룹 목록", () => {
        expect(nav("#/", false)).toEqual({ redirect: "#/login" });
        expect(nav("#/", true)).toEqual({ redirect: "#/groups" });
    });

    it("로그인 후에는 기억해 둔 주소로 돌아간다", () => {
        expect(nav("#/login", true, "#/join/AB12CD34")).toEqual({ redirect: "#/join/AB12CD34", clearReturnTo: true });
        expect(nav("#/signup", true)).toEqual({ redirect: "#/groups" });
    });

    it("가입·구글 로그인 후 그룹 목록이나 첫 화면에 도착해도 기억해 둔 초대 링크로 보낸다", () => {
        expect(nav("#/groups", true, "#/join/AB12CD34")).toEqual({ redirect: "#/join/AB12CD34", clearReturnTo: true });
        expect(nav("#/", true, "#/join/AB12CD34")).toEqual({ redirect: "#/join/AB12CD34", clearReturnTo: true });
    });

    it("기억해 둔 주소에 이미 와 있으면 지우기만 한다", () => {
        expect(nav("#/join/AB12CD34", true, "#/join/AB12CD34")).toEqual({ clearReturnTo: true });
    });

    it("로그인 화면·보호된 화면은 그대로 보여준다", () => {
        expect(nav("#/login", false)).toEqual({});
        expect(nav("#/groups", true)).toEqual({});
    });

    it("비밀번호 재설정 화면은 세션이 없으면 다시 메일을 받도록 보낸다", () => {
        expect(nav("#/reset", false)).toEqual({ redirect: "#/forgot" });
        expect(nav("#/reset", true)).toEqual({});
    });
});
