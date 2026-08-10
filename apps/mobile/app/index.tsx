import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { TAXONOMY } from '@vardenia/core'
import { colors, spacing, typography } from '@vardenia/tokens'

/**
 * Placeholder home screen. Proves the shared packages resolve inside React
 * Native - the categories below come from the same file the website and CMS read.
 */
export default function Home() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>DISCOVER LEBANON</Text>
      <Text style={styles.title}>Vardenia</Text>
      <Text style={styles.body}>
        Scaffold in place. Map, QR scanner, and offline listings come next.
      </Text>

      <View style={styles.grid}>
        {TAXONOMY.map((category) => (
          <View key={category.slug} style={styles.card}>
            <Text style={styles.cardTitle}>{category.en}</Text>
            <Text style={styles.cardMeta}>{category.children.length} subcategories</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: spacing[6], gap: spacing[3] },
  eyebrow: {
    color: colors.gold[700],
    fontSize: typography.scale.xs,
    letterSpacing: 3,
  },
  title: { fontSize: typography.scale['4xl'], color: colors.ink[900] },
  body: { fontSize: typography.scale.base, color: colors.ink[500], lineHeight: 24 },
  grid: { marginTop: spacing[6], gap: spacing[3] },
  card: {
    borderWidth: 1,
    borderColor: colors.ink[100],
    borderRadius: 12,
    padding: spacing[4],
  },
  cardTitle: { fontSize: typography.scale.lg, color: colors.ink[900] },
  cardMeta: { fontSize: typography.scale.sm, color: colors.ink[300] },
})
