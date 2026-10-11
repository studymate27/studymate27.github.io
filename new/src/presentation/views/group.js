import { errorMessage } from "../../application/errors.js";
import { upcomingDdays } from "../../application/groups.js";
import * as repo from "../../infrastructure/groups-repo.js";
import { escapeHtml, render } from "../dom.js";
import { bindInvitePanel, invitePanel } from "./groups.js";

const TABS = [
    ["week", "주간"],
    ["month", "월간"],
    ["manage", "관리"],
];

function groupHeader(group, tab) {
    const ddays = upcomingDdays(group.group_ddays ?? []);
    return `
        <header class="group-head">
            <a class="group-back" href="#/groups" aria-label="내 그룹 목록으로">‹ 내 그룹</a>
            <h2 class="group-title">${escapeHtml(group.name)}</h2>
            ${ddays.length ? `<ul class="dday-list">${ddays.map(d => `
                <li class="study-chip">${escapeHtml(d.label)} <span>${escapeHtml(d.text)}</span></li>`).join("")}</ul>` : ""}
            <nav class="group-tabs" aria-label="그룹 메뉴">
                ${TABS.map(([key, label]) => `
                    <a href="#/g/${escapeHtml(group.id)}/${key}" class="group-tab ${key === tab ? "is-active" : ""}"
                       ${key === tab ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
            </nav>
        </header>`;
}

function manageTab(body, { group, members, me }) {
    const $ = render(body, `
        <section class="manage-section">
            <h3 class="auth-subtitle">친구 초대</h3>
            ${invitePanel(group.invite_code)}
        </section>
        <section class="manage-section">
            <h3 class="auth-subtitle">멤버 ${members.length}명</h3>
            <ul class="member-list">${members.map(m => `
                <li>
                    <span>${escapeHtml(m.nickname)}${m.user_id === me ? ` <span class="auth-note">(나)</span>` : ""}</span>
                    ${m.role === "admin" ? `<span class="role-badge">방장</span>` : ""}
                </li>`).join("")}
            </ul>
        </section>`);
    bindInvitePanel($, group.invite_code);
}

export async function groupView(container, { session, params, flash }) {
    const $ = render(container, `<p class="auth-note">불러오는 중...</p>`);
    try {
        const [group, members] = await Promise.all([repo.getGroup(params.id), repo.getMembers(params.id)]);
        if (!group) {
            render(container, `
                <section class="auth-panel">
                    <h2 class="auth-title">그룹을 볼 수 없어요</h2>
                    <p class="auth-lead">그룹이 없어졌거나 멤버가 아니에요. 초대 링크로 다시 참여해 주세요.</p>
                    <nav class="auth-links"><a href="#/groups">내 그룹으로</a></nav>
                </section>`);
            return;
        }
        const $page = render(container, `
            <section class="page-panel is-wide">
                ${groupHeader(group, params.tab)}
                ${flash ? `<p class="auth-flash" role="status">${escapeHtml(flash)}</p>` : ""}
                <div data-tab></div>
            </section>`);
        const body = $page("[data-tab]");
        const context = { group, members, me: session.user.id };

        if (params.tab === "manage") manageTab(body, context);
        else body.innerHTML = `<p class="auth-note coming-soon">${params.tab === "week" ? "주간 장부" : "월간 현황"}는 곧 열려요.</p>`;
    } catch (error) {
        $("p").textContent = errorMessage(error);
    }
}
