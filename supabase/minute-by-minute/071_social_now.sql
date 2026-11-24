-- 071: the Social tab shows what each friend is doing right now (when they share it), and yours.

-- What someone is doing now, if they let you see it (private jobs show as "Busy").
create or replace function social_now(them uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when social_can_see(them, auth.uid(), 'now') then (
    select jsonb_build_object('name', case when a.private or c.private then 'Busy' else coalesce(a.name, 'Something') end,
                              'color', case when a.private or c.private then '#b9ab9b' else coalesce(a.color, '#b9ab9b') end,
                              'since', b.started_at)
    from blocks b left join activities a on a.id = b.activity_id left join categories c on c.id = a.category_id
    where b.user_id = them and b.ended_at is null order by b.started_at desc limit 1)
  end;
$$;

create or replace function my_social() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'me', (select jsonb_build_object('id', user_id, 'username', username, 'name', name, 'avatar', avatar, 'share', share, 'now', social_now(user_id))
           from profiles where user_id = auth.uid()),
    'friends', coalesce((select jsonb_agg(social_card(friend_id) || jsonb_build_object('now', social_now(friend_id)) order by since desc)
                         from friends where user_id = auth.uid()), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(social_card(from_id) || jsonb_build_object('at', created_at) order by created_at desc) from friend_requests where to_id = auth.uid()), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(social_card(to_id) order by created_at desc) from friend_requests where from_id = auth.uid()), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', b.blocked_id, 'username', p.username, 'name', coalesce(nullif(p.name, ''), p.username), 'avatar', p.avatar))
                         from user_blocks b left join profiles p on p.user_id = b.blocked_id where b.user_id = auth.uid()), '[]'::jsonb),
    'pinned', coalesce((select jsonb_agg(day order by day desc) from shared_days where user_id = auth.uid()), '[]'::jsonb)
  );
$$;

revoke all on function social_now(uuid) from public, anon;
grant execute on function social_now(uuid) to authenticated;
