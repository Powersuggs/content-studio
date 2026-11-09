import { query } from "@/lib/db";
import { MUST_BE_OPEN, MUST_BE_LOCKED, type TableState } from "./expected";

/**
 * Reads the live database's own catalog.
 *
 * pg_class and pg_policy are readable by any role, so this works
 * whatever the app is connecting as, which matters: the whole bug this
 * page exists to catch was caused by the app's role changing.
 */
export async function readTableStates(): Promise<TableState[]> {
  const wanted = [...MUST_BE_OPEN, ...MUST_BE_LOCKED];
  const rows = await query<{
    table_name: string;
    rls_on: boolean;
    forced: boolean;
    policies: string;
  }>(
    `select c.relname        as table_name,
            c.relrowsecurity as rls_on,
            c.relforcerowsecurity as forced,
            count(p.polname) as policies
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_policy p on p.polrelid = c.oid
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname = any($1::text[])
      group by 1, 2, 3`,
    [wanted],
  );

  const byName = new Map(rows.map((r) => [r.table_name, r]));
  return wanted.map((table) => {
    const r = byName.get(table);
    return {
      table,
      present: Boolean(r),
      rlsOn: Boolean(r?.rls_on),
      forced: Boolean(r?.forced),
      policies: Number(r?.policies ?? 0),
    };
  });
}
