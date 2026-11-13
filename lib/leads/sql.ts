/**
 * The query that finds people already collected in the app.
 *
 * Kept as a plain string, in a file that imports nothing, so the test can
 * run the exact text the app runs rather than a copy of it that drifts.
 * $1 is the account.
 */
export const COLLECTED_HANDLES_SQL = `
  with mine as (
    select lower(handle) as handle from profile
      where account_id = $1 and handle is not null and handle <> ''
    union
    select lower(handle) from social_handles
      where account_id = $1 and handle is not null and handle <> ''
  ),
  seen as (
    select lower(p.handle) as handle,
           case when p.platform = 'reference' then 'reference' else 'board' end as source,
           count(*)::int as posts
      from posts p
     where p.account_id = $1
       and p.handle is not null and p.handle <> ''
       and lower(p.handle) not in (select handle from mine)
     group by 1, 2
    union all
    select lower(i.handle) as handle, 'teardown' as source, count(*)::int as posts
      from insights i
     where i.account_id = $1
       and i.handle is not null and i.handle <> ''
       and lower(i.handle) not in (select handle from mine)
     group by 1, 2
  )
  select handle,
         -- A handle found two ways keeps the more deliberate one.
         (array_agg(source order by
           case source when 'teardown' then 1 when 'reference' then 2 else 3 end
         ))[1] as source,
         sum(posts)::int as posts
    from seen
   group by handle
   order by sum(posts) desc, handle
`;
