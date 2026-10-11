// 주간 장부 탭 – legacy/src/main.js의 카드 화면을 새 데이터 구조로 옮긴 것
import { errorMessage } from "../../application/errors.js";
import { buildLedger, nextCheckValue, toDateKey } from "../../application/ledger.js";
import { mondayOf } from "../../domain/dates.js";
import * as repo from "../../infrastructure/ledger-repo.js";
import { escapeHtml } from "../dom.js";
import { pickDayOffs, pickDayTargets } from "../modals.js";
import { showToast } from "../toast.js";

const FIELD_OF_ROW = { start: "start_done", study: "study_done", bonus: "bonus_done" };

// 그룹별로 보고 있던 주를 기억 (탭을 오가도 유지)
const mondayByGroup = new Map();

function formatHours(value) {
    const n = Number(value);
    return `${Number.isInteger(n) ? n : n.toFixed(1)}시간`;
}

function markButton(row, dayIndex, kind, value, day) {
    const locked = !row.canEdit || day.isFuture || day.isOff;
    const state = day.isOff ? "is-off" : day.isFuture ? "is-locked" : value === true ? "is-on" : value === false ? "is-fail" : "is-empty";
    const text = day.isOff ? "OFF" : day.isFuture ? "" : value === true ? "○" : value === false ? "X" : "";
    return `
        <div class="flex justify-center">
            <button type="button" class="mark-button ${state} ${!row.canEdit ? "is-readonly" : ""}"
                data-action="mark" data-user="${row.userId}" data-day="${dayIndex}" data-kind="${kind}"
                ${locked ? "disabled" : ""} aria-label="${day.key} ${kind}">${text}</button>
        </div>`;
}

function markRow(row, kind, label) {
    return `
        <div class="grid grid-cols-8 items-center text-center">
            <div class="row-label">${escapeHtml(label)}</div>
            ${row.days.map((day, i) => markButton(row, i, kind, day[kind], day)).join("")}
        </div>`;
}

function card(row, ledger, group) {
    const paidButton = ledger.canMarkPaid
        ? `<button type="button" class="fine-paid-button ${row.fine.settled ? "is-paid" : row.fine.overdue ? "is-overdue" : "is-open"} ${row.fine.paidThisWeek ? "is-current-paid" : ""}"
               data-action="paid" data-user="${row.userId}" aria-pressed="${row.fine.paidThisWeek}">입금</button>`
        : `<span class="fine-status ${row.fine.settled ? "is-paid" : ""}">${row.fine.settled ? "정산 완료" : ledger.weekEnded && row.fine.amount < 0 ? "미입금" : ""}</span>`;

    return `
        <section class="friend-card ledger-row">
            <div class="ledger-row-head">
                <div class="ledger-person">
                    <h3>${escapeHtml(row.nickname)}${row.role === "admin" ? ` <span class="role-badge">방장</span>` : ""}</h3>
                </div>
                ${row.canEdit ? `
                <div class="ledger-actions">
                    <button type="button" class="card-action-link" data-action="targets" data-user="${row.userId}">시작 시간 설정</button>
                    <button type="button" class="dayoff-button ${row.dayOffIndices.length ? "is-active" : ""}" data-action="dayoff" data-user="${row.userId}">Day Off</button>
                </div>` : ""}
            </div>
            <div class="ledger-row-body">
                <div class="card-grid">
                    <div class="card-grid-header grid grid-cols-8 text-center">
                        <div class="row-label">구분</div>${ledger.days.map(d => `<div>${d.label}</div>`).join("")}
                    </div>
                    <div class="target-row grid grid-cols-8 text-center">
                        <div class="row-label" aria-hidden="true"></div>
                        <div class="target-values">${row.targets.map(t => `<span>${t}</span>`).join("")}</div>
                    </div>
                    ${markRow(row, "start", "시작 시간")}
                    ${markRow(row, "study", `${formatHours(group.min_study_hours)}`)}
                    ${ledger.bonusEnabled ? markRow(row, "bonus", `상점 ${formatHours(group.bonus_hours)}`) : ""}
                    <div class="score-row grid grid-cols-8 items-center text-center">
                        <div class="row-label">일일 점수</div>
                        ${row.days.map(d => `<div class="${d.score.cls}">${d.score.text}</div>`).join("")}
                    </div>
                </div>
            </div>
            <div class="ledger-row-foot">
                <div class="fine-summary ${row.fine.tone} ${row.fine.settled ? "is-paid" : ""}">
                    ${paidButton}
                    <span class="fine-amount">${row.fine.display}</span>
                </div>
            </div>
        </section>`;
}

export async function weekTab(body, { group, members, me }) {
    let monday = mondayByGroup.get(group.id) ?? mondayOf(new Date());
    let data = null;
    let ledger = null;

    const sundayKey = () => toDateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));

    function draw() {
        ledger = buildLedger({ group, members, ...data, monday, me });
        const first = ledger.days[0].label.split("(")[0];
        const last = ledger.days[6].label.split("(")[0];
        body.innerHTML = `
            <p class="rule-summary">
                공부 시간 <strong>${formatHours(group.min_study_hours)}</strong>
                ${ledger.bonusEnabled ? `· 상점 <strong>${formatHours(group.bonus_hours)} 이상</strong>` : "· 상점 없음"}
                · 벌금 <strong>₩${Number(group.fine_unit).toLocaleString()}/점</strong>
                ${group.edit_mode === "admin_only" ? `· <span class="rule-mode">방장만 기록</span>` : ""}
            </p>
            <div class="study-toolbar">
                <div class="study-week-control">
                    <button type="button" class="study-week-button" data-week="-1" aria-label="이전 주">‹</button>
                    <h3 class="week-title">${first} ~ ${last}</h3>
                    <button type="button" class="study-week-button" data-week="1" aria-label="다음 주">›</button>
                </div>
                ${toDateKey(mondayOf(new Date())) !== ledger.mondayKey ? `<button type="button" class="study-chip-button" data-week="0"><span>이번 주</span></button>` : ""}
            </div>
            ${ledger.rows.length === 0
                ? `<p class="auth-note coming-soon">이 주에는 기록할 멤버가 없어요.</p>`
                : `<div class="ledger-list">${ledger.rows.map(row => card(row, ledger, group)).join("")}</div>`}`;
    }

    async function load() {
        body.innerHTML = `<p class="auth-note coming-soon">불러오는 중...</p>`;
        try {
            data = await repo.loadLedgerData(group.id, sundayKey());
            draw();
        } catch (error) {
            body.innerHTML = `<p class="auth-error">${escapeHtml(errorMessage(error))}</p>`;
        }
    }

    // 화면을 먼저 바꾸고 저장은 순서대로 보낸다. 실패하면 서버 상태로 다시 불러온다.
    let saving = Promise.resolve();
    function optimistic(apply, save) {
        apply();
        draw();
        saving = saving.then(save).catch(async error => {
            showToast(errorMessage(error));
            await load();
        });
        return saving;
    }

    function upsertLocalRecord(userId, dateKey, values) {
        const existing = data.records.find(r => r.user_id === userId && r.date === dateKey);
        if (existing) Object.assign(existing, values);
        else data.records.push({ user_id: userId, date: dateKey, study_done: null, start_done: null, bonus_done: null, is_day_off: false, ...values });
    }

    body.onclick = async event => {
        const button = event.target.closest("[data-action], [data-week]");
        if (!button || button.disabled) return;

        if (button.dataset.week !== undefined) {
            const step = Number(button.dataset.week);
            monday = step === 0 ? mondayOf(new Date()) : new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + step * 7);
            mondayByGroup.set(group.id, monday);
            await load();
            return;
        }

        const userId = button.dataset.user;
        const row = ledger.rows.find(r => r.userId === userId);
        if (!row) return;

        if (button.dataset.action === "mark") {
            const dayIndex = Number(button.dataset.day);
            const day = row.days[dayIndex];
            const field = FIELD_OF_ROW[button.dataset.kind];
            const next = nextCheckValue(day[button.dataset.kind]);
            await optimistic(
                () => upsertLocalRecord(userId, day.key, { [field]: next }),
                () => repo.setDayValue(group.id, userId, day.key, field, next),
            );
        } else if (button.dataset.action === "dayoff") {
            const chosen = await pickDayOffs(row.dayOffIndices);
            if (!chosen) return;
            const keys = row.days.map(d => d.key);
            await optimistic(
                () => keys.forEach((key, i) => upsertLocalRecord(userId, key, { is_day_off: chosen.includes(i) })),
                () => repo.setDayOffs(group.id, userId, keys, chosen),
            );
        } else if (button.dataset.action === "targets") {
            const times = await pickDayTargets(row.targets);
            if (!times) return;
            await optimistic(
                () => {
                    data.targets = data.targets.filter(t => t.user_id !== userId)
                        .concat(times.map((start_time, weekday) => ({ user_id: userId, weekday, start_time })));
                },
                () => repo.setDayTargets(group.id, userId, times),
            );
        } else if (button.dataset.action === "paid") {
            const mondayKey = ledger.mondayKey;
            if (row.fine.paidThisWeek) {
                await optimistic(
                    () => { data.payments = data.payments.filter(p => !(p.user_id === userId && p.settled_through_week === mondayKey)); },
                    () => repo.unmarkPaid(group.id, userId, mondayKey),
                );
            } else {
                const amount = Math.max(0, -row.fine.amount);
                await optimistic(
                    () => data.payments.push({ user_id: userId, settled_through_week: mondayKey, amount }),
                    () => repo.markPaid(group.id, userId, mondayKey, amount),
                );
            }
        }
    };

    await load();
}
