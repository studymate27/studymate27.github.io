import { supabase } from "./supabase-client.js";

const PAGE = 1000; // Supabase(PostgREST)는 한 번에 최대 1000행까지 돌려준다

async function call(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
}

async function fetchAllRecords(groupId, untilKey, sinceKey = null) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
        let query = supabase.from("daily_records")
            .select("user_id, date, study_done, start_done, bonus_done, is_day_off")
            .eq("group_id", groupId)
            .lte("date", untilKey);
        if (sinceKey) query = query.gte("date", sinceKey);
        const page = await call(
            query
                .order("date", { ascending: true })
                .order("user_id", { ascending: true })
                .range(from, from + PAGE - 1),
        );
        rows.push(...page);
        if (page.length < PAGE) return rows;
    }
}

/** 장부 계산에 필요한 기록·납부·시작시간 (이번 주 일요일까지) */
export async function loadLedgerData(groupId, sundayKey) {
    const [records, payments, targets] = await Promise.all([
        fetchAllRecords(groupId, sundayKey),
        call(supabase.from("fine_payments").select("user_id, settled_through_week, amount").eq("group_id", groupId)),
        call(supabase.from("member_day_targets").select("user_id, weekday, start_time").eq("group_id", groupId)),
    ]);
    return { records, payments, targets };
}

/** 월간 현황: 그 달 기록과 납부 기록 */
export async function loadMonthData(groupId, firstKey, lastKey) {
    const [records, payments] = await Promise.all([
        fetchAllRecords(groupId, lastKey, firstKey),
        call(supabase.from("fine_payments").select("user_id, settled_through_week").eq("group_id", groupId)),
    ]);
    return { records, payments };
}

export const setDayValue = (groupId, userId, dateKey, field, value) =>
    call(supabase.from("daily_records").upsert({ group_id: groupId, user_id: userId, date: dateKey, [field]: value }));

export const setDayOffs = (groupId, userId, dateKeys, offIndices) =>
    call(supabase.from("daily_records").upsert(
        dateKeys.map((date, i) => ({ group_id: groupId, user_id: userId, date, is_day_off: offIndices.includes(i) })),
    ));

export const setDayTargets = (groupId, userId, times) =>
    call(supabase.from("member_day_targets").upsert(
        times.map((start_time, weekday) => ({ group_id: groupId, user_id: userId, weekday, start_time })),
    ));

export const markPaid = (groupId, userId, mondayKey, amount) =>
    call(supabase.from("fine_payments").insert({ group_id: groupId, user_id: userId, settled_through_week: mondayKey, amount }));

export const unmarkPaid = (groupId, userId, mondayKey) =>
    call(supabase.from("fine_payments").delete().match({ group_id: groupId, user_id: userId, settled_through_week: mondayKey }));
