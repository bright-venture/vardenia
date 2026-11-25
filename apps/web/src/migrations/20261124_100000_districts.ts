import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Districts are towns now, and the Areas list is gone (24 November 2026,
 * decided by the owner).
 *
 * The owner's list of places (Jounieh, Faqra / Faraya, Deir el Qamar...) is
 * now the districts of each region (core/regions), and the separate Areas
 * collection, added on 18 November, is removed: one list instead of two.
 *
 * Every listing is moved to its new district before anything is dropped:
 *   1. from its area, when it has one (Byblos > Jbeil, Kfardebian and Ajaltoun
 *      > Faqra / Faraya, Ksara > Zahle, Douma > Batroun, Achrafieh > Beirut);
 *   2. otherwise from the town in its English address ("Ghazir", "Zouk Mosbeh /
 *      Adonis" > Jounieh, "Nahr Ibrahim" > Jbeil), using each district's name
 *      and the aliases of core/regions (the first one in the address wins);
 *   3. otherwise from its old district, when that place is still a district
 *      (Aley, Batroun, Zahle...; Rachaya > West Bekaa);
 *   4. otherwise none (an old Keserwan, Matn or Chouf district and no town
 *      found): a person picks it in the admin.
 * A district is only set when it belongs to the listing's own region, so no
 * listing is left with a pair the admin would refuse.
 *
 * Then `businesses.area_id`, the `areas` tables and their enum are dropped.
 * Down restores the old structure; the Areas list itself comes back empty.
 */

const NEW_DISTRICTS = sql.raw(
  `'beirut', 'dbayeh', 'broummana', 'bikfaya', 'baabda', 'hammana', 'aley', 'bassour', 'jounieh', 'harissa', 'kaslik', 'ghazir', 'tabarja', 'faqra-faraya', 'jbeil', 'batroun', 'chekka', 'koura', 'tripoli', 'zgharta', 'bsharri', 'akkar', 'deir-el-qamar', 'beiteddine', 'baakline', 'moukhtara', 'barouk', 'jiyeh', 'damour', 'zahle', 'baalbek', 'western-beqaa', 'hermel', 'chtoura', 'saghbine', 'masnaa', 'sidon', 'tyre', 'jezzine'`,
)
const OLD_DISTRICTS = sql.raw(
  `'beirut', 'aley', 'baabda', 'matn', 'jbeil', 'keserwan', 'akkar', 'batroun', 'bsharri', 'koura', 'miniyeh-danniyeh', 'tripoli', 'zgharta', 'chouf', 'baalbek', 'hermel', 'rachaya', 'western-beqaa', 'zahle', 'bint-jbeil', 'hasbaya', 'jezzine', 'marjeyoun', 'nabatieh', 'sidon', 'tyre'`,
)

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "payload"."enum_businesses_district_next" AS ENUM(${NEW_DISTRICTS});
    ALTER TABLE "payload"."businesses" ADD COLUMN "district_next" "payload"."enum_businesses_district_next";

    WITH area_map (area, district) AS (VALUES
        ('achrafieh', 'beirut'),
        ('gemmayzeh', 'beirut'),
        ('mar-mikhael', 'beirut'),
        ('downtown-beirut', 'beirut'),
        ('saifi', 'beirut'),
        ('hamra', 'beirut'),
        ('ras-beirut', 'beirut'),
        ('raouche', 'beirut'),
        ('ain-el-mreisseh', 'beirut'),
        ('verdun', 'beirut'),
        ('badaro', 'beirut'),
        ('mazraa', 'beirut'),
        ('broummana', 'broummana'),
        ('beit-mery', 'broummana'),
        ('bikfaya', 'bikfaya'),
        ('dbayeh', 'dbayeh'),
        ('jal-el-dib', 'dbayeh'),
        ('antelias', 'dbayeh'),
        ('sin-el-fil', 'dbayeh'),
        ('hazmieh', 'baabda'),
        ('baabda', 'baabda'),
        ('aley', 'aley'),
        ('bhamdoun', 'aley'),
        ('sawfar', 'aley'),
        ('jounieh', 'jounieh'),
        ('kaslik', 'kaslik'),
        ('harissa', 'harissa'),
        ('tabarja', 'tabarja'),
        ('faraya', 'faqra-faraya'),
        ('faqra', 'faqra-faraya'),
        ('kfardebian', 'faqra-faraya'),
        ('ajaltoun', 'faqra-faraya'),
        ('byblos', 'jbeil'),
        ('amchit', 'jbeil'),
        ('batroun', 'batroun'),
        ('douma', 'batroun'),
        ('tripoli', 'tripoli'),
        ('bsharri', 'bsharri'),
        ('the-cedars', 'bsharri'),
        ('ehden', 'zgharta'),
        ('chekka', 'chekka'),
        ('anfeh', 'koura'),
        ('amioun', 'koura'),
        ('halba', 'akkar'),
        ('deir-el-qamar', 'deir-el-qamar'),
        ('beiteddine', 'beiteddine'),
        ('baakline', 'baakline'),
        ('barouk', 'barouk'),
        ('maasser-el-chouf', 'barouk'),
        ('moukhtara', 'moukhtara'),
        ('damour', 'damour'),
        ('jiyeh', 'jiyeh'),
        ('zahle', 'zahle'),
        ('ksara', 'zahle'),
        ('chtaura', 'chtoura'),
        ('anjar', 'masnaa'),
        ('kefraya', 'western-beqaa'),
        ('ammiq', 'western-beqaa'),
        ('rashaya', 'western-beqaa'),
        ('baalbek', 'baalbek'),
        ('hermel', 'hermel'),
        ('sidon', 'sidon'),
        ('tyre', 'tyre'),
        ('jezzine', 'jezzine'),
        ('naqoura', 'tyre')
      ),
      old_map (old, district) AS (VALUES
        ('beirut', 'beirut'),
        ('aley', 'aley'),
        ('baabda', 'baabda'),
        ('jbeil', 'jbeil'),
        ('akkar', 'akkar'),
        ('batroun', 'batroun'),
        ('bsharri', 'bsharri'),
        ('koura', 'koura'),
        ('tripoli', 'tripoli'),
        ('zgharta', 'zgharta'),
        ('baalbek', 'baalbek'),
        ('hermel', 'hermel'),
        ('western-beqaa', 'western-beqaa'),
        ('zahle', 'zahle'),
        ('jezzine', 'jezzine'),
        ('sidon', 'sidon'),
        ('tyre', 'tyre'),
        ('rachaya', 'western-beqaa')
      ),
      parent (district, governorate) AS (VALUES
        ('beirut', 'beirut'),
        ('dbayeh', 'matn'),
        ('broummana', 'matn'),
        ('bikfaya', 'matn'),
        ('baabda', 'matn'),
        ('hammana', 'matn'),
        ('aley', 'matn'),
        ('bassour', 'matn'),
        ('jounieh', 'keserwan'),
        ('harissa', 'keserwan'),
        ('kaslik', 'keserwan'),
        ('ghazir', 'keserwan'),
        ('tabarja', 'keserwan'),
        ('faqra-faraya', 'keserwan'),
        ('jbeil', 'keserwan'),
        ('batroun', 'north-lebanon'),
        ('chekka', 'north-lebanon'),
        ('koura', 'north-lebanon'),
        ('tripoli', 'north-lebanon'),
        ('zgharta', 'north-lebanon'),
        ('bsharri', 'north-lebanon'),
        ('akkar', 'north-lebanon'),
        ('deir-el-qamar', 'chouf'),
        ('beiteddine', 'chouf'),
        ('baakline', 'chouf'),
        ('moukhtara', 'chouf'),
        ('barouk', 'chouf'),
        ('jiyeh', 'chouf'),
        ('damour', 'chouf'),
        ('zahle', 'beqaa'),
        ('baalbek', 'beqaa'),
        ('western-beqaa', 'beqaa'),
        ('hermel', 'beqaa'),
        ('chtoura', 'beqaa'),
        ('saghbine', 'beqaa'),
        ('masnaa', 'beqaa'),
        ('sidon', 'south-lebanon'),
        ('tyre', 'south-lebanon'),
        ('jezzine', 'south-lebanon')
      ),
      place (name, district) AS (VALUES
        ('beirut', 'beirut'),
        ('dbayeh', 'dbayeh'),
        ('broummana', 'broummana'),
        ('bikfaya', 'bikfaya'),
        ('baabda', 'baabda'),
        ('hammana', 'hammana'),
        ('aley', 'aley'),
        ('bassour', 'bassour'),
        ('jounieh', 'jounieh'),
        ('harissa', 'harissa'),
        ('kaslik', 'kaslik'),
        ('ghazir', 'ghazir'),
        ('tabarja', 'tabarja'),
        ('faqra faraya', 'faqra-faraya'),
        ('faqra', 'faqra-faraya'),
        ('faraya', 'faqra-faraya'),
        ('jbeil', 'jbeil'),
        ('batroun', 'batroun'),
        ('chekka', 'chekka'),
        ('koura', 'koura'),
        ('tripoli', 'tripoli'),
        ('zgharta', 'zgharta'),
        ('bsharri', 'bsharri'),
        ('bcharre', 'bsharri'),
        ('akkar', 'akkar'),
        ('deir el qamar', 'deir-el-qamar'),
        ('beiteddine', 'beiteddine'),
        ('baakline', 'baakline'),
        ('moukhtara', 'moukhtara'),
        ('barouk', 'barouk'),
        ('jiyeh', 'jiyeh'),
        ('damour', 'damour'),
        ('zahle', 'zahle'),
        ('baalbek', 'baalbek'),
        ('western beqaa', 'western-beqaa'),
        ('west bekaa', 'western-beqaa'),
        ('hermel', 'hermel'),
        ('chtoura', 'chtoura'),
        ('saghbine', 'saghbine'),
        ('masnaa', 'masnaa'),
        ('sidon', 'sidon'),
        ('saida', 'sidon'),
        ('tyre', 'tyre'),
        ('sour', 'tyre'),
        ('jezzine', 'jezzine'),
        ('byblos', 'jbeil'),
        ('amchit', 'jbeil'),
        ('fakra', 'faqra-faraya'),
        ('kfardebian', 'faqra-faraya'),
        ('ajaltoun', 'faqra-faraya'),
        ('zouk', 'jounieh'),
        ('zouk mosbeh', 'jounieh'),
        ('zouk mikael', 'jounieh'),
        ('adonis', 'jounieh'),
        ('sarba', 'jounieh'),
        ('jeita', 'jounieh'),
        ('kfarhbab', 'ghazir'),
        ('daraoun', 'harissa'),
        ('daraaoun', 'harissa'),
        ('bzoummar', 'harissa'),
        ('bzommar', 'harissa'),
        ('safra', 'tabarja'),
        ('mayrouba', 'faqra-faraya'),
        ('nahr ibrahim', 'jbeil'),
        ('bsharre', 'bsharri'),
        ('the cedars', 'bsharri'),
        ('cedars', 'bsharri'),
        ('ehden', 'zgharta'),
        ('douma', 'batroun'),
        ('anfeh', 'koura'),
        ('amioun', 'koura'),
        ('halba', 'akkar'),
        ('deir al qamar', 'deir-el-qamar'),
        ('maasser el chouf', 'barouk'),
        ('brummana', 'broummana'),
        ('beit mery', 'broummana'),
        ('jal el dib', 'dbayeh'),
        ('antelias', 'dbayeh'),
        ('hazmieh', 'baabda'),
        ('bhamdoun', 'aley'),
        ('sawfar', 'aley'),
        ('chtaura', 'chtoura'),
        ('ksara', 'zahle'),
        ('kefraya', 'western-beqaa'),
        ('ammiq', 'western-beqaa'),
        ('rashaya', 'western-beqaa'),
        ('rachaya', 'western-beqaa'),
        ('anjar', 'masnaa'),
        ('naqoura', 'tyre')
      ),
      address AS (
        SELECT l._parent_id AS id,
          ' ' || trim(regexp_replace(lower(l.address), '[^a-z0-9]+', ' ', 'g')) || ' ' AS words
        FROM "payload"."businesses_locales" l
        WHERE l._locale = 'en' AND l.address IS NOT NULL
      ),
      address_pick AS (
        SELECT DISTINCT ON (ad.id) ad.id, pl.district
        FROM address ad
        JOIN place pl ON strpos(ad.words, ' ' || pl.name || ' ') > 0
        JOIN "payload"."businesses" b ON b.id = ad.id
        JOIN parent p ON p.district = pl.district AND p.governorate = b.governorate::text
        ORDER BY ad.id, strpos(ad.words, ' ' || pl.name || ' ')
      ),
      pick AS (
        SELECT b.id, COALESCE(am.district, ap.district, om.district) AS district
        FROM "payload"."businesses" b
        LEFT JOIN "payload"."areas" a ON a.id = b.area_id
        LEFT JOIN area_map am ON am.area = a.slug
        LEFT JOIN address_pick ap ON ap.id = b.id
        LEFT JOIN old_map om ON om.old = b.district::text
      )
    UPDATE "payload"."businesses" b
    SET district_next = pick.district::"payload"."enum_businesses_district_next"
    FROM pick JOIN parent p ON p.district = pick.district
    WHERE pick.id = b.id AND p.governorate = b.governorate::text;

    DROP INDEX IF EXISTS "payload"."businesses_district_idx";
    ALTER TABLE "payload"."businesses" DROP COLUMN "district";
    DROP TYPE "payload"."enum_businesses_district";
    ALTER TYPE "payload"."enum_businesses_district_next" RENAME TO "enum_businesses_district";
    ALTER TABLE "payload"."businesses" RENAME COLUMN "district_next" TO "district";
    CREATE INDEX "businesses_district_idx" ON "payload"."businesses" USING btree ("district");

    ALTER TABLE "payload"."businesses" DROP CONSTRAINT IF EXISTS "businesses_area_id_areas_id_fk";
    ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_areas_fk";
    DROP INDEX IF EXISTS "payload"."businesses_area_idx";
    DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_areas_id_idx";
    ALTER TABLE "payload"."businesses" DROP COLUMN IF EXISTS "area_id";
    ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "areas_id";
    DROP TABLE IF EXISTS "payload"."areas_locales" CASCADE;
    DROP TABLE IF EXISTS "payload"."areas" CASCADE;
    DROP TYPE IF EXISTS "payload"."enum_areas_governorate";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "payload"."enum_businesses_district_prev" AS ENUM(${OLD_DISTRICTS});
    ALTER TABLE "payload"."businesses" ADD COLUMN "district_prev" "payload"."enum_businesses_district_prev";
    -- A district that was also an old one keeps its value; the towns had no
    -- old district of their own and are left empty.
    UPDATE "payload"."businesses"
    SET district_prev = district::text::"payload"."enum_businesses_district_prev"
    WHERE district::text IN (${OLD_DISTRICTS});
    DROP INDEX IF EXISTS "payload"."businesses_district_idx";
    ALTER TABLE "payload"."businesses" DROP COLUMN "district";
    DROP TYPE "payload"."enum_businesses_district";
    ALTER TYPE "payload"."enum_businesses_district_prev" RENAME TO "enum_businesses_district";
    ALTER TABLE "payload"."businesses" RENAME COLUMN "district_prev" TO "district";
    CREATE INDEX "businesses_district_idx" ON "payload"."businesses" USING btree ("district");

    CREATE TYPE "payload"."enum_areas_governorate" AS ENUM('beirut', 'matn', 'keserwan', 'north-lebanon', 'chouf', 'beqaa', 'south-lebanon');
    CREATE TABLE "payload"."areas" (
      "id" serial PRIMARY KEY NOT NULL,
      "slug" varchar NOT NULL,
      "governorate" "payload"."enum_areas_governorate" NOT NULL,
      "order" numeric DEFAULT 0,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "payload"."areas_locales" (
      "name" varchar NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "payload"."_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    ALTER TABLE "payload"."areas" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "payload"."areas_locales" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "payload"."businesses" ADD COLUMN "area_id" integer;
    ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "areas_id" integer;
    ALTER TABLE "payload"."areas_locales" ADD CONSTRAINT "areas_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."areas"("id") ON DELETE cascade ON UPDATE no action;
    CREATE UNIQUE INDEX "areas_slug_idx" ON "payload"."areas" USING btree ("slug");
    CREATE INDEX "areas_governorate_idx" ON "payload"."areas" USING btree ("governorate");
    CREATE INDEX "areas_updated_at_idx" ON "payload"."areas" USING btree ("updated_at");
    CREATE INDEX "areas_created_at_idx" ON "payload"."areas" USING btree ("created_at");
    CREATE UNIQUE INDEX "areas_locales_locale_parent_id_unique" ON "payload"."areas_locales" USING btree ("_locale","_parent_id");
    ALTER TABLE "payload"."businesses" ADD CONSTRAINT "businesses_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "payload"."areas"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_areas_fk" FOREIGN KEY ("areas_id") REFERENCES "payload"."areas"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "businesses_area_idx" ON "payload"."businesses" USING btree ("area_id");
    CREATE INDEX "payload_locked_documents_rels_areas_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("areas_id");
  `)
}
