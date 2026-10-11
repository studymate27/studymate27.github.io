import "./styles.css";
import { getSession, onAuthChange } from "./application/auth.js";
import { parseRoute, resolveNavigation } from "./application/navigation.js";
import { supabase } from "./infrastructure/supabase-client.js";
import { escapeHtml } from "./presentation/dom.js";
import { accountView } from "./presentation/views/account.js";
import { forgotView, loginView, resetView, signupView } from "./presentation/views/auth.js";
import { groupView } from "./presentation/views/group.js";
import { groupsView, joinView, notFoundView } from "./presentation/views/groups.js";

const RETURN_TO_KEY = "studymate:returnTo";
const container = document.getElementById("app");
const accountLink = document.getElementById("account-link");

let session = null;
let flash = "";

const views = {
    login: loginView,
    signup: signupView,
    forgot: forgotView,
    reset: resetView,
    groups: groupsView,
    account: accountView,
    join: joinView,
    group: groupView,
    notFound: notFoundView,
};

function storage(action, value) {
    try {
        if (action === "get") return sessionStorage.getItem(RETURN_TO_KEY);
        if (action === "set") sessionStorage.setItem(RETURN_TO_KEY, value);
        if (action === "clear") sessionStorage.removeItem(RETURN_TO_KEY);
    } catch {
        return null;
    }
    return null;
}

function navigate(hash, message = "") {
    flash = message;
    if (window.location.hash === hash) route();
    else window.location.hash = hash;
}

function route() {
    const hash = window.location.hash || "#/";
    const current = parseRoute(hash);
    const decision = resolveNavigation(current, hash, { hasSession: Boolean(session), returnTo: storage("get") });

    if (decision.saveReturnTo) storage("set", decision.saveReturnTo);
    if (decision.clearReturnTo) storage("clear");
    if (decision.redirect) {
        window.location.replace(decision.redirect);
        return;
    }

    accountLink.classList.toggle("hidden", !session);
    const message = flash;
    flash = "";
    views[current.name](container, { session, params: current.params, flash: message, navigate });
    window.scrollTo(0, 0);
}

// 메일 링크·구글 로그인에서 돌아온 경우 주소의 ?code=, ?error= 를 정리하고 안내 문구를 정한다
function consumeRedirectParams(hadSession) {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("code") && !params.has("error") && !params.has("error_description")) return;

    if (params.has("error_description") || params.has("error")) {
        const description = params.get("error_description") || "";
        flash = /expired|invalid/i.test(description)
            ? "링크가 만료됐거나 이미 사용됐어요. 다시 요청해 주세요."
            : "로그인 중 문제가 생겼어요. 다시 시도해 주세요.";
    } else if (!hadSession) {
        // 다른 브라우저에서 메일 링크를 연 경우: 링크를 요청한 브라우저가 아니라 세션을 만들 수 없다
        flash = window.location.hash.startsWith("#/reset")
            ? "비밀번호 재설정 메일을 요청한 브라우저에서 링크를 열어 주세요. 여기서 다시 요청해도 돼요."
            : "이메일 인증이 완료됐어요. 로그인해 주세요.";
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
}

async function boot() {
    if (!supabase) {
        container.innerHTML = `<p class="auth-lead">서버 설정이 없어요. 관리자에게 알려 주세요.</p>`;
        return;
    }
    try {
        session = await getSession();
    } catch (error) {
        console.error(error);
    }
    consumeRedirectParams(Boolean(session));

    onAuthChange((event, nextSession) => {
        const changed = Boolean(session) !== Boolean(nextSession);
        session = nextSession;
        if (event === "PASSWORD_RECOVERY") {
            setTimeout(() => navigate("#/reset"), 0);
        } else if (changed) {
            // 콜백 안에서 Supabase를 다시 부르면 교착이 생길 수 있어 다음 틱으로 미룬다
            setTimeout(() => navigate(nextSession ? (window.location.hash || "#/") : "#/login",
                nextSession ? "" : "로그아웃했어요."), 0);
        }
    });

    window.addEventListener("hashchange", route);
    route();
}

boot().catch(error => {
    container.innerHTML = `<p class="auth-lead">문제가 생겼어요: ${escapeHtml(error.message)}</p>`;
});
