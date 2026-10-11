import { formatTimeTyping, normalizeTimeText } from "../domain/time-input.js";
import { escapeHtml } from "./dom.js";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * 확인/취소 모달. 확인하면 read(panel)의 결과, 취소·바깥 클릭·Esc면 null.
 */
export function openModal({ title, body, read, onOpen, okLabel = "확인" }) {
    return new Promise(resolve => {
        const modal = document.createElement("div");
        modal.className = "study-modal";
        modal.innerHTML = `
            <div class="study-modal-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                <h3 class="target-week-title">${escapeHtml(title)}</h3>
                ${body}
                <div class="modal-actions">
                    <button type="button" class="study-modal-button" data-cancel>취소</button>
                    <button type="button" class="study-modal-button is-primary" data-ok>${escapeHtml(okLabel)}</button>
                </div>
            </div>`;
        const panel = modal.firstElementChild;
        const close = value => {
            document.removeEventListener("keydown", onKey);
            modal.remove();
            resolve(value);
        };
        const onKey = event => { if (event.key === "Escape") close(null); };
        modal.addEventListener("click", event => { if (event.target === modal) close(null); });
        panel.querySelector("[data-cancel]").addEventListener("click", () => close(null));
        panel.querySelector("[data-ok]").addEventListener("click", () => close(read(panel)));
        document.addEventListener("keydown", onKey);
        document.body.appendChild(modal);
        onOpen?.(panel);
        panel.querySelector("[data-ok]").focus();
    });
}

export function pickDayOffs(selected) {
    const chosen = new Set(selected);
    return openModal({
        title: "Day Off 요일 선택",
        body: `<div class="dayoff-week-fields">${DAY_LABELS.map((day, i) => `
            <button type="button" data-day="${i}" class="dayoff-week-button ${chosen.has(i) ? "is-selected" : ""}" aria-pressed="${chosen.has(i)}">${day}</button>`).join("")}
        </div>`,
        onOpen: panel => panel.querySelectorAll("[data-day]").forEach(button => {
            button.addEventListener("click", () => {
                const on = button.classList.toggle("is-selected");
                button.setAttribute("aria-pressed", String(on));
            });
        }),
        read: panel => [...panel.querySelectorAll("[data-day].is-selected")].map(b => Number(b.dataset.day)),
    });
}

export function pickDayTargets(targets) {
    return openModal({
        title: "요일별 시작 시간",
        body: `<div class="target-week-fields">${DAY_LABELS.map((day, i) => `
            <label class="target-week-field">
                <span>${day}</span>
                <input type="text" inputmode="numeric" autocomplete="off" maxlength="5" value="${escapeHtml(targets[i])}" data-target="${i}">
            </label>`).join("")}
        </div>`,
        onOpen: panel => panel.querySelectorAll("[data-target]").forEach(input => {
            input.addEventListener("input", () => { input.value = formatTimeTyping(input.value); });
            input.addEventListener("blur", () => { input.value = normalizeTimeText(input.value); });
        }),
        read: panel => [...panel.querySelectorAll("[data-target]")].map(input => normalizeTimeText(input.value)),
    });
}

export function confirmModal(title, message, okLabel = "확인") {
    return openModal({
        title,
        body: `<p class="modal-message">${escapeHtml(message)}</p>`,
        okLabel,
        read: () => true,
    }).then(Boolean);
}
