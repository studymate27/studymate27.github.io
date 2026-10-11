-- STUDY MATE 그룹 서비스 스키마
-- 설계: new/docs/PLAN.md §4, 권한: §2.4 / §4.1
--
-- 오류는 클라이언트가 구분할 수 있도록 영문 키를 메시지로 던진다.
--   not_authenticated, not_member, not_admin, invalid_invite_code,
--   last_admin, dday_limit, invalid_nickname, invalid_target

-- ───────────────────────────── 테이블 ─────────────────────────────

create table public.profiles (
    id           uuid primary key references auth.users (id) on delete cascade,
    email        text not null,
    display_name text,
    created_at   timestamptz not null default now()
);

create table public.groups (
    id                 uuid primary key default gen_random_uuid(),
    name               text not null check (char_length(btrim(name)) between 1 and 40),
    invite_code        text not null unique,
    edit_mode          text not null default 'self' check (edit_mode in ('self', 'admin_only')),
    min_study_hours    numeric(3, 1) not null default 3 check (min_study_hours between 0 and 24),
    bonus_enabled      boolean not null default true,
    bonus_hours        numeric(3, 1) not null default 7 check (bonus_hours between 0 and 24),
    fine_unit          integer not null default 500 check (fine_unit between 0 and 1000000),
    default_start_time time not null default '08:40',
    created_by         uuid references public.profiles (id) on delete set null,
    created_at         timestamptz not null default now()
);

create table public.group_members (
    group_id   uuid not null references public.groups (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    role       text not null default 'member' check (role in ('admin', 'member')),
    nickname   text not null check (char_length(btrim(nickname)) between 1 and 20),
    sort_order integer not null default 0,
    -- 점수 계산 시작 주(월요일). legacy의 start_week_key 역할
    start_week date not null default (date_trunc('week', now() at time zone 'Asia/Seoul'))::date,
    joined_at  timestamptz not null default now(),
    primary key (group_id, user_id)
);

create table public.group_ddays (
    id          uuid primary key default gen_random_uuid(),
    group_id    uuid not null references public.groups (id) on delete cascade,
    label       text not null check (char_length(btrim(label)) between 1 and 20),
    target_date date not null,
    sort_order  integer not null default 0
);

-- 요일별 목표 시작 시간 (weekday: 0=월 … 6=일). 없으면 groups.default_start_time
create table public.member_day_targets (
    group_id   uuid not null references public.groups (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    weekday    smallint not null check (weekday between 0 and 6),
    start_time time not null,
    primary key (group_id, user_id, weekday)
);

-- 일 단위 기록. 멤버가 나가도 기록은 그룹에 남는다.
create table public.daily_records (
    group_id   uuid not null references public.groups (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    date       date not null,
    study_done boolean,
    start_done boolean,
    bonus_done boolean,
    is_day_off boolean not null default false,
    updated_by uuid references public.profiles (id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (group_id, user_id, date)
);

-- 벌금 납부: settled_through_week(월요일) 주까지 정산 완료
create table public.fine_payments (
    id                   uuid primary key default gen_random_uuid(),
    group_id             uuid not null references public.groups (id) on delete cascade,
    user_id              uuid not null references public.profiles (id) on delete cascade,
    settled_through_week date not null check (extract(isodow from settled_through_week) = 1),
    amount               integer not null default 0,
    recorded_by          uuid references public.profiles (id) on delete set null,
    created_at           timestamptz not null default now(),
    unique (group_id, user_id, settled_through_week)
);

create index group_members_user_idx on public.group_members (user_id);
create index group_ddays_group_idx on public.group_ddays (group_id);
create index daily_records_group_date_idx on public.daily_records (group_id, date);
create index fine_payments_group_idx on public.fine_payments (group_id, user_id);

-- ──────────────────────── 권한 판단 헬퍼 ────────────────────────
-- security definer: RLS 정책 안에서 group_members를 다시 조회할 때 생기는 재귀를 피한다.

create function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.group_members
        where group_id = gid and user_id = auth.uid()
    );
$$;

create function public.is_admin(gid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.group_members
        where group_id = gid and user_id = auth.uid() and role = 'admin'
    );
$$;

-- 방장: 모든 멤버 기록 수정 / 멤버: 자율 모드일 때 본인 기록만
create function public.can_edit_member(gid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
    select public.is_admin(gid)
        or (
            uid = auth.uid()
            and public.is_member(gid)
            and exists (select 1 from public.groups where id = gid and edit_mode = 'self')
            and exists (select 1 from public.group_members where group_id = gid and user_id = uid)
        );
$$;

-- ─────────────────────────── 트리거 ───────────────────────────

-- 가입 시 프로필 자동 생성
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    insert into public.profiles (id, email, display_name)
    values (
        new.id,
        coalesce(new.email, ''),
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 그룹에 멤버가 남아 있는 한 방장은 최소 1명
create function public.ensure_admin_remains() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if old.role <> 'admin' then
        return null;
    end if;
    -- 그룹 자체가 삭제되는 중(cascade)이면 검사하지 않음
    if not exists (select 1 from public.groups where id = old.group_id) then
        return null;
    end if;
    if not exists (select 1 from public.group_members where group_id = old.group_id and role = 'admin')
       and exists (select 1 from public.group_members where group_id = old.group_id) then
        raise exception 'last_admin';
    end if;
    return null;
end;
$$;

create trigger group_members_admin_guard
    after update of role or delete on public.group_members
    for each row execute function public.ensure_admin_remains();

-- 디데이는 그룹당 최대 3개
create function public.ensure_dday_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if (select count(*) from public.group_ddays where group_id = new.group_id) >= 3 then
        raise exception 'dday_limit';
    end if;
    return new;
end;
$$;

create trigger group_ddays_limit
    before insert on public.group_ddays
    for each row execute function public.ensure_dday_limit();

-- 기록 수정자·시각 자동 기록
create function public.stamp_record() returns trigger
language plpgsql set search_path = ''
as $$
begin
    new.updated_by := auth.uid();
    new.updated_at := now();
    return new;
end;
$$;

create trigger daily_records_stamp
    before insert or update on public.daily_records
    for each row execute function public.stamp_record();

create function public.stamp_payment() returns trigger
language plpgsql set search_path = ''
as $$
begin
    new.recorded_by := auth.uid();
    return new;
end;
$$;

create trigger fine_payments_stamp
    before insert on public.fine_payments
    for each row execute function public.stamp_payment();

-- ───────────────────────────── RLS ─────────────────────────────

alter table public.profiles           enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.group_ddays        enable row level security;
alter table public.member_day_targets enable row level security;
alter table public.daily_records      enable row level security;
alter table public.fine_payments      enable row level security;

-- profiles: 이메일이 들어 있으므로 본인만. 그룹 안에서는 group_members.nickname을 쓴다.
create policy "profiles: 본인 조회" on public.profiles
    for select to authenticated using (id = auth.uid());
create policy "profiles: 본인 수정" on public.profiles
    for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- groups: 멤버 조회, 방장 수정·삭제. 생성은 create_group RPC로만.
create policy "groups: 멤버 조회" on public.groups
    for select to authenticated using (public.is_member(id));
create policy "groups: 방장 수정" on public.groups
    for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));
create policy "groups: 방장 삭제" on public.groups
    for delete to authenticated using (public.is_admin(id));

-- group_members: 멤버 조회, 본인 닉네임만 직접 수정. 가입·탈퇴·역할·순서는 RPC로만.
create policy "group_members: 멤버 조회" on public.group_members
    for select to authenticated using (public.is_member(group_id));
create policy "group_members: 본인 수정" on public.group_members
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- group_ddays: 멤버 조회, 방장 관리
create policy "group_ddays: 멤버 조회" on public.group_ddays
    for select to authenticated using (public.is_member(group_id));
create policy "group_ddays: 방장 추가" on public.group_ddays
    for insert to authenticated with check (public.is_admin(group_id));
create policy "group_ddays: 방장 수정" on public.group_ddays
    for update to authenticated using (public.is_admin(group_id)) with check (public.is_admin(group_id));
create policy "group_ddays: 방장 삭제" on public.group_ddays
    for delete to authenticated using (public.is_admin(group_id));

-- member_day_targets / daily_records: 멤버 조회, 수정은 권한 모드에 따름
create policy "member_day_targets: 멤버 조회" on public.member_day_targets
    for select to authenticated using (public.is_member(group_id));
create policy "member_day_targets: 추가" on public.member_day_targets
    for insert to authenticated with check (public.can_edit_member(group_id, user_id));
create policy "member_day_targets: 수정" on public.member_day_targets
    for update to authenticated
    using (public.can_edit_member(group_id, user_id)) with check (public.can_edit_member(group_id, user_id));
create policy "member_day_targets: 삭제" on public.member_day_targets
    for delete to authenticated using (public.can_edit_member(group_id, user_id));

create policy "daily_records: 멤버 조회" on public.daily_records
    for select to authenticated using (public.is_member(group_id));
create policy "daily_records: 추가" on public.daily_records
    for insert to authenticated with check (public.can_edit_member(group_id, user_id));
create policy "daily_records: 수정" on public.daily_records
    for update to authenticated
    using (public.can_edit_member(group_id, user_id)) with check (public.can_edit_member(group_id, user_id));
create policy "daily_records: 삭제" on public.daily_records
    for delete to authenticated using (public.can_edit_member(group_id, user_id));

-- fine_payments: 멤버 조회, 방장만 납부 처리·취소
create policy "fine_payments: 멤버 조회" on public.fine_payments
    for select to authenticated using (public.is_member(group_id));
create policy "fine_payments: 방장 추가" on public.fine_payments
    for insert to authenticated with check (public.is_admin(group_id));
create policy "fine_payments: 방장 삭제" on public.fine_payments
    for delete to authenticated using (public.is_admin(group_id));

-- ──────────────────────────── 테이블 권한 ────────────────────────────
-- 프로젝트 생성 시 "새 테이블 자동 공개"를 껐으므로 필요한 권한만 직접 준다. anon에는 아무것도 주지 않는다.

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles, public.groups, public.group_members, public.group_ddays,
                public.member_day_targets, public.daily_records, public.fine_payments
    to authenticated;

grant update (display_name) on public.profiles to authenticated;
grant update (name, edit_mode, min_study_hours, bonus_enabled, bonus_hours, fine_unit, default_start_time)
    on public.groups to authenticated;
grant delete on public.groups to authenticated;
grant update (nickname) on public.group_members to authenticated;
grant insert, update, delete on public.group_ddays to authenticated;
grant insert, update, delete on public.member_day_targets to authenticated;
-- upsert(insert … on conflict do update)가 모든 컬럼을 갱신하므로 컬럼 제한 없이 준다.
-- updated_by·updated_at·recorded_by는 트리거가 덮어쓴다.
grant insert, update, delete on public.daily_records to authenticated;
grant insert, delete on public.fine_payments to authenticated;

-- ───────────────────────────── RPC ─────────────────────────────

create function public.generate_invite_code() returns text
language plpgsql set search_path = ''
as $$
declare
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 헷갈리는 0/O/1/I 제외
    code text;
begin
    loop
        code := '';
        for i in 1..8 loop
            code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        end loop;
        exit when not exists (select 1 from public.groups where invite_code = code);
    end loop;
    return code;
end;
$$;

create function public.require_uid() returns uuid
language plpgsql stable set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'not_authenticated';
    end if;
    return auth.uid();
end;
$$;

create function public.require_admin(gid uuid) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform public.require_uid();
    if not public.is_admin(gid) then
        raise exception 'not_admin';
    end if;
end;
$$;

create function public.clean_nickname(p_nickname text) returns text
language plpgsql immutable set search_path = ''
as $$
begin
    if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 20 then
        raise exception 'invalid_nickname';
    end if;
    return btrim(p_nickname);
end;
$$;

-- 그룹 만들기: 만든 사람이 방장
create function public.create_group(p_name text, p_nickname text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
    uid uuid := public.require_uid();
    gid uuid;
begin
    insert into public.groups (name, invite_code, created_by)
    values (btrim(p_name), public.generate_invite_code(), uid)
    returning id into gid;

    insert into public.group_members (group_id, user_id, role, nickname, sort_order)
    values (gid, uid, 'admin', public.clean_nickname(p_nickname), 0);

    return gid;
end;
$$;

-- 초대 코드로 가입. 이미 멤버면 그대로 그룹 id를 돌려준다.
create function public.join_group(p_code text, p_nickname text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
    uid uuid := public.require_uid();
    gid uuid;
begin
    select id into gid from public.groups where invite_code = upper(btrim(p_code));
    if gid is null then
        raise exception 'invalid_invite_code';
    end if;

    if exists (select 1 from public.group_members where group_id = gid and user_id = uid) then
        return gid;
    end if;

    insert into public.group_members (group_id, user_id, role, nickname, sort_order)
    values (
        gid, uid, 'member', public.clean_nickname(p_nickname),
        coalesce((select max(sort_order) + 1 from public.group_members where group_id = gid), 0)
    );
    return gid;
end;
$$;

-- 초대 링크 미리보기: 가입 전에 그룹 이름 확인용 (코드를 아는 사람만)
create function public.preview_invite(p_code text) returns table (group_id uuid, group_name text, member_count bigint)
language sql stable security definer set search_path = ''
as $$
    select g.id, g.name, (select count(*) from public.group_members m where m.group_id = g.id)
    from public.groups g
    where g.invite_code = upper(btrim(p_code)) and auth.uid() is not null;
$$;

create function public.regenerate_invite_code(gid uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
    code text;
begin
    perform public.require_admin(gid);
    code := public.generate_invite_code();
    update public.groups set invite_code = code where id = gid;
    return code;
end;
$$;

create function public.set_member_role(gid uuid, target uuid, new_role text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
    perform public.require_admin(gid);
    if new_role not in ('admin', 'member') then
        raise exception 'invalid_target';
    end if;
    update public.group_members set role = new_role where group_id = gid and user_id = target;
    if not found then
        raise exception 'invalid_target';
    end if;
end;
$$;

-- 방장 양도: 대상이 방장이 되고 나는 멤버가 된다
create function public.transfer_admin(gid uuid, target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
    uid uuid := public.require_uid();
begin
    perform public.require_admin(gid);
    if target = uid then
        raise exception 'invalid_target';
    end if;
    update public.group_members set role = 'admin' where group_id = gid and user_id = target;
    if not found then
        raise exception 'invalid_target';
    end if;
    update public.group_members set role = 'member' where group_id = gid and user_id = uid;
end;
$$;

-- 그룹 나가기. 마지막 멤버가 나가면 그룹도 삭제한다.
create function public.leave_group(gid uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
    uid uuid := public.require_uid();
begin
    if not public.is_member(gid) then
        raise exception 'not_member';
    end if;
    if not exists (select 1 from public.group_members where group_id = gid and user_id <> uid) then
        delete from public.groups where id = gid;
        return;
    end if;
    delete from public.group_members where group_id = gid and user_id = uid;
end;
$$;

create function public.remove_member(gid uuid, target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
    perform public.require_admin(gid);
    if target = auth.uid() then
        raise exception 'invalid_target';
    end if;
    delete from public.group_members where group_id = gid and user_id = target;
    if not found then
        raise exception 'invalid_target';
    end if;
end;
$$;

-- 카드 순서: 배열 순서대로 sort_order를 매긴다
create function public.reorder_members(gid uuid, user_ids uuid[]) returns void
language plpgsql security definer set search_path = ''
as $$
begin
    perform public.require_admin(gid);
    update public.group_members m
    set sort_order = o.ord - 1
    from unnest(user_ids) with ordinality as o (user_id, ord)
    where m.group_id = gid and m.user_id = o.user_id;
end;
$$;

-- 함수 실행 권한: 기본 실행 권한을 모두 걷고 로그인 사용자에게 RPC·헬퍼만 연다
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
    public.is_member(uuid),
    public.is_admin(uuid),
    public.can_edit_member(uuid, uuid),
    public.create_group(text, text),
    public.join_group(text, text),
    public.preview_invite(text),
    public.regenerate_invite_code(uuid),
    public.set_member_role(uuid, uuid, text),
    public.transfer_admin(uuid, uuid),
    public.leave_group(uuid),
    public.remove_member(uuid, uuid),
    public.reorder_members(uuid, uuid[])
to authenticated;
