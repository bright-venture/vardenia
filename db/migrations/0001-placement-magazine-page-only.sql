-- Narrow the QR placement enum to the one surface that exists: the printed magazine.
--
-- Run against each environment once, in the Supabase SQL editor or via psql.
--
-- There are no existence guards here, so read it before running it against
-- anything you care about. It happens to survive a second run - the type gets
-- rebuilt with the same single value - but that is a property of this particular
-- change, not a promise the script makes.
--
-- Postgres cannot drop a value from an enum. The type has to be rebuilt and the
-- columns swapped over to it, which is why this is longer than the change sounds.
--
-- Order matters. The type swap fails while any row still holds a value the new
-- type does not contain, so the data is rewritten first.

begin;

-- 1. Retire the values that described surfaces we never shipped.
--
--    This rewrites history on scan_events: a scan previously attributed to
--    'digital' now reads 'magazine-page'. Acceptable only because no code has
--    ever been printed on anything else, so no real attribution is being lost.
--    If that stops being true, keep the old value and widen the enum instead.
update payload.qr_codes
   set placement = 'magazine-page'
 where placement <> 'magazine-page';

update payload.scan_events
   set placement = 'magazine-page'
 where placement is not null
   and placement <> 'magazine-page';

-- 2. qr_codes.placement - not null, with a default that has to be dropped and
--    restored around the type change.
alter table payload.qr_codes alter column placement drop default;

alter type payload.enum_qr_codes_placement rename to enum_qr_codes_placement_old;
create type payload.enum_qr_codes_placement as enum ('magazine-page');

alter table payload.qr_codes
  alter column placement type payload.enum_qr_codes_placement
  using placement::text::payload.enum_qr_codes_placement;

alter table payload.qr_codes alter column placement set default 'magazine-page';
drop type payload.enum_qr_codes_placement_old;

-- 3. scan_events.placement - nullable, no default.
alter type payload.enum_scan_events_placement rename to enum_scan_events_placement_old;
create type payload.enum_scan_events_placement as enum ('magazine-page');

alter table payload.scan_events
  alter column placement type payload.enum_scan_events_placement
  using placement::text::payload.enum_scan_events_placement;

drop type payload.enum_scan_events_placement_old;

commit;
