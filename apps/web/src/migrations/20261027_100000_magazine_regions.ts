import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The magazine's seven regions replace the eight governorates (see
 * core/regions): Beirut, Matn, Keserwan, North Lebanon, Chouf, Beqaa and South
 * Lebanon.
 *
 * Postgres cannot drop a value from an enum, so each of the four columns goes
 * to text, is rewritten, and comes back as the new type. One transaction: the
 * types are created here, not extended, so their values are usable at once.
 *
 * A listing's district decides its region, because every district sits in
 * exactly one region. Where there is no district, the old governorate does.
 * Articles carry no district, so theirs follows the governorate alone.
 */

const SCHEMA = '"payload"'

const TYPES = [
  'enum_businesses_governorate',
  'enum__businesses_v_version_governorate',
  'enum_articles_governorate',
  'enum__articles_v_version_governorate',
] as const

const COLUMNS: { table: string; column: string; district: string | null; type: string }[] = [
  {
    table: 'businesses',
    column: 'governorate',
    district: 'district',
    type: 'enum_businesses_governorate',
  },
  {
    table: '_businesses_v',
    column: 'version_governorate',
    district: 'version_district',
    type: 'enum__businesses_v_version_governorate',
  },
  { table: 'articles', column: 'governorate', district: null, type: 'enum_articles_governorate' },
  {
    table: '_articles_v',
    column: 'version_governorate',
    district: null,
    type: 'enum__articles_v_version_governorate',
  },
]

const REGIONS = ['beirut', 'matn', 'keserwan', 'north-lebanon', 'chouf', 'beqaa', 'south-lebanon']
const GOVERNORATES = [
  'beirut',
  'mount-lebanon',
  'north-lebanon',
  'akkar',
  'beqaa',
  'baalbek-hermel',
  'south-lebanon',
  'nabatieh',
]

const REGION_OF_DISTRICT: Record<string, string> = {
  beirut: 'beirut',
  aley: 'matn',
  baabda: 'matn',
  matn: 'matn',
  jbeil: 'keserwan',
  keserwan: 'keserwan',
  akkar: 'north-lebanon',
  batroun: 'north-lebanon',
  bsharri: 'north-lebanon',
  koura: 'north-lebanon',
  'miniyeh-danniyeh': 'north-lebanon',
  tripoli: 'north-lebanon',
  zgharta: 'north-lebanon',
  chouf: 'chouf',
  baalbek: 'beqaa',
  hermel: 'beqaa',
  rachaya: 'beqaa',
  'western-beqaa': 'beqaa',
  zahle: 'beqaa',
  'bint-jbeil': 'south-lebanon',
  hasbaya: 'south-lebanon',
  jezzine: 'south-lebanon',
  marjeyoun: 'south-lebanon',
  nabatieh: 'south-lebanon',
  sidon: 'south-lebanon',
  tyre: 'south-lebanon',
}

/** For a row with no district. Keserwan-Jbeil only ever existed in a dev database. */
const REGION_OF_GOVERNORATE: Record<string, string> = {
  'mount-lebanon': 'matn',
  'keserwan-jbeil': 'keserwan',
  akkar: 'north-lebanon',
  'baalbek-hermel': 'beqaa',
  nabatieh: 'south-lebanon',
}

const GOVERNORATE_OF_DISTRICT: Record<string, string> = {
  beirut: 'beirut',
  aley: 'mount-lebanon',
  baabda: 'mount-lebanon',
  chouf: 'mount-lebanon',
  matn: 'mount-lebanon',
  jbeil: 'mount-lebanon',
  keserwan: 'mount-lebanon',
  akkar: 'akkar',
  batroun: 'north-lebanon',
  bsharri: 'north-lebanon',
  koura: 'north-lebanon',
  'miniyeh-danniyeh': 'north-lebanon',
  tripoli: 'north-lebanon',
  zgharta: 'north-lebanon',
  baalbek: 'baalbek-hermel',
  hermel: 'baalbek-hermel',
  rachaya: 'beqaa',
  'western-beqaa': 'beqaa',
  zahle: 'beqaa',
  'bint-jbeil': 'nabatieh',
  hasbaya: 'nabatieh',
  marjeyoun: 'nabatieh',
  nabatieh: 'nabatieh',
  jezzine: 'south-lebanon',
  sidon: 'south-lebanon',
  tyre: 'south-lebanon',
}

const GOVERNORATE_OF_REGION: Record<string, string> = {
  matn: 'mount-lebanon',
  keserwan: 'mount-lebanon',
  chouf: 'mount-lebanon',
}

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

const caseOf = (column: string, map: Record<string, string>, otherwise: string) =>
  `CASE ${column} ${Object.entries(map)
    .map(([from, to]) => `WHEN ${quote(from)} THEN ${quote(to)}`)
    .join(' ')} ELSE ${otherwise} END`

function rewrite(
  values: string[],
  byDistrict: Record<string, string>,
  byOld: Record<string, string>,
): string {
  const statements: string[] = []
  for (const { table, column } of COLUMNS) {
    statements.push(`ALTER TABLE ${SCHEMA}."${table}" ALTER COLUMN "${column}" SET DATA TYPE text;`)
  }
  for (const type of TYPES) statements.push(`DROP TYPE ${SCHEMA}."${type}";`)
  for (const type of TYPES) {
    statements.push(`CREATE TYPE ${SCHEMA}."${type}" AS ENUM(${values.map(quote).join(', ')});`)
  }
  for (const { table, column, district, type } of COLUMNS) {
    const fromOld = caseOf(`"${column}"`, byOld, `"${column}"`)
    const target = district ? caseOf(`"${district}"`, byDistrict, fromOld) : fromOld
    statements.push(`UPDATE ${SCHEMA}."${table}" SET "${column}" = ${target};`)
    statements.push(
      `ALTER TABLE ${SCHEMA}."${table}" ALTER COLUMN "${column}" SET DATA TYPE ${SCHEMA}."${type}" USING "${column}"::${SCHEMA}."${type}";`,
    )
  }
  return statements.join('\n')
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(rewrite(REGIONS, REGION_OF_DISTRICT, REGION_OF_GOVERNORATE)))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(rewrite(GOVERNORATES, GOVERNORATE_OF_DISTRICT, GOVERNORATE_OF_REGION)))
}
