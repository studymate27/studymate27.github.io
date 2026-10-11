import { errorMessage } from "../../application/errors.js";
import { parseSettingsForm } from "../../application/settings-form.js";
import * as repo from "../../infrastructure/groups-repo.js";
import { escapeHtml, handleSubmit, render } from "../dom.js";
import { confirmModal } from "../modals.js";
import { showToast } from "../toast.js";
import { bindInvitePanel, invitePanel } from "./groups.js";

const hoursValue = v => String(Number(v));

function settingsSection(group) {
    return `
        <section class="manage-section">
            <h3 class="auth-subtitle">규칙 설정</h3>
            <form class="auth-form" data-form="settings" novalidate>
                <label class="auth-field"><span>그룹 이름</span><input name="name" maxlength="40" required value="${escapeHtml(group.name)}"></label>
                <div class="field-row">
                    <label class="auth-field"><span>최소 공부 시간 (시간)</span><input name="min_study_hours" inputmode="decimal" value="${hoursValue(group.min_study_hours)}"></label>
                    <label class="auth-field"><span>기본 시작 시간</span><input name="default_start_time" inputmode="numeric" maxlength="5" value="${escapeHtml(String(group.default_start_time).slice(0, 5))}"></label>
                </div>
                <label class="check-field"><input type="checkbox" name="bonus_enabled" ${group.bonus_enabled ? "checked" : ""}> 상점 사용</label>
                <div class="field-row">
                    <label class="auth-field"><span>상점 기준 (시간 이상)</span><input name="bonus_hours" inputmode="decimal" value="${hoursValue(group.bonus_hours)}"></label>
                    <label class="auth-field"><span>벌금 단위 (원/점)</span><input name="fine_unit" inputmode="numeric" value="${group.fine_unit}"></label>
                </div>
                <fieldset class="choice-field">
                    <legend>기록 권한</legend>
                    <label><input type="radio" name="edit_mode" value="self" ${group.edit_mode === "self" ? "checked" : ""}> 자율 – 각자 자기 기록을 체크해요 (방장은 모두 가능)</label>
                    <label><input type="radio" name="edit_mode" value="admin_only" ${group.edit_mode === "admin_only" ? "checked" : ""}> 방장 관리 – 방장만 체크할 수 있어요</label>
                </fieldset>
                <p class="auth-error" role="alert"></p>
                <button type="submit" class="auth-button is-primary">설정 저장</button>
            </form>
        </section>`;
}

function rulesReadonly(group) {
    return `
        <section class="manage-section">
            <h3 class="auth-subtitle">규칙</h3>
            <dl class="account-info">
                <dt>최소 공부 시간</dt><dd>${hoursValue(group.min_study_hours)}시간</dd>
                <dt>상점</dt><dd>${group.bonus_enabled ? `${hoursValue(group.bonus_hours)}시간 이상` : "사용 안 함"}</dd>
                <dt>벌금 단위</dt><dd>₩${Number(group.fine_unit).toLocaleString()}/점</dd>
                <dt>기본 시작 시간</dt><dd>${escapeHtml(String(group.default_start_time).slice(0, 5))}</dd>
                <dt>기록 권한</dt><dd>${group.edit_mode === "self" ? "자율 (각자 자기 기록)" : "방장 관리 (방장만)"}</dd>
            </dl>
            <p class="auth-note">규칙은 방장이 바꿀 수 있어요.</p>
        </section>`;
}

function ddaySection(group) {
    const ddays = [...(group.group_ddays ?? [])].sort((a, b) => a.target_date.localeCompare(b.target_date));
    return `
        <section class="manage-section">
            <h3 class="auth-subtitle">디데이 (${ddays.length}/3)</h3>
            ${ddays.length ? `<ul class="member-list">${ddays.map(d => `
                <li><span>${escapeHtml(d.label)} <span class="auth-note">${escapeHtml(d.target_date)}</span></span>
                    <button type="button" class="text-button is-danger" data-action="dday-delete" data-id="${d.id}">삭제</button></li>`).join("")}</ul>`
                : `<p class="auth-note">등록된 디데이가 없어요.</p>`}
            ${ddays.length < 3 ? `
            <form class="auth-form" data-form="dday" novalidate>
                <div class="field-row">
                    <label class="auth-field"><span>이름</span><input name="label" maxlength="20" required placeholder="예) 수능"></label>
                    <label class="auth-field"><span>날짜</span><input name="date" type="date" required></label>
                </div>
                <p class="auth-error" role="alert"></p>
                <button type="submit" class="auth-button">디데이 추가</button>
            </form>` : ""}
        </section>`;
}

function memberSection(members, me, isAdmin) {
    return `
        <section class="manage-section">
            <h3 class="auth-subtitle">멤버 ${members.length}명</h3>
            <ul class="member-list">${members.map((m, i) => `
                <li class="member-item">
                    <span class="member-name">${escapeHtml(m.nickname)}${m.user_id === me.userId ? ` <span class="auth-note">(나)</span>` : ""}
                        ${m.role === "admin" ? `<span class="role-badge">방장</span>` : ""}</span>
                    ${isAdmin ? `
                    <span class="member-actions">
                        <button type="button" class="text-button" data-action="move" data-index="${i}" data-step="-1" ${i === 0 ? "disabled" : ""} aria-label="위로">↑</button>
                        <button type="button" class="text-button" data-action="move" data-index="${i}" data-step="1" ${i === members.length - 1 ? "disabled" : ""} aria-label="아래로">↓</button>
                        ${m.user_id !== me.userId ? `
                            ${m.role === "admin"
                                ? `<button type="button" class="text-button" data-action="demote" data-user="${m.user_id}">방장 해제</button>`
                                : `<button type="button" class="text-button" data-action="promote" data-user="${m.user_id}">방장 지정</button>
                                   <button type="button" class="text-button" data-action="transfer" data-user="${m.user_id}">방장 넘기기</button>`}
                            <button type="button" class="text-button is-danger" data-action="remove" data-user="${m.user_id}">내보내기</button>` : ""}
                    </span>` : ""}
                </li>`).join("")}
            </ul>
            ${isAdmin ? `<p class="auth-note">↑↓로 장부의 카드 순서를 바꿀 수 있어요. 방장은 여러 명 둘 수 있어요.</p>` : ""}
        </section>`;
}

function mySection(meMember) {
    return `
        <section class="manage-section">
            <h3 class="auth-subtitle">내 정보</h3>
            <form class="auth-form" data-form="nickname" novalidate>
                <label class="auth-field"><span>이 그룹에서 쓰는 닉네임</span><input name="nickname" maxlength="20" required value="${escapeHtml(meMember?.nickname ?? "")}"></label>
                <p class="auth-error" role="alert"></p>
                <button type="submit" class="auth-button">닉네임 저장</button>
            </form>
            <button type="button" class="auth-button is-danger" data-action="leave">그룹 나가기</button>
        </section>`;
}

export function manageTab(body, { group, members, me, refresh, navigate }) {
    const isAdmin = me.role === "admin";
    const meMember = members.find(m => m.user_id === me.userId);
    const $ = render(body, `
        <section class="manage-section">
            <h3 class="auth-subtitle">친구 초대</h3>
            ${invitePanel(group.invite_code)}
            ${isAdmin ? `<button type="button" class="text-button" data-action="regenerate">초대 코드 새로 만들기</button>` : ""}
        </section>
        ${isAdmin ? settingsSection(group) : rulesReadonly(group)}
        ${isAdmin ? ddaySection(group) : ""}
        ${memberSection(members, me, isAdmin)}
        ${mySection(meMember)}`);
    bindInvitePanel($, group.invite_code);

    const settingsForm = $("[data-form=settings]");
    if (settingsForm) {
        handleSubmit(settingsForm, {
            errorBox: settingsForm.querySelector(".auth-error"),
            toMessage: errorMessage,
            onSubmit: async data => {
                await repo.updateGroup(group.id, parseSettingsForm(data));
                await refresh("설정을 저장했어요.");
            },
        });
    }

    const ddayForm = $("[data-form=dday]");
    if (ddayForm) {
        handleSubmit(ddayForm, {
            errorBox: ddayForm.querySelector(".auth-error"),
            toMessage: errorMessage,
            onSubmit: async data => {
                const label = String(data.get("label")).trim();
                const date = data.get("date");
                if (!label || !date) throw { userMessage: "이름과 날짜를 입력해 주세요." };
                await repo.addDday(group.id, label, date);
                await refresh("디데이를 추가했어요.");
            },
        });
    }

    const nicknameForm = $("[data-form=nickname]");
    handleSubmit(nicknameForm, {
        errorBox: nicknameForm.querySelector(".auth-error"),
        toMessage: errorMessage,
        onSubmit: async data => {
            const nickname = String(data.get("nickname")).trim();
            if (!nickname) throw { message: "invalid_nickname" };
            await repo.updateNickname(group.id, me.userId, nickname);
            await refresh("닉네임을 바꿨어요.");
        },
    });

    const nameOf = userId => members.find(m => m.user_id === userId)?.nickname ?? "";

    body.onclick = async event => {
        const button = event.target.closest("button[data-action]");
        if (!button || button.disabled) return;
        const { action, user } = button.dataset;
        try {
            if (action === "regenerate") {
                if (!await confirmModal("초대 코드 새로 만들기", "지금까지 보낸 초대 링크는 더 이상 쓸 수 없어요. 새로 만들까요?", "새로 만들기")) return;
                await repo.regenerateInviteCode(group.id);
                await refresh("새 초대 코드를 만들었어요.");
            } else if (action === "dday-delete") {
                await repo.deleteDday(button.dataset.id);
                await refresh("디데이를 삭제했어요.");
            } else if (action === "move") {
                const order = members.map(m => m.user_id);
                const i = Number(button.dataset.index);
                const j = i + Number(button.dataset.step);
                [order[i], order[j]] = [order[j], order[i]];
                await repo.reorderMembers(group.id, order);
                await refresh();
            } else if (action === "promote") {
                await repo.setMemberRole(group.id, user, "admin");
                await refresh(`${nameOf(user)} 님을 방장으로 지정했어요.`);
            } else if (action === "demote") {
                await repo.setMemberRole(group.id, user, "member");
                await refresh(`${nameOf(user)} 님의 방장을 해제했어요.`);
            } else if (action === "transfer") {
                if (!await confirmModal("방장 넘기기", `${nameOf(user)} 님이 방장이 되고, 나는 일반 멤버가 돼요.`, "넘기기")) return;
                await repo.transferAdmin(group.id, user);
                await refresh(`${nameOf(user)} 님에게 방장을 넘겼어요.`);
            } else if (action === "remove") {
                if (!await confirmModal("멤버 내보내기", `${nameOf(user)} 님을 그룹에서 내보낼까요? 지금까지의 기록은 그룹에 남아요.`, "내보내기")) return;
                await repo.removeMember(group.id, user);
                await refresh(`${nameOf(user)} 님을 내보냈어요.`);
            } else if (action === "leave") {
                const alone = members.length === 1;
                const message = alone ? "혼자 남은 그룹이라 나가면 그룹이 삭제돼요." : "그룹에서 나갈까요? 다시 들어오려면 초대 링크가 필요해요.";
                if (!await confirmModal("그룹 나가기", message, "나가기")) return;
                await repo.leaveGroup(group.id);
                navigate("#/groups", alone ? "그룹을 삭제했어요." : "그룹에서 나왔어요.");
            }
        } catch (error) {
            showToast(errorMessage(error));
        }
    };
}
