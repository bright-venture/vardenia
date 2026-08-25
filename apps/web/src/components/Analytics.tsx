import { analyticsConfig } from '../lib/analytics'

/**
 * The analytics script tag, or nothing at all.
 *
 * A server component, so it costs the page nothing and adds no client bundle -
 * it renders one `<script>` and has no state.
 *
 * # A plain tag rather than next/script
 *
 * `next/script` rejects `defer` because it schedules loading itself, and its
 * default strategy waits for hydration. On this site that is the wrong trade:
 * the pages are prerendered and ship almost no JavaScript, so a reader can
 * arrive, read and leave before hydration ever happens - and their visit would
 * go uncounted. `defer` fires when the document has parsed, which is both
 * earlier and not dependent on React at all.
 *
 * Rendering nothing when unconfigured is the whole safety mechanism: local
 * development and preview deploys have no variables set, so they contribute no
 * pageviews without anyone having to remember to disable anything.
 *
 * See lib/analytics for why the vendor is a variable rather than a decision
 * baked in here.
 */
export function Analytics() {
  const config = analyticsConfig()
  if (!config) return null

  return (
    <script
      src={config.src}
      defer
      // Plausible reads data-domain, Umami reads data-website-id. Whichever is
      // absent is simply not rendered; neither provider minds the other's.
      data-domain={config.domain ?? undefined}
      data-website-id={config.websiteId ?? undefined}
    />
  )
}
