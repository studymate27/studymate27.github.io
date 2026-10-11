import { errorMessage } from "../../application/errors.js";
import { buildMonthly, monthRange } from "../../application/monthly-view.js";
import * as repo from "../../infrastructure/ledger-repo.js";
import { escapeHtml } from "../dom.js";

const monthByGroup = new Map();
const won = n => `₩${n.toLocaleString()}`;
const STATUS = { paid: ["정산 완료", "is-paid"], unpaid: ["미정산", "is-unpaid"], none: ["-", ""] };

export async function monthTab(body, { group, members }) {
    const now = new Date();
    let cursor = monthByGroup.get(group.id) ?? { year: now.getFullYear(), month: now.getMonth() + 1 };

    async function load() {
        body.innerHTML = `<p class="auth-note coming-soon">불러오는 중...</p>`;
        try {
            const { first, last } = monthRange(cursor.year, cursor.month);
            const data = await repo.loadMonthData(group.id, first, last);
            draw(buildMonthly({ group, members, ...data, ...cursor }));
        } catch (error) {
            body.innerHTML = `<p class="auth-error">${escapeHtml(errorMessage(error))}</p>`;
        }
    }

    function draw(view) {
        const isThisMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth() + 1;
        body.innerHTML = `
            <div class="study-toolbar">
                <div class="study-week-control">
                    <button type="button" class="study-week-button" data-month="-1" aria-label="이전 달">‹</button>
                    <h3 class="week-title">${view.year}년 ${view.month}월</h3>
                    <button type="button" class="study-week-button" data-month="1" aria-label="다음 달">›</button>
                </div>
                ${isThisMonth ? "" : `<button type="button" class="study-chip-button" data-month="0"><span>이번 달</span></button>`}
            </div>
            ${view.inProgress ? `<p class="auth-note">진행 중인 달이에요. 오늘까지의 기록만 셌어요.</p>` : ""}
            ${view.rows.length === 0 ? `<p class="auth-note coming-soon">이 달에는 기록할 멤버가 없어요.</p>` : `
            <div class="month-table-wrap">
                <table class="month-table">
                    <thead>
                        <tr>
                            <th scope="col">멤버</th>
                            <th scope="col">벌점</th>
                            ${view.bonusEnabled ? `<th scope="col">상점</th>` : ""}
                            <th scope="col">벌금</th>
                            <th scope="col">정산</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${view.rows.map(r => `
                        <tr>
                            <th scope="row">${escapeHtml(r.nickname)}</th>
                            <td>${r.penalty}</td>
                            ${view.bonusEnabled ? `<td>${r.bonus}</td>` : ""}
                            <td class="${r.fine > 0 ? "is-fine" : ""}">${won(r.fine)}</td>
                            <td><span class="month-status ${STATUS[r.status][1]}">${STATUS[r.status][0]}</span></td>
                        </tr>`).join("")}
                    </tbody>
                    <tfoot>
                        <tr>
                            <th scope="row">합계</th>
                            <td>${view.total.penalty}</td>
                            ${view.bonusEnabled ? `<td>${view.total.bonus}</td>` : ""}
                            <td>${won(view.total.fine)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <p class="auth-note">월간 벌금은 그 달의 벌점에서 상점을 뺀 만큼이에요. 다음 달로 넘어가지 않아요. 정산은 주간 장부에서 방장이 처리해요.</p>`}`;
    }

    body.onclick = async event => {
        const button = event.target.closest("[data-month]");
        if (!button) return;
        const step = Number(button.dataset.month);
        if (step === 0) cursor = { year: now.getFullYear(), month: now.getMonth() + 1 };
        else {
            const d = new Date(cursor.year, cursor.month - 1 + step, 1);
            cursor = { year: d.getFullYear(), month: d.getMonth() + 1 };
        }
        monthByGroup.set(group.id, cursor);
        await load();
    };

    await load();
}
