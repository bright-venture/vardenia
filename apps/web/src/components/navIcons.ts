import {
  BedDouble,
  BookOpen,
  CarFront,
  CircleHelp,
  FileText,
  Handshake,
  Heart,
  Info,
  LogIn,
  Mail,
  Megaphone,
  Mountain,
  Newspaper,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Store,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { CategorySlug } from '@vardenia/core'

/**
 * The icon for each section, resolved from a name to a component.
 *
 * The taxonomy has carried a lucide icon name on every category since it was
 * written - `bed-double`, `utensils`, `mountain-snow` - with nothing installed
 * to render them. This finishes that thought rather than inventing a second set.
 *
 * A `Record<CategorySlug, ...>` for the same reason the section map is one: an
 * eighth category fails the build here instead of rendering a hole in the menu.
 *
 * Only the icons actually used are imported. lucide-react has well over a
 * thousand, and a namespace import pulls the lot into the bundle.
 */
export const SECTION_ICONS: Record<CategorySlug, LucideIcon> = {
  hospitality: BedDouble,
  'food-and-beverage': Utensils,
  tourism: Mountain,
  weddings: Heart,
  lifestyle: Sparkles,
  healthcare: Stethoscope,
  transportation: CarFront,
}

/** The handful used outside the section list, by the header and the footer. */
export const MAGAZINE_ICON = Newspaper
export const SEARCH_ICON = Search
export const CONTACT_ICON = Mail
export const BUSINESS_ICON = Store
export const ISSUE_ICON = BookOpen
export const ARTICLE_ICON = FileText
export const ABOUT_ICON = Info
export const HELP_ICON = CircleHelp
export const PARTNER_ICON = Handshake
export const ADVERTISE_ICON = Megaphone
export const SIGN_IN_ICON = LogIn
export const PRIVACY_ICON = ShieldCheck
export const TERMS_ICON = Scale
