import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Areas (18 November 2026): the neighbourhoods and towns guests filter by,
 * Achrafieh in Beirut, Faraya in Keserwan, replacing districts in the
 * directory's Filters.
 *
 * Adds the `areas` table (with English and Arabic names) and `businesses.area_id`,
 * then seeds the starting list from core AREA_SEED (67 areas). The seed skips
 * a slug that already exists, so running it where areas were added by hand
 * changes nothing. No listing is given an area here; that is done per listing
 * by the team, or by a matching script checked by a person.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
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
  CREATE INDEX "payload_locked_documents_rels_areas_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("areas_id");`)

  await db.execute(sql`
    ALTER TABLE "payload"."areas" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "payload"."areas_locales" ENABLE ROW LEVEL SECURITY;

    WITH seed (slug, governorate, sort, name_en, name_ar) AS (VALUES
      ('achrafieh', 'beirut', 1, 'Achrafieh', 'الأشرفية'),
      ('gemmayzeh', 'beirut', 2, 'Gemmayzeh', 'الجميزة'),
      ('mar-mikhael', 'beirut', 3, 'Mar Mikhael', 'مار مخايل'),
      ('downtown-beirut', 'beirut', 4, 'Downtown', 'وسط بيروت'),
      ('saifi', 'beirut', 5, 'Saifi', 'الصيفي'),
      ('hamra', 'beirut', 6, 'Hamra', 'الحمرا'),
      ('ras-beirut', 'beirut', 7, 'Ras Beirut', 'رأس بيروت'),
      ('raouche', 'beirut', 8, 'Raouche', 'الروشة'),
      ('ain-el-mreisseh', 'beirut', 9, 'Ain el-Mreisseh', 'عين المريسة'),
      ('verdun', 'beirut', 10, 'Verdun', 'فردان'),
      ('badaro', 'beirut', 11, 'Badaro', 'بدارو'),
      ('mazraa', 'beirut', 12, 'Mazraa', 'المزرعة'),
      ('broummana', 'matn', 1, 'Broummana', 'برمانا'),
      ('beit-mery', 'matn', 2, 'Beit Mery', 'بيت مري'),
      ('bikfaya', 'matn', 3, 'Bikfaya', 'بكفيا'),
      ('dbayeh', 'matn', 4, 'Dbayeh', 'ضبية'),
      ('jal-el-dib', 'matn', 5, 'Jal el-Dib', 'جل الديب'),
      ('antelias', 'matn', 6, 'Antelias', 'انطلياس'),
      ('sin-el-fil', 'matn', 7, 'Sin el-Fil', 'سن الفيل'),
      ('hazmieh', 'matn', 8, 'Hazmieh', 'الحازمية'),
      ('baabda', 'matn', 9, 'Baabda', 'بعبدا'),
      ('aley', 'matn', 10, 'Aley', 'عاليه'),
      ('bhamdoun', 'matn', 11, 'Bhamdoun', 'بحمدون'),
      ('sawfar', 'matn', 12, 'Sawfar', 'صوفر'),
      ('jounieh', 'keserwan', 1, 'Jounieh', 'جونية'),
      ('kaslik', 'keserwan', 2, 'Kaslik', 'الكسليك'),
      ('harissa', 'keserwan', 3, 'Harissa', 'حريصا'),
      ('faraya', 'keserwan', 4, 'Faraya', 'فاريا'),
      ('faqra', 'keserwan', 5, 'Faqra', 'فقرا'),
      ('kfardebian', 'keserwan', 6, 'Kfardebian', 'كفرذبيان'),
      ('ajaltoun', 'keserwan', 7, 'Ajaltoun', 'عجلتون'),
      ('tabarja', 'keserwan', 8, 'Tabarja', 'طبرجا'),
      ('byblos', 'keserwan', 9, 'Byblos (Jbeil)', 'جبيل'),
      ('amchit', 'keserwan', 10, 'Amchit', 'عمشيت'),
      ('batroun', 'north-lebanon', 1, 'Batroun', 'البترون'),
      ('douma', 'north-lebanon', 2, 'Douma', 'دوما'),
      ('tripoli', 'north-lebanon', 3, 'Tripoli', 'طرابلس'),
      ('bsharri', 'north-lebanon', 4, 'Bsharri', 'بشري'),
      ('the-cedars', 'north-lebanon', 5, 'The Cedars', 'الأرز'),
      ('ehden', 'north-lebanon', 6, 'Ehden', 'إهدن'),
      ('chekka', 'north-lebanon', 7, 'Chekka', 'شكا'),
      ('anfeh', 'north-lebanon', 8, 'Anfeh', 'أنفه'),
      ('amioun', 'north-lebanon', 9, 'Amioun', 'أميون'),
      ('halba', 'north-lebanon', 10, 'Halba', 'حلبا'),
      ('deir-el-qamar', 'chouf', 1, 'Deir el-Qamar', 'دير القمر'),
      ('beiteddine', 'chouf', 2, 'Beiteddine', 'بيت الدين'),
      ('baakline', 'chouf', 3, 'Baakline', 'بعقلين'),
      ('barouk', 'chouf', 4, 'Barouk', 'الباروك'),
      ('maasser-el-chouf', 'chouf', 5, 'Maasser el-Chouf', 'معاصر الشوف'),
      ('moukhtara', 'chouf', 6, 'Moukhtara', 'المختارة'),
      ('damour', 'chouf', 7, 'Damour', 'الدامور'),
      ('jiyeh', 'chouf', 8, 'Jiyeh', 'الجية'),
      ('zahle', 'beqaa', 1, 'Zahle', 'زحلة'),
      ('ksara', 'beqaa', 2, 'Ksara', 'كسارة'),
      ('chtaura', 'beqaa', 3, 'Chtaura', 'شتورة'),
      ('anjar', 'beqaa', 4, 'Anjar', 'عنجر'),
      ('kefraya', 'beqaa', 5, 'Kefraya', 'كفريا'),
      ('ammiq', 'beqaa', 6, 'Ammiq', 'عميق'),
      ('baalbek', 'beqaa', 7, 'Baalbek', 'بعلبك'),
      ('hermel', 'beqaa', 8, 'Hermel', 'الهرمل'),
      ('rashaya', 'beqaa', 9, 'Rashaya', 'راشيا'),
      ('sidon', 'south-lebanon', 1, 'Sidon (Saida)', 'صيدا'),
      ('tyre', 'south-lebanon', 2, 'Tyre (Sour)', 'صور'),
      ('jezzine', 'south-lebanon', 3, 'Jezzine', 'جزين'),
      ('nabatieh', 'south-lebanon', 4, 'Nabatieh', 'النبطية'),
      ('naqoura', 'south-lebanon', 5, 'Naqoura', 'الناقورة'),
      ('marjeyoun', 'south-lebanon', 6, 'Marjeyoun', 'مرجعيون')
    ),
    added AS (
      INSERT INTO "payload"."areas" (slug, governorate, "order", updated_at, created_at)
      SELECT s.slug, s.governorate::"payload"."enum_areas_governorate", s.sort, now(), now()
      FROM seed s
      WHERE NOT EXISTS (SELECT 1 FROM "payload"."areas" a WHERE a.slug = s.slug)
      RETURNING id, slug
    )
    INSERT INTO "payload"."areas_locales" (name, _locale, _parent_id)
    SELECT s.name_en, 'en'::"payload"."_locales", added.id FROM added JOIN seed s ON s.slug = added.slug
    UNION ALL
    SELECT s.name_ar, 'ar'::"payload"."_locales", added.id FROM added JOIN seed s ON s.slug = added.slug;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."areas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."areas_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."areas" CASCADE;
  DROP TABLE "payload"."areas_locales" CASCADE;
  ALTER TABLE "payload"."businesses" DROP CONSTRAINT "businesses_area_id_areas_id_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_areas_fk";
  
  DROP INDEX "payload"."businesses_area_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_areas_id_idx";
  ALTER TABLE "payload"."businesses" DROP COLUMN "area_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "areas_id";
  DROP TYPE "payload"."enum_areas_governorate";`)
}
