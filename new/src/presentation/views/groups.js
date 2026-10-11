import { appUrl } from "../../application/auth.js";
import { errorMessage } from "../../application/errors.js";
import { defaultNickname, parseInviteCode } from "../../application/groups.js";
import * as repo from "../../infrastructure/groups-repo.js";
import { copyText } from "../clipboard.js";
import { escapeHtml, handleSubmit, render } from "../dom.js";

const nicknameField = value => `
    <label class="auth-field">
        <span>이 그룹에서 쓸 닉네임</span>
        <input name="nickname" maxlength="20" required value="${escapeHtml(value)}">
    </label>`;

export const inviteLinkOf = code => appUrl(`#/join/${code}`);

export function invitePanel(code) {
    return `
        <div class="invite-box">
            <p class="invite-label">초대 링크</p>
            <p class="invite-link" data-invite-link>${escapeHtml(inviteLinkOf(code))}</p>
            <p class="invite-code">초대 코드 <strong>${escapeHtml(code)}</strong></p>
            <button type="button" class="auth-button" data-copy-invite>링크 복사</button>
            <p class="auth-note" data-copy-result></p>
        </div>`;
}

export function bindInvitePanel($, code) {
    $("[data-copy-invite]")?.addEventListener("click", async () => {
        const ok = await copyText(inviteLinkOf(code));
        $("[data-copy-result]").textContent = ok ? "복사했어요. 카톡 등으로 친구에게 보내 주세요." : "복사하지 못했어요. 위 링크를 길게 눌러 복사해 주세요.";
    });
}

export async function groupsView(container, { session, flash, navigate }) {
    const $ = render(container, `
        <section class="page-panel">
            <header class="page-head">
                <h2 class="auth-title">내 그룹</h2>
            </header>
            ${flash ? `<p class="auth-flash" role="status">${escapeHtml(flash)}</p>` : ""}
            <div data-list><p class="auth-note">불러오는 중...</p></div>
            <div class="group-actions">
                <button type="button" class="auth-button is-primary" data-open="create">그룹 만들기</button>
                <button type="button" class="auth-button" data-open="join">초대 코드로 참여</button>
            </div>
            <div data-form></div>
        </section>`);

    const nickname = defaultNickname(session.user);

    $("[data-open=create]").addEventListener("click", () => {
        const formBox = $("[data-form]");
        formBox.innerHTML = `
            <form class="auth-form group-form" novalidate>
                <h3 class="auth-subtitle">새 그룹</h3>
                <label class="auth-field"><span>그룹 이름</span><input name="name" maxlength="40" required placeholder="예) 수능 스터디"></label>
                ${nicknameField(nickname)}
                <p class="auth-error" role="alert"></p>
                <button type="submit" class="auth-button is-primary">만들기</button>
            </form>`;
        formBox.querySelector("input").focus();
        handleSubmit(formBox.querySelector("form"), {
            errorBox: formBox.querySelector(".auth-error"),
            toMessage: errorMessage,
            onSubmit: async data => {
                const name = data.get("name").trim();
                if (!name) throw { userMessage: "그룹 이름을 입력해 주세요." };
                const groupId = await repo.createGroup(name, data.get("nickname"));
                navigate(`#/g/${groupId}/manage`, "그룹을 만들었어요! 아래 초대 링크를 친구들에게 보내 주세요.");
            },
        });
    });

    $("[data-open=join]").addEventListener("click", () => {
        const formBox = $("[data-form]");
        formBox.innerHTML = `
            <form class="auth-form group-form" novalidate>
                <h3 class="auth-subtitle">초대 코드로 참여</h3>
                <label class="auth-field"><span>초대 코드 또는 초대 링크</span><input name="code" autocomplete="off" autocapitalize="characters" required placeholder="예) AB23CD45"></label>
                <p class="auth-error" role="alert"></p>
                <button type="submit" class="auth-button is-primary">다음</button>
            </form>`;
        formBox.querySelector("input").focus();
        handleSubmit(formBox.querySelector("form"), {
            errorBox: formBox.querySelector(".auth-error"),
            toMessage: errorMessage,
            onSubmit: async data => {
                const code = parseInviteCode(data.get("code"));
                if (!code) throw { message: "invalid_invite_code" };
                navigate(`#/join/${code}`);
            },
        });
    });

    try {
        const groups = await repo.listMyGroups(session.user.id);
        $("[data-list]").innerHTML = groups.length === 0
            ? `<div class="empty-state">
                   <p class="auth-lead">아직 들어간 그룹이 없어요.</p>
                   <p class="auth-note">그룹을 새로 만들거나, 친구에게 받은 초대 코드로 참여해 보세요.</p>
               </div>`
            : `<ul class="group-list">${groups.map(g => `
                <li>
                    <a class="group-card" href="#/g/${escapeHtml(g.id)}">
                        <span class="group-name">${escapeHtml(g.name)}</span>
                        <span class="group-meta">
                            ${g.role === "admin" ? `<span class="role-badge">방장</span>` : ""}
                            멤버 ${g.memberCount}명 · ${escapeHtml(g.nickname)}
                        </span>
                    </a>
                </li>`).join("")}</ul>`;
    } catch (error) {
        $("[data-list]").innerHTML = `<p class="auth-error">${escapeHtml(errorMessage(error))}</p>`;
    }
}

export async function joinView(container, { session, params, navigate }) {
    const code = parseInviteCode(params.code);
    const $ = render(container, `
        <section class="auth-panel">
            <h2 class="auth-title">그룹 참여</h2>
            <div data-body><p class="auth-note">초대 정보를 확인하는 중...</p></div>
        </section>`);
    const body = $("[data-body]");

    const invalid = () => {
        body.innerHTML = `
            <p class="auth-lead">${escapeHtml(errorMessage({ message: "invalid_invite_code" }))}</p>
            <nav class="auth-links"><a href="#/groups">내 그룹으로</a></nav>`;
    };
    if (!code) return invalid();

    try {
        const preview = await repo.previewInvite(code);
        if (!preview) return invalid();
        if (await repo.getGroup(preview.group_id)) {
            navigate(`#/g/${preview.group_id}`, "이미 참여한 그룹이에요.");
            return;
        }
        body.innerHTML = `
            <p class="auth-lead"><strong>${escapeHtml(preview.group_name)}</strong> 그룹에 초대받았어요.<br>지금 멤버 ${preview.member_count}명</p>
            <form class="auth-form" novalidate>
                ${nicknameField(defaultNickname(session.user))}
                <p class="auth-error" role="alert"></p>
                <button type="submit" class="auth-button is-primary">참여하기</button>
            </form>
            <nav class="auth-links"><a href="#/groups">나중에 할게요</a></nav>`;
        handleSubmit(body.querySelector("form"), {
            errorBox: body.querySelector(".auth-error"),
            toMessage: errorMessage,
            onSubmit: async data => {
                const groupId = await repo.joinGroup(code, data.get("nickname"));
                navigate(`#/g/${groupId}`, `${preview.group_name} 그룹에 참여했어요!`);
            },
        });
    } catch (error) {
        body.innerHTML = `<p class="auth-error">${escapeHtml(errorMessage(error))}</p>`;
    }
}

export function notFoundView(container) {
    render(container, `
        <section class="auth-panel">
            <h2 class="auth-title">페이지를 찾을 수 없어요</h2>
            <nav class="auth-links"><a href="#/">처음으로</a></nav>
        </section>`);
}
