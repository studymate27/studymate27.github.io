import { escapeHtml, render } from "../dom.js";

// 4단계에서 그룹 목록·만들기·참여로 채운다
export function groupsView(container, { flash }) {
    render(container, `
        <section class="auth-panel">
            <h2 class="auth-title">내 그룹</h2>
            ${flash ? `<p class="auth-flash" role="status">${escapeHtml(flash)}</p>` : ""}
            <p class="auth-lead">그룹 기능은 곧 열려요.</p>
        </section>`);
}

export function notFoundView(container) {
    render(container, `
        <section class="auth-panel">
            <h2 class="auth-title">페이지를 찾을 수 없어요</h2>
            <nav class="auth-links"><a href="#/">처음으로</a></nav>
        </section>`);
}
