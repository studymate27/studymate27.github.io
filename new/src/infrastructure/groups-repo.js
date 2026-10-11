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
            .select("*, group_ddays(id, label, target_date, sort_order)")
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

// ── 관리 ──

export const updateGroup = (groupId, fields) =>
    call(supabase.from("groups").update(fields).eq("id", groupId).select("id").single());

export const addDday = (groupId, label, targetDate) =>
    call(supabase.from("group_ddays").insert({ group_id: groupId, label, target_date: targetDate }));

export const deleteDday = ddayId => call(supabase.from("group_ddays").delete().eq("id", ddayId));

export const updateNickname = (groupId, userId, nickname) =>
    call(supabase.from("group_members").update({ nickname }).match({ group_id: groupId, user_id: userId }).select("user_id").single());

export const setMemberRole = (groupId, userId, role) =>
    call(supabase.rpc("set_member_role", { gid: groupId, target: userId, new_role: role }));

export const transferAdmin = (groupId, userId) => call(supabase.rpc("transfer_admin", { gid: groupId, target: userId }));

export const removeMember = (groupId, userId) => call(supabase.rpc("remove_member", { gid: groupId, target: userId }));

export const leaveGroup = groupId => call(supabase.rpc("leave_group", { gid: groupId }));

export const regenerateInviteCode = groupId => call(supabase.rpc("regenerate_invite_code", { gid: groupId }));

export const reorderMembers = (groupId, userIds) => call(supabase.rpc("reorder_members", { gid: groupId, user_ids: userIds }));
