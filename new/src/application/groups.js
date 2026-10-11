import { formatDday, getDday, parseDateKey } from "../domain/dates.js";

// DB의 generate_invite_code와 같은 글자 집합 (헷갈리는 0/O/1/I 제외)
const CODE = /^[A-HJ-NP-Z2-9]{8}$/;

/** 초대 코드나 초대 링크(문장 속 링크 포함)에서 코드를 꺼낸다. 형식이 맞지 않으면 null */
export function parseInviteCode(input) {
    const text = String(input ?? "").trim();
    const fromLink = text.match(/#\/join\/([A-Za-z0-9]+)/);
    const candidate = (fromLink ? fromLink[1] : text.replace(/\s+/g, "")).toUpperCase();
    return CODE.test(candidate) ? candidate : null;
}

export function defaultNickname(user) {
    if (!user) return "";
    const name = user.user_metadata?.full_name || user.user_metadata?.name || (user.email ?? "").split("@")[0];
    return name.slice(0, 20);
}

export function upcomingDdays(ddays, today = new Date()) {
    return [...ddays]
        .sort((a, b) => a.target_date.localeCompare(b.target_date))
        .map(d => ({ label: d.label, text: formatDday(getDday(parseDateKey(d.target_date), today)) }));
}
