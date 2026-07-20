import { MASTER_WEEK_KEY, SETTINGS_NAME, SETTINGS_WEEK_KEY } from "./application/settings.js";
import { formatDday, getDday, getWeekDates, parseDateKey, parseWeekKeyDate } from "./domain/dates.js";
import { computeScoreChain, computeWeekRaw, dayDeltaDisplay, dayOffIndices } from "./domain/scoring.js";
import { parseDayTargets } from "./domain/targets.js";
import { readFriendOrder, readLocalBackup, writeFriendOrder, writeLocalBackup } from "./infrastructure/local-storage.js";
import { createSupabaseClient, ensureSupabaseLib } from "./infrastructure/supabase-client.js";
import {
    closeBonusPicker,
    closeDayOffPicker,
    closeFineUnitPicker,
    closeTargetWeekPicker,
    closeTimePicker,
    openBonusPicker,
    openDayOffPicker,
    openFineUnitPicker,
    openTargetWeekPicker,
    openTimePicker
} from "./presentation/pickers.js";

let supabaseClient = null;

let weekOffset = 0;
let currentWeekDates = [];
let serverData = [];
let syncedWeeks = new Set(); // 이미 마스터 동기화를 완료한 주차 (중복 라운드트립 방지)

// ===== 상점/벌점 시스템 =====
// (공부 최소기준은 이제 study_done_list 토글로 직접 판단해요)
let bonusHours = 7;                  // 보너스 기준(표시용) - 실제 보너스 지급은 별 토글로 직접 판단
let minimumHours = 3;                // 공부시간 미달성 판단 기준(표시용)
let fineUnit = 500;                  // 벌점 1점당 벌금
let masterByName = {};               // name -> master_list row
let rowsByNameWeek = {};             // name -> { weekKey: row }

const emptyWeekValues = () => [null, null, null, null, null, null, null];

function normalizeWeekValues(list) {
    if (!Array.isArray(list) || list.length !== 7) return emptyWeekValues();
    if (list.every(value => value === false)) return emptyWeekValues();
    return [...list];
}

function nextCheckValue(value) {
    if (value === null || value === undefined) return true;
    if (value === true) return false;
    return null;
}

function isDayOff(friend, dayIndex) {
    return dayOffIndices(friend).includes(dayIndex);
}

function readRowMeta(row) {
    if (!row || !row.Notes) return {};
    try {
        const parsed = JSON.parse(row.Notes);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch(e) {
        return {};
    }
}

function writeRowMeta(row, updates) {
    return JSON.stringify({ ...readRowMeta(row), ...updates });
}

function isFinePaid(friend) {
    return readRowMeta(friend).finePaid === true;
}

function weekTime(weekKey) {
    const date = parseWeekKeyDate(weekKey);
    return date ? date.getTime() : null;
}

function hasPaymentAtOrAfter(targetWeekKey, weeksMap) {
    const targetTime = weekTime(targetWeekKey);
    if (targetTime === null || !weeksMap) return false;
    return Object.entries(weeksMap).some(([weekKey, row]) => {
        const rowTime = weekTime(weekKey);
        return rowTime !== null && rowTime >= targetTime && isFinePaid(row);
    });
}

function lastPaymentTimeOnOrBefore(targetWeekKey, weeksMap) {
    const targetTime = weekTime(targetWeekKey);
    if (targetTime === null || !weeksMap) return null;
    let paidTime = null;
    Object.entries(weeksMap).forEach(([weekKey, row]) => {
        const rowTime = weekTime(weekKey);
        if (rowTime !== null && rowTime <= targetTime && isFinePaid(row)) {
            paidTime = paidTime === null ? rowTime : Math.max(paidTime, rowTime);
        }
    });
    return paidTime;
}

function computeFineState(targetWeekKey, weeksMap, startWeekKey) {
    let cursor = parseWeekKeyDate(startWeekKey);
    const target = parseWeekKeyDate(targetWeekKey);
    if (!cursor || !target) return { unpaidFinePoints: 0, settledThroughTarget: false };

    if (hasPaymentAtOrAfter(targetWeekKey, weeksMap)) {
        return { unpaidFinePoints: 0, settledThroughTarget: true };
    }

    const paidThroughTime = lastPaymentTimeOnOrBefore(targetWeekKey, weeksMap);

    let points = 0;
    let safety = 0;
    while (cursor <= target && safety < 400) {
        safety++;
        const wk = `week_${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
        const currentTime = cursor.getTime();
        const row = weeksMap ? weeksMap[wk] : null;
        const raw = computeWeekRaw(row, wk);
        if ((paidThroughTime === null || currentTime > paidThroughTime) && raw < 0) {
            points += Math.abs(raw);
        }
        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + 7);
    }
    return { unpaidFinePoints: points, settledThroughTarget: points === 0 };
}

function updateBonusLabel() {
    const el = document.getElementById('bonus-hours-label');
    if (el) el.innerText = bonusHours + "시간+";
}

function updateMinimumLabel() {
    const el = document.getElementById('minimum-hours-label');
    if (el) el.innerText = minimumHours + "시간+";
}

function updateFineUnitLabel() {
    const el = document.getElementById('fine-unit-label');
    if (el) el.innerText = `${fineUnit.toLocaleString()}원`;
}

function formatBonusShortLabel() {
    return `${Number.isInteger(bonusHours) ? bonusHours : bonusHours.toFixed(1)}h +`;
}

async function saveGlobalSettings() {
    if (!supabaseClient) return true;
    const { error } = await supabaseClient.from('study_mate').upsert([{
        id: -1,
        name: SETTINGS_NAME,
        week_key: SETTINGS_WEEK_KEY,
        target_start_time: null,
        start_week_key: null,
        time_done_list: [],
        start_done_list: [],
        study_done_list: [],
        bonus_done_list: [],
        notes: JSON.stringify({ bonusHours, minimumHours, fineUnit }),
        day_off_used: false,
        day_off_day: 0
    }], { onConflict: 'name,week_key' });
    if (error) {
        alert("저장 실패: " + error.message);
        return false;
    }
    return true;
}

async function editBonusHours() {
    const val = await openBonusPicker(bonusHours);
    if (val === null) return; // 취소함
    bonusHours = val;
    updateBonusLabel();
    if (!(await saveGlobalSettings())) return;
    loadServerData();
}

async function editMinimumHours() {
    const val = await openBonusPicker(minimumHours, "공부 최소 기준 시간");
    if (val === null) return;
    minimumHours = val;
    updateMinimumLabel();
    if (!(await saveGlobalSettings())) return;
    loadServerData();
}

async function editFineUnit() {
    const val = await openFineUnitPicker(fineUnit);
    if (val === null) return;
    fineUnit = val;
    updateFineUnitLabel();
    if (!(await saveGlobalSettings())) return;
    loadServerData();
}

function updateDDays() {
    const now = new Date();
    const mopyungDate = new Date(2026, 8, 3);  // 9월 3일 (month는 0-indexed)
    const suneungDate = new Date(2026, 10, 19); // 11월 19일
    document.getElementById('mopyung-dday').innerText = formatDday(getDday(mopyungDate, now));
    document.getElementById('suneung-dday').innerText = formatDday(getDday(suneungDate, now));
}

function getWeekStorageKey() {
    return `week_${currentWeekDates[0].storageKey}`;
}

function changeWeek(direction) {
    weekOffset += direction;
    currentWeekDates = getWeekDates(weekOffset);
    loadServerData();
}

// 미래 주차 이동 시 마스터 리스트 자동 동기화 (한 주차당 1회만 수행 -> 속도 개선)
async function syncWithMasterList(weekKey, currentData, masters) {
    if (!supabaseClient) return currentData;
    if (!masters || masters.length === 0) return currentData;

    const targetMonday = parseWeekKeyDate(weekKey);

    const missing = masters.filter(master => {
        if (currentData.some(d => d.name === master.name)) return false;
        // 등록 시점(start_week_key) 이전 주차에는 자동으로 복사하지 않음
        const startMonday = parseWeekKeyDate(master.start_week_key);
        if (startMonday && targetMonday && targetMonday < startMonday) return false;
        return true;
    });
    if (missing.length === 0) return currentData;

    const newRows = missing.map((master, i) => {
        const fallbackTime = master.target_start_time || "08:40";
        const fallbackNotes = master.notes || Array(7).fill(fallbackTime).join("|");
        return {
            id: Date.now() + i,
            name: master.name,
            target_start_time: fallbackTime,
            week_key: weekKey,
            start_week_key: master.start_week_key,
            time_done_list: emptyWeekValues(),
            start_done_list: emptyWeekValues(),
            study_done_list: emptyWeekValues(),
            bonus_done_list: emptyWeekValues(),
            notes: fallbackNotes,
            day_off_used: false,
            day_off_day: 0
        };
    });

    const { error: insErr } = await supabaseClient
        .from('study_mate')
        .upsert(newRows, { onConflict: 'name,week_key', ignoreDuplicates: true });
    if (insErr) {
        console.error("마스터 동기화 삽입 실패:", insErr.message);
        return currentData;
    }

    let { data: reFetched, error: reErr } = await supabaseClient
        .from('study_mate')
        .select('*')
        .eq('week_key', weekKey)
        .order('id', { ascending: true });
    if (reErr) { console.error(reErr.message); return currentData; }
    return (reFetched || currentData).filter(r => r.name !== SETTINGS_NAME);
}

function setSyncStatus(ok, message) {
    const el = document.getElementById('sync-status');
    if (ok) {
        el.className = "hidden";
        el.innerHTML = "";
    } else {
        el.className = "text-xs bg-amber-100 text-amber-800 font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-xs";
        el.innerHTML = `<span class="w-1.5 h-1.5 bg-amber-500 rounded-full"></span> ${message || '서버 연결 오류'}`;
    }
}

async function loadServerData() {
    if (dragState.dragging) return; // 드래그 중에는 화면을 새로 그리지 않음 (다음 폴링 때 재시도)
    const weekKey = getWeekStorageKey();
    document.getElementById('week-title').innerText = `${currentWeekDates[0].label.split('(')[0]} ~ ${currentWeekDates[6].label.split('(')[0]} 현황`;

    if (!supabaseClient) {
        fallbackToLocal();
        return;
    }

    try {
        // 전체 테이블을 한 번에 가져와서 (친구 목록/마스터/설정/과거 주차) 모두 구성
        let { data: allRows, error } = await supabaseClient.from('study_mate').select('*').order('id', { ascending: true });
        if (error) throw error;
        allRows = allRows || [];

        // 전역 설정(보너스 시간) 반영
        const settingsRow = allRows.find(r => r.name === SETTINGS_NAME && r.week_key === SETTINGS_WEEK_KEY);
        if (settingsRow && settingsRow.notes) {
            try {
                const parsed = JSON.parse(settingsRow.notes);
                if (parsed && parsed.bonusHours) bonusHours = Number(parsed.bonusHours);
                if (parsed && parsed.minimumHours) minimumHours = Number(parsed.minimumHours);
                if (parsed && parsed.fineUnit) fineUnit = Number(parsed.fineUnit);
            } catch(e) {}
        }
        updateBonusLabel();
        updateMinimumLabel();
        updateFineUnitLabel();

                const masterRows = allRows.filter(r => r.week_key === MASTER_WEEK_KEY);
        masterByName = {};
        masterRows.forEach(m => { masterByName[m.name] = m; });

                const dataRows = allRows.filter(r => r.week_key !== MASTER_WEEK_KEY && r.name !== SETTINGS_NAME);

        rowsByNameWeek = {};
        dataRows.forEach(r => {
            if (!rowsByNameWeek[r.name]) rowsByNameWeek[r.name] = {};
            rowsByNameWeek[r.name][r.week_key] = r;
        });

        let currentWeekRows = dataRows.filter(r => r.week_key === weekKey);

        if (!syncedWeeks.has(weekKey)) {
            currentWeekRows = await syncWithMasterList(weekKey, currentWeekRows, masterRows);
            syncedWeeks.add(weekKey);
            currentWeekRows.forEach(r => {
                if (!rowsByNameWeek[r.name]) rowsByNameWeek[r.name] = {};
                rowsByNameWeek[r.name][weekKey] = r;
            });
        }

        serverData = currentWeekRows;
        setSyncStatus(true);
        renderApp();
    } catch (err) {
        console.error("데이터 로드 중 에러:", err);
        try { setSyncStatus(false); } catch(e2) { console.error(e2); }
        fallbackToLocal();
    }
}

function fallbackToLocal() {
    serverData = readLocalBackup(getWeekStorageKey());
    renderApp();
}

function saveLocalBackup() {
    writeLocalBackup(getWeekStorageKey(), serverData);
}

// ===== 기기별(로컬) 카드 순서 =====
// 서버와 동기화하지 않고 이 브라우저(기기)에만 저장 -> 다른 기기/폴링과 무관하게 내 화면 순서가 고정됨
function getLocalOrder() {
    return readFriendOrder();
}
function saveLocalOrder(orderNames) {
    writeFriendOrder(orderNames);
}
function applyLocalOrder(rows) {
    const order = getLocalOrder();
    const masterOrder = Object.values(masterByName)
        .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
        .map(row => row.name);
    const effectiveOrder = order.length > 0 ? order : masterOrder;
    if (effectiveOrder.length === 0) return rows;
    const known = rows.filter(r => effectiveOrder.includes(r.name));
    const unknown = rows.filter(r => !effectiveOrder.includes(r.name)); // 새로 등록된 친구는 뒤에 붙음
    known.sort((a, b) => effectiveOrder.indexOf(a.name) - effectiveOrder.indexOf(b.name));
    unknown.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    return [...known, ...unknown];
}
function finalizeOrderFromDOM() {
    const container = document.getElementById('friends-container');
    const order = [...container.children].map(el => el.dataset.name).filter(Boolean);
    saveLocalOrder(order);
}

// 드래그 핸들(⠿)을 누르고 움직이면 그 위치의 카드와 순서를 바꾸고,
// 손을 떼면 이 기기에 순서를 저장한다.
// (window 리스너는 렌더할 때마다 쌓이지 않도록 한 번만 등록하고, 전역 상태로 어떤 카드가
//  드래그 중인지 추적한다.)
const dragState = { cardEl: null, dragging: false, lastY: 0 };

function endDragGlobal() {
    if (dragState.dragging && dragState.cardEl) {
        dragState.cardEl.classList.remove('is-dragging');
        finalizeOrderFromDOM();
    }
    dragState.dragging = false;
    dragState.cardEl = null;
    dragState.lastY = 0;
}

function attachDragHandlers(handleEl, cardEl) {
    handleEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dragState.dragging = true;
        dragState.cardEl = cardEl;
        dragState.lastY = e.clientY;
        cardEl.classList.add('is-dragging');
        try { handleEl.setPointerCapture(e.pointerId); } catch(e2) {}
        if (navigator.vibrate) navigator.vibrate(15);
    });
    handleEl.addEventListener('pointerup', endDragGlobal);
    handleEl.addEventListener('pointercancel', endDragGlobal);
}

function animateCardReorder(container, move) {
    const cards = [...container.querySelectorAll('.friend-card')];
    const firstRects = new Map(cards.map(card => [card, card.getBoundingClientRect()]));
    move();
    cards.forEach(card => {
        const first = firstRects.get(card);
        const last = card.getBoundingClientRect();
        const deltaY = first ? first.top - last.top : 0;
        if (!deltaY) return;
        card.style.transition = 'none';
        card.style.transform = `translateY(${deltaY}px)`;
        requestAnimationFrame(() => {
            card.style.transition = 'transform 180ms ease';
            card.style.transform = '';
        });
    });
}

// 전역 리스너는 딱 한 번만 등록
window.addEventListener('pointermove', (e) => {
    if (!dragState.dragging || !dragState.cardEl) return;
    e.preventDefault();
    const container = document.getElementById('friends-container');
    const cardEl = dragState.cardEl;
    const direction = e.clientY - dragState.lastY;
    if (Math.abs(direction) < 2) return;
    const siblings = [...container.querySelectorAll('.friend-card')].filter(el => el !== cardEl);
    let reordered = false;
    for (const el of siblings) {
        const rect = el.getBoundingClientRect();
        if (e.clientY > rect.top && e.clientY < rect.bottom) {
            const els = [...container.children];
            const cardIndex = els.indexOf(cardEl);
            const targetIndex = els.indexOf(el);
            const midpoint = rect.top + rect.height / 2;
            const movingDown = direction > 0 && targetIndex > cardIndex && e.clientY > midpoint;
            const movingUp = direction < 0 && targetIndex < cardIndex && e.clientY < midpoint;
            if (!movingDown && !movingUp) break;
            animateCardReorder(container, () => {
                if (movingUp) {
                    container.insertBefore(cardEl, el);
                } else if (movingDown) {
                    container.insertBefore(cardEl, el.nextSibling);
                }
            });
            reordered = true;
            break;
        }
    }
    if (reordered || Math.abs(direction) > 8) {
        dragState.lastY = e.clientY;
    }
});
window.addEventListener('pointerup', () => { if (dragState.dragging) endDragGlobal(); });

async function editSelectedDaysTarget(friendId) {
    const friend = serverData.find(f => f.id === friendId);
    if (!friend) return;

    const currentArr = parseDayTargets(friend);
    const nextTargets = await openTargetWeekPicker(currentArr);
    if (!nextTargets) return; // 취소함

    if (!supabaseClient) {
        friend.notes = nextTargets.join("|");
        saveLocalBackup();
        loadServerData();
        return;
    }

    // 이 친구의 모든 주차(마스터 리스트 포함) 행을 가져온다
    const { data: allRows, error: fetchErr } = await supabaseClient
        .from('study_mate')
        .select('*')
        .eq('name', friend.name);
    if (fetchErr) { alert("조회 실패: " + fetchErr.message); return; }

    const currentMonday = parseDateKey(currentWeekDates[0].storageKey);

    // 마스터 리스트(앞으로 새로 생길 주차용) + 오늘 이후 이미 만들어진 모든 주차
    const targets = (allRows || []).filter(r => {
                if (r.week_key === MASTER_WEEK_KEY) return true;
        const rowMonday = parseWeekKeyDate(r.week_key);
        return rowMonday && rowMonday >= currentMonday;
    });

    let failCount = 0;
    for (const row of targets) {
        const notesStr = nextTargets.join("|");
        const { error: upErr } = await supabaseClient.from('study_mate').update({ notes: notesStr }).eq('id', row.id);
        if (upErr) { failCount++; console.warn(`업데이트 실패 (${row.week_key}):`, upErr.message); }
    }
    if (failCount > 0) {
        alert(`${targets.length - failCount}개 주차는 반영됐고, ${failCount}개 주차는 저장에 실패했어요.`);
    } else {
        console.log(`✅ ${targets.length}개 주차(마스터 리스트 포함)에 반영 완료`);
    }

    loadServerData();
}

function renderApp() {
    const container = document.getElementById('friends-container');
    container.innerHTML = '';

    if (!serverData || serverData.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 font-medium">오른쪽 상단의 '친구 등록하기'를 눌러 실시간 공유 멤버를 추가해 보세요!</div>`;
        return;
    }

    const weekKey = getWeekStorageKey();
    const today = new Date();
    today.setHours(0,0,0,0);
    const currentWeekEnd = parseDateKey(currentWeekDates[6].storageKey);
    const currentWeekEnded = currentWeekEnd < today;

    const orderedData = applyLocalOrder(serverData);
    const viewRows = orderedData.map(friend => {
        friend.start_done_list = normalizeWeekValues(friend.start_done_list);
        friend.study_done_list = normalizeWeekValues(friend.study_done_list);
        friend.bonus_done_list = normalizeWeekValues(friend.bonus_done_list);
        if(!friend.target_start_time || friend.target_start_time === "null") friend.target_start_time = "08:40";

        const dayTargets = parseDayTargets(friend);
        const dayOffDays = dayOffIndices(friend);

        const master = masterByName[friend.name];
        const startWeekKey = (master && master.start_week_key) ? master.start_week_key : friend.week_key;
        const weeksMap = rowsByNameWeek[friend.name] || {};
        weeksMap[weekKey] = friend; // 이번 주는 화면에 그려지는 최신 friend 객체를 그대로 사용
        const score = computeScoreChain(friend.name, weekKey, weeksMap, startWeekKey);
        const fineState = computeFineState(weekKey, weeksMap, startWeekKey);
        const unpaidFinePoints = fineState.unpaidFinePoints;
        const fineAmount = unpaidFinePoints * fineUnit;
        const finePaid = fineState.settledThroughTarget;
        const currentWeekPaid = isFinePaid(friend);
        const fineTone = fineAmount > 0 ? "is-negative" : score.final > 0 ? "is-positive" : "is-zero";
        const fineDisplay = fineAmount > 0 ? `-₩${fineAmount.toLocaleString()}` : `₩${fineAmount.toLocaleString()}`;
        const paymentTone = finePaid ? "is-paid" : currentWeekEnded && fineAmount > 0 ? "is-overdue" : "is-open";

        return { friend, dayTargets, dayOffDays, score, fineAmount, fineDisplay, finePaid, currentWeekPaid, fineTone, paymentTone };
    });

    container.innerHTML = "";

    viewRows.forEach(({ friend, dayTargets, dayOffDays, score, fineAmount, fineDisplay, finePaid, currentWeekPaid, fineTone, paymentTone }) => {

        let cardHtml = `
            <section class="friend-card ledger-row bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden relative">
                <div class="ledger-row-head">
                    <div class="ledger-person">
                        <span class="drag-handle text-slate-300 hover:text-slate-500 cursor-grab select-none text-base leading-none touch-none" title="꾹 눌러서 순서 변경">⠿</span>
                        <div>
                            <h3 class="text-lg font-bold text-slate-900">${friend.name}</h3>
                        </div>
                    </div>
                    <div class="ledger-actions">
                        <button onclick="editSelectedDaysTarget(${friend.id})" class="card-action-link text-indigo-600 font-bold underline cursor-pointer bg-indigo-50 px-2 py-0.5 rounded-md hover:bg-indigo-100 transition">목표 변경</button>
                        <button onclick="setDayOff(${friend.id})" class="dayoff-button ${dayOffDays.length > 0 ? 'is-active' : ''} text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${dayOffDays.length > 0 ? 'bg-amber-100 border-amber-200 text-amber-800' : 'bg-white border-slate-200 text-slate-600'}">
                            Day Off
                        </button>
                    </div>
                </div>

                <div class="ledger-row-body">
                    <div class="card-grid space-y-3">
                        <div class="card-grid-header grid grid-cols-8 text-center text-[10px] font-bold text-slate-400 pb-1 border-b border-slate-100">
                            <div class="row-label">구분</div>${currentWeekDates.map(d => `<div>${d.label}</div>`).join('')}
                        </div>

                        <div class="target-row grid grid-cols-8 text-center text-[9px] font-bold text-indigo-600 bg-indigo-50/70 py-0.5 rounded-md">
                            <div class="row-label">목표시간</div>
                            ${dayTargets.map(t => `<div>${t}</div>`).join('')}
                        </div>

                        <div class="grid grid-cols-8 items-center text-center">
                            <div class="row-label text-[11px] font-bold text-slate-500">공부시간</div>
                            ${friend.study_done_list.map((v, idx) => {
                                const isOff = isDayOff(friend, idx);
                                return `<div class="flex justify-center">
                                    <button onclick="toggleStudyDone(${friend.id}, ${idx}, ${v})" class="mark-button ${isOff ? 'is-off' : v === true ? 'is-on' : v === false ? 'is-fail' : 'is-empty'} w-6 h-6 rounded-md flex items-center justify-center border text-sm cursor-pointer transition ${isOff ? 'bg-amber-100 border-amber-100 text-amber-600' : v === true ? 'bg-indigo-50 border-indigo-300 text-indigo-500' : 'bg-white border-slate-200 text-slate-300'}">
                                        ${isOff ? 'OFF' : (v === true ? '○' : v === false ? 'X' : '')}
                                    </button>
                                </div>`;
                            }).join('')}
                        </div>
                        <div class="grid grid-cols-8 items-center text-center">
                            <div class="row-label text-[11px] font-bold text-slate-500">${formatBonusShortLabel()}</div>
                            ${friend.bonus_done_list.map((v, idx) => {
                                const isOff = isDayOff(friend, idx);
                                return `<div class="flex justify-center">
                                    <button onclick="toggleBonus(${friend.id}, ${idx}, ${v})" class="mark-button ${isOff ? 'is-off' : v === true ? 'is-on' : v === false ? 'is-fail' : 'is-empty'} w-6 h-6 rounded-md flex items-center justify-center border text-sm cursor-pointer transition ${isOff ? 'bg-amber-100 border-amber-100 text-amber-600' : v === true ? 'bg-lime-50 border-lime-300 text-lime-500' : 'bg-white border-slate-200 text-slate-300'}">
                                        ${isOff ? 'OFF' : (v === true ? '○' : v === false ? 'X' : '')}
                                    </button>
                                </div>`;
                            }).join('')}
                        </div>
                        <div class="grid grid-cols-8 items-center text-center">
                            <div class="row-label text-[11px] font-bold text-slate-500">시작시간</div>
                            ${friend.start_done_list.map((v, idx) => `
                                <div class="flex justify-center">
                                    <button onclick="toggleCheck(${friend.id}, ${idx}, 'start_done_list', ${v})" class="mark-button ${isDayOff(friend, idx) ? 'is-off' : v === true ? 'is-on' : v === false ? 'is-fail' : 'is-empty'} w-6 h-6 rounded-md flex items-center justify-center border text-xs cursor-pointer ${isDayOff(friend, idx) ? 'bg-amber-100 border-amber-100 text-amber-600' : v === true ? 'bg-emerald-50 border-emerald-200 text-emerald-600 font-bold' : 'bg-white border-slate-200'}">
                                        ${isDayOff(friend, idx) ? 'OFF' : v === true ? 'O' : v === false ? 'X' : ''}
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                        <div class="score-row grid grid-cols-8 items-center text-center pt-1 border-t border-dashed border-slate-100">
                            <div class="row-label text-[11px] font-bold text-slate-500">일일점수</div>
                            ${(() => {
                                const dates = currentWeekDates.map((_, idx) => {
                                    const [y,m,d] = currentWeekDates[idx].storageKey.split('-').map(Number);
                                    return new Date(y, m-1, d);
                                });
                                return friend.study_done_list.map((studyDone, idx) => {
                                    const isOff = isDayOff(friend, idx);
                                    const isFuture = dates[idx] > today;
                                    const bonusDone = friend.bonus_done_list[idx];
                                    const disp = dayDeltaDisplay(studyDone, friend.start_done_list[idx], bonusDone, isOff, isFuture);
                                    return `<div class="text-[11px] ${disp.cls}">${disp.text}</div>`;
                                }).join('');
                            })()}
                        </div>
                    </div>
                </div>
                <div class="ledger-row-foot">
                    <div class="fine-summary bg-rose-50 px-6 py-3.5 border-t border-rose-100 flex justify-between items-center ${fineTone} ${finePaid ? 'is-paid' : ''}">
                        <button onclick="toggleFinePaid(${friend.id})" class="fine-paid-button ${paymentTone} ${currentWeekPaid ? 'is-current-paid' : ''} cursor-pointer" aria-pressed="${currentWeekPaid}">
                            입금
                        </button>
                        <span class="fine-amount text-sm font-extrabold text-rose-700">${fineDisplay}</span>
                    </div>
                </div>
            </section>`;
        container.innerHTML += cardHtml;
    });

    // 렌더링 완료 후 각 카드에 이름 태그 + 드래그 핸들러 부착 (순서 저장을 위함)
    [...container.querySelectorAll('.friend-card')].forEach((cardEl, idx) => {
        const row = viewRows[idx];
        const friend = row && row.friend;
        if (!friend) return;
        cardEl.dataset.name = friend.name;
        const handle = cardEl.querySelector('.drag-handle');
        if (handle) attachDragHandlers(handle, cardEl);
    });
}

async function addNewFriend() {
    const name = prompt("새로운 친구 이름을 입력하세요:");
    if(!name || name.trim() === "") return;

    const picked = await openTimePicker("08:40", "목표 시작 시간 설정");
    const time = picked || "08:40";
    const defaultNotes = Array(7).fill(time).join("|");
    const startWeekKey = getWeekStorageKey();

    if (supabaseClient) {
        // 1. 미래 자동 복사용 마스터 명단에 추가 (등록 주차를 함께 기록)
        const { error: e1 } = await supabaseClient.from('study_mate').upsert([{
            id: Date.now(),
            name: name.trim(),
            target_start_time: time,
                    week_key: MASTER_WEEK_KEY,
            start_week_key: startWeekKey,
            time_done_list: emptyWeekValues(),
            start_done_list: emptyWeekValues(),
            study_done_list: emptyWeekValues(),
            bonus_done_list: emptyWeekValues(),
            notes: defaultNotes,
            day_off_used: false, day_off_day: 0
        }], { onConflict: 'name,week_key', ignoreDuplicates: true });
        if (e1) { alert("등록 실패 (마스터 리스트): " + e1.message); return; }

        // 2. 현재 주차에도 실시간 동시 추가 (자가 치유 로직을 위해 등록 시점도 함께 기록)
        const { error: e2 } = await supabaseClient.from('study_mate').upsert([{
            id: Date.now() + 1,
            name: name.trim(),
            target_start_time: time,
            week_key: getWeekStorageKey(),
            start_week_key: startWeekKey,
            time_done_list: emptyWeekValues(),
            start_done_list: emptyWeekValues(),
            study_done_list: emptyWeekValues(),
            bonus_done_list: emptyWeekValues(),
            notes: defaultNotes,
            day_off_used: false, day_off_day: 0
        }], { onConflict: 'name,week_key', ignoreDuplicates: true });
        if (e2) { alert("등록 실패 (이번 주): " + e2.message); return; }
    } else {
        serverData.push({
            id: Date.now(), name: name.trim(), target_start_time: time, week_key: getWeekStorageKey(),
            start_week_key: startWeekKey,
            time_done_list: emptyWeekValues(),
            start_done_list: emptyWeekValues(),
            study_done_list: emptyWeekValues(),
            bonus_done_list: emptyWeekValues(),
            notes: defaultNotes,
            day_off_used: false, day_off_day: 0
        });
        saveLocalBackup();
    }
    loadServerData();
}

async function toggleStudyDone(id, idx, currentVal) {
    const friend = serverData.find(f => f.id === id);
    if (!friend) return;
    if (isDayOff(friend, idx)) return;
    let newList = normalizeWeekValues(friend.study_done_list);
    newList[idx] = nextCheckValue(currentVal);

    if (supabaseClient) {
        const { error } = await supabaseClient.from('study_mate').update({ study_done_list: newList }).eq('id', id);
        if (error) { alert("저장 실패: " + error.message); return; }
    } else {
        friend.study_done_list = newList;
        saveLocalBackup();
    }
    loadServerData();
}

async function toggleBonus(id, idx, currentVal) {
    const friend = serverData.find(f => f.id === id);
    if (!friend) return;
    if (isDayOff(friend, idx)) return;
    let newList = normalizeWeekValues(friend.bonus_done_list);
    newList[idx] = nextCheckValue(currentVal);

    if (supabaseClient) {
        const { error } = await supabaseClient.from('study_mate').update({ bonus_done_list: newList }).eq('id', id);
        if (error) { alert("저장 실패: " + error.message); return; }
    } else {
        friend.bonus_done_list = newList;
        saveLocalBackup();
    }
    loadServerData();
}

async function toggleCheck(id, index, listName, currentVal) {
    const friend = serverData.find(f => f.id === id);
    if(friend) {
        if(isDayOff(friend, index)) return;
        let newList = normalizeWeekValues(friend[listName]);
        newList[index] = nextCheckValue(currentVal);

        if (supabaseClient) {
            const { error } = await supabaseClient.from('study_mate').update({ [listName]: newList }).eq('id', id);
            if (error) { alert("저장 실패: " + error.message); return; }
        } else {
            friend[listName] = newList;
            saveLocalBackup();
        }
        loadServerData();
    }
}

async function toggleFinePaid(id) {
    const friend = serverData.find(f => f.id === id);
    if (!friend) return;
    const nextPaid = !isFinePaid(friend);
    const nextNotes = writeRowMeta(friend, { finePaid: nextPaid });

    if (supabaseClient) {
        const { error } = await supabaseClient.from('study_mate').update({ Notes: nextNotes }).eq('id', id);
        if (error) { alert("저장 실패: " + error.message); return; }
    } else {
        friend.Notes = nextNotes;
        saveLocalBackup();
    }
    loadServerData();
}

async function setDayOff(id) {
    const friend = serverData.find(f => f.id === id);
    if(!friend) return;

    const result = await openDayOffPicker(dayOffIndices(friend));
    if (result === null) return; // 취소함

    const dayOffList = emptyWeekValues();
    result.forEach(dayIndex => { dayOffList[dayIndex] = true; });
    const used = result.length > 0;
    const dayIndex = used ? result[0] : 0;

    if (supabaseClient) {
        const { error } = await supabaseClient.from('study_mate').update({ day_off_used: used, day_off_day: dayIndex, time_done_list: dayOffList }).eq('id', id);
        if (error) { alert("저장 실패: " + error.message); return; }
    } else {
        friend.day_off_used = used; friend.day_off_day = dayIndex; friend.time_done_list = dayOffList; saveLocalBackup();
    }
    loadServerData();
}

async function deleteFriend(id, name) {
    if(confirm(`정말로 '${name}' 님을 명단에서 삭제하시겠습니까?\n(이전/이후 모든 주차 기록이 함께 삭제됩니다.)`)) {
        if (supabaseClient) {
            // 이름 기준으로 모든 주차(마스터 포함) 기록을 한 번에 삭제
            const { error } = await supabaseClient.from('study_mate').delete().eq('name', name);
            if (error) { alert("삭제 실패: " + error.message); return; }
        } else {
            serverData = serverData.filter(f => f.id !== id);
            saveLocalBackup();
        }
        loadServerData();
    }
}

async function bootApp() {
    // 1) 네트워크/CDN과 무관하게 즉시 표시되어야 하는 것들
    updateDDays();
    updateBonusLabel();
    updateMinimumLabel();
    updateFineUnitLabel();
    currentWeekDates = getWeekDates(weekOffset);
    document.getElementById('week-title').innerText =
        `${currentWeekDates[0].label.split('(')[0]} ~ ${currentWeekDates[6].label.split('(')[0]} 현황`;

    // 2) Supabase 라이브러리 확보 시도 (jsdelivr → unpkg 순서, 최대 8초)
    const ready = await ensureSupabaseLib();
    if (ready) {
        supabaseClient = createSupabaseClient();
    } else {
        console.warn("Supabase 라이브러리를 불러오지 못했습니다. 로컬 모드로 전환합니다.");
        setSyncStatus(false, "로컬 모드 (서버 연결 안됨)");
    }

    loadServerData();
    setInterval(loadServerData, 5000);
}

Object.assign(window, {
    addNewFriend,
    changeWeek,
    closeBonusPicker,
    closeDayOffPicker,
    closeFineUnitPicker,
    closeTargetWeekPicker,
    closeTimePicker,
    deleteFriend,
    editBonusHours,
    editFineUnit,
    editMinimumHours,
    editSelectedDaysTarget,
    setDayOff,
    toggleBonus,
    toggleCheck,
    toggleFinePaid,
    toggleStudyDone
});

bootApp();
