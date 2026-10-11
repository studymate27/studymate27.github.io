import { errorMessage } from "../../application/errors.js";
import { upcomingDdays } from "../../application/groups.js";
import * as repo from "../../infrastructure/groups-repo.js";
import { escapeHtml, render } from "../dom.js";
import { showToast } from "../toast.js";
import { manageTab } from "./manage.js";
import { monthTab } from "./month.js";
import { weekTab } from "./week.js";

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

export async function groupView(container, { session, params, flash, navigate }) {
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
        const myRole = members.find(m => m.user_id === session.user.id)?.role ?? "member";
        // 관리 탭에서 바꾼 뒤 그룹 정보를 다시 불러와 그린다 (스크롤 위치 유지)
        const refresh = async message => {
            await groupView(container, { session, params, flash: "", navigate });
            if (message) showToast(message);
        };
        const context = { group, members, me: { userId: session.user.id, role: myRole }, refresh, navigate };

        if (params.tab === "manage") manageTab(body, context);
        else if (params.tab === "week") await weekTab(body, context);
        else await monthTab(body, context);
    } catch (error) {
        $("p").textContent = errorMessage(error);
    }
}
