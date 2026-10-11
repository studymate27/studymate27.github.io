export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function render(container, html) {
    container.innerHTML = html;
    return selector => container.querySelector(selector);
}

// 폼 제출 중 버튼 잠금 + 오류 표시를 한곳에서 처리
export function handleSubmit(form, { onSubmit, errorBox, toMessage }) {
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const button = form.querySelector("button[type=submit]");
        const label = button.textContent;
        button.disabled = true;
        button.textContent = "잠시만요...";
        errorBox.textContent = "";
        try {
            await onSubmit(new FormData(form));
        } catch (error) {
            errorBox.textContent = toMessage(error);
        } finally {
            button.disabled = false;
            button.textContent = label;
        }
    });
}
