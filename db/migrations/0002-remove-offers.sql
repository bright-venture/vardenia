-- Remove the offers feature entirely: tables, relations, and enum values.
--
-- Offers were built but never rendered. Nothing queried the collection, the tier
-- gate that was supposed to restrict them was documented and never enforced, and
-- QR codes could target an offer page that did not exist. Rather than leave a
-- half-feature in the admin for staff to fill in, it comes out until the team
-- decides what an offer should actually be.
--
-- Run once per environment, in the Supabase SQL editor or via psql.
--
-- Destructive: this deletes offer content permanently. There is one row today
-- ("20% off spa treatments", a test), and no QR code points at any offer, so
-- nothing in circulation breaks. Verify both of those before running this
-- anywhere that has real data:
--
--   select count(*) from payload.offers;
--   select code from payload.qr_codes where target_type = 'offer';

begin;

-- 1. Break the references into offers before the tables go.
alter table payload.qr_codes                     drop column if exists offer_id;
alter table payload.payload_locked_documents_rels drop column if exists offers_id;

-- 2. Content, children first.
drop table if exists payload._offers_v_locales;
drop table if exists payload._offers_v;
drop table if exists payload.offers_locales;
drop table if exists payload.offers;

-- 3. The enums those tables owned. Nothing else uses them.
drop type if exists payload.enum__offers_v_published_locale;
drop type if exists payload.enum__offers_v_version_redemption_type;
drop type if exists payload.enum__offers_v_version_status;
drop type if exists payload.enum_offers_redemption_type;
drop type if exists payload.enum_offers_status;

-- 4. Drop 'offer' from the QR target type.
--
--    Postgres cannot remove a value from an enum, so the type is rebuilt and the
--    column swapped onto it. The update is a safety net: it is a no-op today
--    because no code targets an offer, and without it the type swap would fail
--    on any row that did.
update payload.qr_codes set target_type = 'business' where target_type = 'offer';

alter table payload.qr_codes alter column target_type drop default;

alter type payload.enum_qr_codes_target_type rename to enum_qr_codes_target_type_old;
create type payload.enum_qr_codes_target_type as enum (
  'business', 'article', 'issue', 'category', 'external'
);

alter table payload.qr_codes
  alter column target_type type payload.enum_qr_codes_target_type
  using target_type::text::payload.enum_qr_codes_target_type;

alter table payload.qr_codes alter column target_type set default 'business';
drop type payload.enum_qr_codes_target_type_old;

commit;
