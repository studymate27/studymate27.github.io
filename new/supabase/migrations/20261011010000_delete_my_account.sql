-- 회원 탈퇴: 혼자 남은 그룹은 함께 지우고, 내가 유일한 방장인 그룹이 있으면 막는다(last_admin).

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = ''
as $$
declare
    uid uuid := public.require_uid();
begin
    -- 나 혼자인 그룹은 그룹째 삭제
    delete from public.groups g
    where exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = uid)
      and not exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id <> uid);

    -- 다른 멤버가 있는데 내가 유일한 방장이면 탈퇴 불가
    if exists (
        select 1 from public.group_members m
        where m.user_id = uid and m.role = 'admin'
          and not exists (
              select 1 from public.group_members o
              where o.group_id = m.group_id and o.user_id <> uid and o.role = 'admin'
          )
    ) then
        raise exception 'last_admin';
    end if;

    -- profiles·group_members·기록은 auth.users 삭제에 따라 cascade
    delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
