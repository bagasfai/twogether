-- FAQ ordering RPCs (docs/superpowers/specs/2026-10-22-about-faq-design.md).
-- Create, move and delete all read-then-write sort_order, so each takes the
-- same advisory lock (public.faq_lock_key()) after its guards: concurrent
-- admins serialise instead of computing the same max()+1 or the same
-- neighbour. Guard wording mirrors 20260912000015_error_codes.sql:
--   JB006 wrong transaction isolation
--   JB007 not authorized
--   JB008 not found
--   JB011 invalid input (direction)
-- Blank or over-length text surfaces as the table's check violation 23514.

create function public.faq_create(
  p_question_en text,
  p_question_id text,
  p_answer_en text,
  p_answer_id text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'faq_create requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if not public.is_admin() then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.faq_lock_key());

  insert into public.faq_items
    (question_en, question_id, answer_en, answer_id, sort_order)
  select p_question_en, p_question_id, p_answer_en, p_answer_id,
         coalesce(max(sort_order), 0) + 1
    from public.faq_items
  returning id into v_id;

  return v_id;
end;
$$;

create function public.faq_move(p_id uuid, p_direction text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_order integer;
  v_neighbour_id uuid;
  v_neighbour_order integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'faq_move requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if not public.is_admin() then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.faq_lock_key());

  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down' using errcode = 'JB011';
  end if;

  select sort_order into v_order from public.faq_items where id = p_id;
  if not found then
    raise exception 'faq item not found' using errcode = 'JB008';
  end if;

  if p_direction = 'up' then
    select id, sort_order into v_neighbour_id, v_neighbour_order
      from public.faq_items
     where sort_order < v_order
     order by sort_order desc
     limit 1;
  else
    select id, sort_order into v_neighbour_id, v_neighbour_order
      from public.faq_items
     where sort_order > v_order
     order by sort_order asc
     limit 1;
  end if;

  -- Already at the edge: nothing to swap.
  if v_neighbour_id is null then
    return;
  end if;

  -- One statement; the unique constraint is deferrable so the transient
  -- duplicate inside the swap is checked only at statement end.
  update public.faq_items
     set sort_order = case id
           when p_id then v_neighbour_order
           else v_order
         end
   where id in (p_id, v_neighbour_id);
end;
$$;

create function public.faq_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'faq_delete requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if not public.is_admin() then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.faq_lock_key());

  delete from public.faq_items where id = p_id returning sort_order into v_deleted;
  if not found then
    raise exception 'faq item not found' using errcode = 'JB008';
  end if;

  update public.faq_items
     set sort_order = sort_order - 1
   where sort_order > v_deleted;
end;
$$;

revoke execute on function public.faq_create(text, text, text, text) from public, anon;
revoke execute on function public.faq_move(uuid, text) from public, anon;
revoke execute on function public.faq_delete(uuid) from public, anon;
grant execute on function public.faq_create(text, text, text, text) to authenticated;
grant execute on function public.faq_move(uuid, text) to authenticated;
grant execute on function public.faq_delete(uuid) to authenticated;
