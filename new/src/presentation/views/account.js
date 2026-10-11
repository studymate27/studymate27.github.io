import * as auth from "../../application/auth.js";
import { errorMessage } from "../../application/errors.js";
import { escapeHtml, handleSubmit, render } from "../dom.js";

export function accountView(container, { session, flash }) {
    const user = session.user;
    const canChangePassword = auth.hasPasswordLogin(user);
    const $ = render(container, `
        <section class="auth-panel">
            <h2 class="auth-title">내 계정</h2>
            ${flash ? `<p class="auth-flash" role="status">${escapeHtml(flash)}</p>` : ""}
            <dl class="account-info">
                <dt>이메일</dt><dd>${escapeHtml(user.email)}</dd>
                <dt>로그인 방법</dt><dd>${(user.identities ?? []).map(i => i.provider === "google" ? "구글" : "이메일").join(", ")}</dd>
            </dl>
            ${canChangePassword ? `
            <form class="auth-form" novalidate>
                <h3 class="auth-subtitle">비밀번호 변경</h3>
                <label class="auth-field"><span>새 비밀번호 (6자 이상)</span><input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
                <label class="auth-field"><span>새 비밀번호 확인</span><input name="confirm" type="password" autocomplete="new-password" minlength="6" required></label>
                <p class="auth-error" role="alert"></p>
                <button type="submit" class="auth-button">비밀번호 바꾸기</button>
            </form>` : ""}
            <button type="button" class="auth-button" data-logout>로그아웃</button>
            <nav class="auth-links"><a href="#/groups">내 그룹으로</a></nav>
        </section>`);

    if (canChangePassword) {
        const form = $("form");
        handleSubmit(form, {
            errorBox: $(".auth-error"),
            toMessage: errorMessage,
            onSubmit: async data => {
                if (data.get("password") !== data.get("confirm")) throw { userMessage: "비밀번호 확인이 일치하지 않아요." };
                await auth.updatePassword(data.get("password"));
                form.reset();
                $(".auth-error").textContent = "비밀번호를 바꿨어요.";
            },
        });
    }
    $("[data-logout]").addEventListener("click", () => auth.signOut());
}
