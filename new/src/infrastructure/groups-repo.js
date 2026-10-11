import { supabase } from "./supabase-client.js";

async function call(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
}

/** 내가 속한 그룹 목록 (이름, 내 역할, 멤버 수) */
export async function listMyGroups(userId) {
    const rows = await call(
        supabase.from("group_members")
            .select("role, nickname, joined_at, groups(id, name, group_members(count))")
            .eq("user_id", userId)
            .order("joined_at", { ascending: true }),
    );
    return rows
        .filter(row => row.groups)
        .map(row => ({
            id: row.groups.id,
            name: row.groups.name,
            role: row.role,
            nickname: row.nickname,
            memberCount: row.groups.group_members?.[0]?.count ?? 1,
        }));
}

export const createGroup = (name, nickname) =>
    call(supabase.rpc("create_group", { p_name: name, p_nickname: nickname }));

export const joinGroup = (code, nickname) =>
    call(supabase.rpc("join_group", { p_code: code, p_nickname: nickname }));

export async function previewInvite(code) {
    const rows = await call(supabase.rpc("preview_invite", { p_code: code }));
    return rows[0] ?? null;
}

/** 멤버가 아니면 null (RLS로 걸러짐) */
export async function getGroup(groupId) {
    return call(
        supabase.from("groups")
            .select("*, group_ddays(label, target_date, sort_order)")
            .eq("id", groupId)
            .maybeSingle(),
    );
}

export async function getMembers(groupId) {
    return call(
        supabase.from("group_members")
            .select("user_id, role, nickname, sort_order, start_week")
            .eq("group_id", groupId)
            .order("sort_order", { ascending: true }),
    );
}
