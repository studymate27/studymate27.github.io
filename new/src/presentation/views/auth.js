import * as auth from "../../application/auth.js";
import { errorMessage } from "../../application/errors.js";
import { escapeHtml, handleSubmit, render } from "../dom.js";

const GOOGLE_ICON = `<svg aria-hidden="true" viewBox="0 0 18 18" width="18" height="18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>`;

function shell(title, body, { lead = "", flash = "" } = {}) {
    return `
        <section class="auth-panel">
            <h2 class="auth-title">${title}</h2>
            ${lead ? `<p class="auth-lead">${lead}</p>` : ""}
            ${flash ? `<p class="auth-flash" role="status">${escapeHtml(flash)}</p>` : ""}
            ${body}
        </section>`;
}

const emailField = (value = "") => `
    <label class="auth-field">
        <span>이메일</span>
        <input name="email" type="email" autocomplete="email" required value="${escapeHtml(value)}">
    </label>`;

const passwordField = (name, label, autocomplete) => `
    <label class="auth-field">
        <span>${label}</span>
        <input name="${name}" type="password" autocomplete="${autocomplete}" minlength="6" required>
    </label>`;

function bindGoogle($) {
    $("[data-google]").addEventListener("click", async () => {
        $(".auth-error").textContent = "";
        try {
            await auth.signInWithGoogle();
        } catch (error) {
            $(".auth-error").textContent = errorMessage(error);
        }
    });
}

const googleBlock = `
    <div class="auth-divider"><span>또는</span></div>
    <button type="button" class="auth-button is-google" data-google>${GOOGLE_ICON}<span>구글로 계속하기</span></button>`;

export function loginView(container, { flash }) {
    const $ = render(container, shell("로그인", `
        <form class="auth-form" novalidate>
            ${emailField()}
            ${passwordField("password", "비밀번호", "current-password")}
            <p class="auth-error" role="alert"></p>
            <button type="submit" class="auth-button is-primary">로그인</button>
        </form>
        ${googleBlock}
        <nav class="auth-links">
            <a href="#/signup">회원가입</a>
            <a href="#/forgot">비밀번호 찾기</a>
        </nav>`, { flash }));

    handleSubmit($("form"), {
        errorBox: $(".auth-error"),
        toMessage: errorMessage,
        onSubmit: async form => {
            await auth.signIn(form.get("email").trim(), form.get("password"));
            // 이동은 로그인 상태 변경 이벤트에서 처리
        },
    });
    bindGoogle($);
}

export function signupView(container) {
    const $ = render(container, shell("회원가입", `
        <form class="auth-form" novalidate>
            ${emailField()}
            ${passwordField("password", "비밀번호 (6자 이상)", "new-password")}
            ${passwordField("confirm", "비밀번호 확인", "new-password")}
            <p class="auth-error" role="alert"></p>
            <button type="submit" class="auth-button is-primary">가입하기</button>
        </form>
        ${googleBlock}
        <nav class="auth-links">
            <a href="#/login">이미 계정이 있어요</a>
        </nav>`, { lead: "실제로 쓰는 이메일로 가입해 주세요. 인증 메일과 비밀번호 찾기 메일이 이 주소로 가요." }));

    handleSubmit($("form"), {
        errorBox: $(".auth-error"),
        toMessage: errorMessage,
        onSubmit: async form => {
            const email = form.get("email").trim();
            const password = form.get("password");
            if (password !== form.get("confirm")) throw { userMessage: "비밀번호 확인이 일치하지 않아요." };
            const result = await auth.signUp(email, password);
            // 이미 가입된 이메일이면 Supabase는 오류 대신 identities가 빈 사용자를 돌려준다
            if (result.user && result.user.identities?.length === 0) {
                throw { message: "User already registered" };
            }
            checkEmailView(container, { email, kind: "signup" });
        },
    });
    bindGoogle($);
}

export function checkEmailView(container, { email, kind }) {
    const lead = kind === "signup"
        ? `<strong>${escapeHtml(email)}</strong> 으로 인증 메일을 보냈어요.<br>메일의 링크를 누르면 가입이 끝나요.`
        : `<strong>${escapeHtml(email)}</strong> 으로 비밀번호 재설정 메일을 보냈어요.<br>메일의 링크를 눌러 새 비밀번호를 정해 주세요.`;
    const $ = render(container, shell("메일을 확인해 주세요", `
        <p class="auth-note">메일이 안 보이면 스팸함도 확인해 주세요. 링크는 이 브라우저에서 여는 게 가장 확실해요.</p>
        <p class="auth-error" role="alert"></p>
        ${kind === "signup" ? `<button type="button" class="auth-button" data-resend>인증 메일 다시 보내기</button>` : ""}
        <nav class="auth-links"><a href="#/login">로그인으로 돌아가기</a></nav>`, { lead }));

    $("[data-resend]")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            await auth.resendSignupEmail(email);
            $(".auth-error").textContent = "다시 보냈어요.";
        } catch (error) {
            $(".auth-error").textContent = errorMessage(error);
        } finally {
            button.disabled = false;
        }
    });
}

export function forgotView(container, { flash }) {
    const $ = render(container, shell("비밀번호 찾기", `
        <form class="auth-form" novalidate>
            ${emailField()}
            <p class="auth-error" role="alert"></p>
            <button type="submit" class="auth-button is-primary">재설정 메일 받기</button>
        </form>
        <nav class="auth-links"><a href="#/login">로그인으로 돌아가기</a></nav>`,
    { lead: "가입한 이메일을 입력하면 비밀번호를 새로 정할 수 있는 링크를 보내드려요.", flash }));

    handleSubmit($("form"), {
        errorBox: $(".auth-error"),
        toMessage: errorMessage,
        onSubmit: async form => {
            const email = form.get("email").trim();
            await auth.sendPasswordReset(email);
            checkEmailView(container, { email, kind: "reset" });
        },
    });
}

export function resetView(container, { navigate }) {
    const $ = render(container, shell("새 비밀번호 정하기", `
        <form class="auth-form" novalidate>
            ${passwordField("password", "새 비밀번호 (6자 이상)", "new-password")}
            ${passwordField("confirm", "새 비밀번호 확인", "new-password")}
            <p class="auth-error" role="alert"></p>
            <button type="submit" class="auth-button is-primary">비밀번호 바꾸기</button>
        </form>`));

    handleSubmit($("form"), {
        errorBox: $(".auth-error"),
        toMessage: errorMessage,
        onSubmit: async form => {
            const password = form.get("password");
            if (password !== form.get("confirm")) throw { userMessage: "비밀번호 확인이 일치하지 않아요." };
            await auth.updatePassword(password);
            navigate("#/groups", "비밀번호를 바꿨어요.");
        },
    });
}
