-- Sessioni di gioco condivise per Mappa Tattica D&D.
-- Eseguire una sola volta nel SQL Editor del progetto Supabase.

create table if not exists public.game_sessions (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (char_length(trim(name)) between 1 and 80),
    invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    state jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.game_session_members (
    session_id uuid not null references public.game_sessions(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'player' check (role in ('player')),
    joined_at timestamptz not null default now(),
    primary key (session_id, user_id)
);

create index if not exists game_sessions_owner_id_idx
    on public.game_sessions(owner_id);
create index if not exists game_session_members_user_id_idx
    on public.game_session_members(user_id);

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'game_sessions'
       ) then
        execute 'alter publication supabase_realtime add table public.game_sessions';
    end if;
end;
$$;

alter table public.game_sessions enable row level security;
alter table public.game_session_members enable row level security;

revoke all on public.game_sessions from anon, authenticated;
revoke all on public.game_session_members from anon, authenticated;
grant select, insert, delete on public.game_sessions to authenticated;
grant update (state, updated_at) on public.game_sessions to authenticated;
grant select on public.game_session_members to authenticated;

drop policy if exists "session members can read sessions" on public.game_sessions;
create policy "session members can read sessions"
    on public.game_sessions for select to authenticated
    using (
        owner_id = (select auth.uid())
        or exists (
            select 1 from public.game_session_members m
            where m.session_id = id and m.user_id = (select auth.uid())
        )
    );

drop policy if exists "users can create owned sessions" on public.game_sessions;
create policy "users can create owned sessions"
    on public.game_sessions for insert to authenticated
    with check (owner_id = (select auth.uid()));

drop policy if exists "owners can update session state" on public.game_sessions;
create policy "owners can update session state"
    on public.game_sessions for update to authenticated
    using (owner_id = (select auth.uid()))
    with check (owner_id = (select auth.uid()));

drop policy if exists "owners can delete sessions" on public.game_sessions;
create policy "owners can delete sessions"
    on public.game_sessions for delete to authenticated
    using (owner_id = (select auth.uid()));

drop policy if exists "users can see their session memberships" on public.game_session_members;
create policy "users can see their session memberships"
    on public.game_session_members for select to authenticated
    using (user_id = (select auth.uid()));

create or replace function public.join_game_session(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_session_id uuid;
    v_user_id uuid := auth.uid();
begin
    if v_user_id is null then
        raise exception 'Devi accedere per unirti a una sessione.' using errcode = '42501';
    end if;

    select s.id into v_session_id
    from public.game_sessions s
    where s.invite_code = upper(trim(p_invite_code));

    if v_session_id is null then
        raise exception 'Codice sessione non valido.' using errcode = 'P0002';
    end if;

    insert into public.game_session_members (session_id, user_id, role)
    values (v_session_id, v_user_id, 'player')
    on conflict (session_id, user_id) do nothing;

    return v_session_id;
end;
$$;

revoke all on function public.join_game_session(text) from public, anon;
grant execute on function public.join_game_session(text) to authenticated;

-- I Player possono salvare i propri token senza sovrascrivere mappa, nemici e
-- impostazioni gestiti dal Master. I ruoli non possono aggiornare direttamente la riga.
create or replace function public.save_player_session_state(
    p_session_id uuid,
    p_state jsonb,
    p_deleted_token_ids text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_current jsonb;
    v_current_palette jsonb;
    v_incoming_palette jsonb;
    v_current_tokens jsonb;
    v_incoming_tokens jsonb;
    v_enemy_palette jsonb;
    v_player_palette jsonb;
    v_kept_tokens jsonb;
    v_player_tokens jsonb;
    v_merged jsonb;
begin
    if v_user_id is null or not exists (
        select 1 from public.game_session_members m
        where m.session_id = p_session_id and m.user_id = v_user_id and m.role = 'player'
    ) then
        raise exception 'Non sei un giocatore di questa sessione.' using errcode = '42501';
    end if;

    select s.state into v_current
    from public.game_sessions s
    where s.id = p_session_id
    for update;
    if v_current is null then
        raise exception 'Sessione non trovata.' using errcode = 'P0002';
    end if;

    v_current_palette := coalesce(v_current->'palette', '[]'::jsonb);
    v_incoming_palette := coalesce(p_state->'palette', '[]'::jsonb);
    v_current_tokens := coalesce(v_current->'boardTokens', '[]'::jsonb);
    v_incoming_tokens := coalesce(p_state->'boardTokens', '[]'::jsonb);

    select coalesce(jsonb_agg(p.value), '[]'::jsonb) into v_enemy_palette
    from jsonb_array_elements(v_current_palette) p(value)
    where p.value->>'category' = 'nemici';

    select coalesce(jsonb_agg(p.value), '[]'::jsonb) into v_player_palette
    from jsonb_array_elements(v_incoming_palette) p(value)
    where coalesce(p.value->>'category', 'avventurieri') <> 'nemici';

    select coalesce(jsonb_agg(t.value), '[]'::jsonb) into v_kept_tokens
    from jsonb_array_elements(v_current_tokens) t(value)
    where (
        coalesce(t.value->>'category', (
            select p.value->>'category'
            from jsonb_array_elements(v_current_palette) p(value)
            where p.value->>'id' = t.value->>'templateId'
            limit 1
        ), 'avventurieri') = 'nemici'
        or (
            coalesce(t.value->>'category', (
                select p.value->>'category'
                from jsonb_array_elements(v_current_palette) p(value)
                where p.value->>'id' = t.value->>'templateId'
                limit 1
            ), 'avventurieri') <> 'nemici'
            and not coalesce(t.value->>'id', '') = any(coalesce(p_deleted_token_ids, array[]::text[]))
            and not exists (
                select 1 from jsonb_array_elements(v_incoming_tokens) n(value)
                where n.value->>'id' = t.value->>'id'
                  and coalesce(n.value->>'category', (
                      select p.value->>'category'
                      from jsonb_array_elements(v_incoming_palette) p(value)
                      where p.value->>'id' = n.value->>'templateId'
                      limit 1
                  ), 'avventurieri') <> 'nemici'
            )
        )
    );

    select coalesce(jsonb_agg(n.value), '[]'::jsonb) into v_player_tokens
    from jsonb_array_elements(v_incoming_tokens) n(value)
    where coalesce(n.value->>'category', (
        select p.value->>'category'
        from jsonb_array_elements(v_incoming_palette) p(value)
        where p.value->>'id' = n.value->>'templateId'
        limit 1
    ), 'avventurieri') <> 'nemici'
      and not coalesce(n.value->>'id', '') = any(coalesce(p_deleted_token_ids, array[]::text[]));

    v_merged := jsonb_set(v_current, '{palette}', v_enemy_palette || v_player_palette, true);
    v_merged := jsonb_set(v_merged, '{boardTokens}', v_kept_tokens || v_player_tokens, true);

    update public.game_sessions
    set state = v_merged, updated_at = now()
    where id = p_session_id;

    return v_merged;
end;
$$;

revoke all on function public.save_player_session_state(uuid, jsonb, text[]) from public, anon;
grant execute on function public.save_player_session_state(uuid, jsonb, text[]) to authenticated;

-- I canali privati Realtime sono limitati ai proprietari e ai membri della sessione.
drop policy if exists "session members can receive realtime broadcasts" on realtime.messages;
create policy "session members can receive realtime broadcasts"
    on realtime.messages for select to authenticated
    using (
        extension = 'broadcast'
        and exists (
            select 1 from public.game_sessions s
            where realtime.topic() = 'session:' || s.id::text
              and (s.owner_id = (select auth.uid()) or exists (
                  select 1 from public.game_session_members m
                  where m.session_id = s.id and m.user_id = (select auth.uid())
              ))
        )
    );

drop policy if exists "session members can send realtime broadcasts" on realtime.messages;
create policy "session members can send realtime broadcasts"
    on realtime.messages for insert to authenticated
    with check (
        extension = 'broadcast'
        and exists (
            select 1 from public.game_sessions s
            where realtime.topic() = 'session:' || s.id::text
              and (s.owner_id = (select auth.uid()) or exists (
                  select 1 from public.game_session_members m
                  where m.session_id = s.id and m.user_id = (select auth.uid())
              ))
        )
    );
