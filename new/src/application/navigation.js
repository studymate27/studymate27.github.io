// 해시 라우팅: GitHub Pages에는 SPA fallback이 없어서 #/ 경로를 쓴다.

const GROUP_TABS = ["week", "month", "manage"];
const PUBLIC_ONLY = new Set(["login", "signup", "forgot"]);
const OPEN = new Set(["notFound"]);

export function parseRoute(hash) {
    const path = (hash || "").replace(/^#/, "").split("?")[0].replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);

    if (parts.length === 0) return { name: "home", params: {} };
    const [head, ...rest] = parts;

    if (rest.length === 0 && ["login", "signup", "forgot", "reset", "groups", "account"].includes(head)) {
        return { name: head, params: {} };
    }
    if (head === "join" && rest.length === 1) {
        return { name: "join", params: { code: rest[0] } };
    }
    if (head === "g" && rest.length >= 1 && rest.length <= 2) {
        const tab = rest[1] ?? "week";
        if (GROUP_TABS.includes(tab)) return { name: "group", params: { id: rest[0], tab } };
    }
    return { name: "notFound", params: {} };
}

/**
 * 현재 화면을 보여줄지, 다른 곳으로 보낼지 정한다.
 * @returns {{redirect?: string, saveReturnTo?: string, clearReturnTo?: boolean}}
 */
export function resolveNavigation(route, hash, { hasSession, returnTo }) {
    if (route.name === "home") {
        return { redirect: hasSession ? "#/groups" : "#/login" };
    }
    if (PUBLIC_ONLY.has(route.name)) {
        if (!hasSession) return {};
        return returnTo ? { redirect: returnTo, clearReturnTo: true } : { redirect: "#/groups" };
    }
    if (route.name === "reset") {
        return hasSession ? {} : { redirect: "#/forgot" };
    }
    if (OPEN.has(route.name) || hasSession) return {};
    return { redirect: "#/login", saveReturnTo: hash };
}
