import { PLACEHOLDER, TBD, contactEmail } from './placeholder'

/**
 * The privacy policy and terms, as content rather than markup.
 *
 * # These are drafts, and they are not a lawyer
 *
 * Everything here is written from what the code actually does - which is the
 * part a lawyer cannot supply and would otherwise have to interview us for - but
 * the legal judgements in it are not ours to make. Anything wrapped in
 * `TO CONFIRM` is a decision or a fact nobody has established yet, and those
 * render in a way that is impossible to miss on the page precisely so that a
 * half-finished document cannot quietly go live.
 *
 * Read `pendingDecisions()` before publishing. It lists what is still open.
 *
 * # In code rather than in the CMS
 *
 * The Pages collection that used to hold standing pages is gone, and the footer
 * comment noted these would have to come back "either the collection again, or
 * routes written in code". Code, for two reasons: legal text should change
 * through a reviewed diff rather than a text box, and the version that was live
 * on a given day is then recoverable from git, which is the question that
 * actually gets asked when somebody disputes what they agreed to.
 *
 * # English governs
 *
 * The site is bilingual and these are not, yet. A machine translation of a legal
 * document reads as authoritative and is not, and an Arabic reader is better
 * served by a clear note than by text nobody has checked. The Arabic pages say
 * so and link here.
 */

export interface LegalSection {
  heading: string
  /** Paragraphs. A string starting with "- " renders as a list item. */
  body: string[]
}

export interface LegalDocument {
  title: string
  intro: string
  sections: LegalSection[]
}

/**
 * Shown on both documents.
 *
 * Set by hand rather than from the file's git date: what matters to a reader is
 * when the *meaning* last changed, not when somebody fixed a typo.
 */
export const LEGAL_LAST_UPDATED = '2026-08-20'

/**
 * The marker and the contact details both live in lib/placeholder now, so the
 * marketing pages can use the same ones without importing a legal document.
 * Re-exported because this module's readers already import PLACEHOLDER from it.
 */
export { PLACEHOLDER } from './placeholder'

/**
 * Everything still open, so it can be listed in one place rather than found by
 * reading both documents.
 */
export function pendingDecisions(): string[] {
  return [...privacyPolicy().sections, ...termsOfService().sections]
    .flatMap((section) => section.body)
    .filter((line) => line.includes(PLACEHOLDER))
    .map((line) => line.replace(/^- /, '').trim())
}

export function privacyPolicy(): LegalDocument {
  return {
    title: 'Privacy Policy',
    intro:
      'This policy explains what Vardenia collects about you, why, and what you can ask us to do about it. It describes the site as it actually works rather than as a general statement of intent.',

    sections: [
      {
        heading: 'Who we are',
        body: [
          /**
           * Two lines rather than one sentence with the placeholder inside it.
           *
           * What Vardenia is happens to be settled, and sharing a line with an
           * unsettled clause dragged it into the warning block - so the page
           * flagged a plain true statement as doubtful, which is the opposite of
           * what that component is for. Splitting them lets groupLines put the
           * settled half in body text and the open question in its own block.
           */
          'Vardenia is a printed magazine and an online directory of places in Lebanon.',
          `${TBD('the registered legal entity, its company number and its registered address')}.`,
          'If you want to ask about anything in this policy, get in touch.',
          contactEmail(),
        ],
      },

      {
        heading: 'What we collect',
        body: [
          'Only what the site needs to do the things you ask it to.',
          '- **If you open an account**: your name, your email address, and a phone number if you choose to give one. Your password is stored only as a hash and cannot be read by us or recovered.',
          '- **If you make a booking**: the date and time, how many people, and anything you write in the notes field. We also keep a reference number so you and the business can identify the booking later.',
          '- **If you scan a printed code**: the code, the time, your city and country, and whether you were on a phone or a computer. We do not record your precise location, and we do not store your IP address at all - it is hashed in memory to spot repeated scans and never written down.',
          '- **If something breaks**: a record of the error, with email addresses, passwords and access tokens automatically removed before it is stored.',
          '- **When you read any page**: which pages were visited, which site the visit came from, the country it came from, and whether it was a phone or a computer. This is measured for us by an analytics provider, it sets no cookie, and it is counted rather than tied to you.',
          'We use no advertising trackers, we do not build a profile of you, and nothing here follows you to another site.',
        ],
      },

      {
        heading: 'A note about the booking notes field',
        body: [
          'The notes box on a booking form invites you to tell the business about a dietary requirement, an anniversary, or an accessibility need. Some of that is health information, which the law treats as more sensitive than the rest.',
          'We pass whatever you write to the business you are booking with, because that is the point of the field, and we keep it with the booking. Please only write what you are comfortable sharing with that business, and leave it blank if you would rather tell them in person.',
          TBD(
            'whether an explicit consent tick is needed on the booking form for health-related notes, or whether the field should be relabelled to discourage them - a question for a lawyer, since this is special category data under GDPR Article 9',
          ),
        ],
      },

      {
        heading: 'Why we are allowed to hold it',
        body: [
          '- **To do what you asked.** Making a booking, running your account, and sending you the confirmation are all part of the arrangement between us.',
          '- **To run the business.** Counting scans of a printed code tells an advertiser whether their placement worked. Those figures are aggregated and never identify a reader.',
          '- **To keep the site working and safe.** Rate limiting, spotting automated abuse, and recording errors.',
        ],
      },

      {
        heading: 'Who else sees it',
        body: [
          '- **The business you book with** sees your name, your phone number if you gave one, the details of the booking and your notes. They need those to hold your table and to call you if something changes. They do not see your email address.',
          '- **Our suppliers**, who process data on our behalf and are not allowed to use it for anything else: our database and file storage host, our website host, the service that sends our email, and the service that counts page visits.',
          `- ${TBD('naming those suppliers explicitly, which is generally expected - currently Supabase for the database, Netlify for hosting, Resend for email, and Umami for analytics')}.`,
          "We do not sell your information, and we do not share it for anyone else's marketing.",
        ],
      },

      {
        heading: 'Where it is kept',
        body: [
          'Our database is hosted in the European Union, in Frankfurt, and our page-visit figures are held in the European Union too. Our website host and our email provider may process data outside it.',
          TBD(
            'the transfer mechanism relied on for suppliers outside the EU, and whether a full record of processing activities is needed',
          ),
        ],
      },

      {
        heading: 'How long we keep it',
        body: [
          'Bookings are kept as a record of what was agreed, because that is what a disagreement about a missed reservation is settled from.',
          TBD(
            'actual retention periods - a proposal to review: bookings for 24 months after the date, accounts until you close them, scan records for 24 months, error records for 90 days. None of these is enforced in the software yet',
          ),
        ],
      },

      {
        heading: 'What you can ask for',
        body: [
          'You can ask us for a copy of what we hold about you, to correct it, to delete it, to send it to you in a portable form, or to stop using it in a particular way.',
          'Ask us, and we will answer within one month.',
          contactEmail(),
          'If you are unhappy with how we have handled it, you can complain to your national data protection authority.',
        ],
      },

      {
        heading: 'Cookies',
        body: [
          'One cookie, and only once you sign in. It keeps you signed in and nothing else. It is not used to track you, it is not shared, and there is no advertising or analytics cookie on this site.',
          'That last part is deliberate. We do count page visits, and we chose a provider that needs no cookie to do it, so measuring how the site is read costs you nothing and asks you nothing.',
          'Because that cookie is strictly necessary to provide something you asked for, there is no consent banner. If we ever add anything that is not strictly necessary, there will be.',
        ],
      },

      {
        heading: 'Children',
        body: [
          'Vardenia is not aimed at children and we do not knowingly collect anything about them. If you believe a child has given us information, write to us and we will remove it.',
        ],
      },

      {
        heading: 'Changes',
        body: [
          'If we change this policy in a way that matters, we will say so on this page and update the date at the top. Older versions are recoverable on request.',
        ],
      },
    ],
  }
}

export function termsOfService(): LegalDocument {
  return {
    title: 'Terms of Use',
    intro:
      'These terms cover using the Vardenia website, opening an account, and requesting a booking. Please read the section on bookings in particular, because it explains who your arrangement is actually with.',

    sections: [
      {
        heading: 'Who we are',
        body: [
          `${TBD('the registered legal entity, its company number and its registered address')}.`,
          'Vardenia publishes a printed magazine and an online directory of places in Lebanon.',
        ],
      },

      {
        heading: 'What Vardenia is, and is not',
        body: [
          'We are a guide. We visit and choose the places that appear here, and we write about them ourselves - a business cannot buy an entry or edit its own.',
          'We are not the hotel, the restaurant, or the venue. We do not own them, run them, or supervise them, and we cannot guarantee your experience of them.',
        ],
      },

      {
        heading: 'Bookings',
        body: [
          'This is the part worth reading twice.',
          '- **Your booking is with the business, not with us.** We pass your request on and tell you what they say. The arrangement to hold a table is between the two of you.',
          '- **A request is not a reservation.** Some places confirm immediately and some answer by hand. Nothing is held until you receive a confirmation saying so, and a request can be declined.',
          '- **Cancelling.** You can cancel from your account at any time, and the business is told. If you cancel, the business may have its own policy about late cancellations; that is between you and them.',
          '- We do not take payment for bookings and do not hold any card details.',
          TBD(
            'whether a no-show or late-cancellation fee will ever be charged through Vardenia, which would change this section and the privacy policy substantially',
          ),
        ],
      },

      {
        heading: 'Your account',
        body: [
          'You are responsible for what happens under your account, so please keep your password to yourself and tell us if you think somebody else has it.',
          'Give us accurate details. A booking made under a name or number that is not real is a table a business holds for nobody.',
          'You can ask us to close your account at any time.',
        ],
      },

      {
        heading: 'Using the site fairly',
        body: [
          'Please do not make bookings you do not intend to keep, attempt to reach parts of the site that are not yours, scrape the directory, or use the site to break the law or harass anyone.',
          'We may suspend an account that does any of those.',
        ],
      },

      {
        heading: 'Our content',
        body: [
          'The writing, photography, design and printed material on Vardenia belong to us or to the people we licensed them from. You are welcome to read, share and link to it. You may not republish it commercially without asking.',
          'Business names and logos belong to those businesses.',
        ],
      },

      {
        heading: 'When things go wrong',
        body: [
          'We take reasonable care that the information here is accurate, but opening hours change, kitchens close, and businesses move. We cannot promise the site is always correct or always available.',
          TBD(
            'the limitation of liability clause, which should be drafted rather than adapted from a template',
          ),
        ],
      },

      {
        heading: 'Which law applies',
        body: [
          TBD(
            'the governing law and the courts that would hear a dispute - Lebanon is the obvious answer, but it interacts with the European audience the site is aimed at and should be checked',
          ),
        ],
      },

      {
        heading: 'Changes',
        body: [
          'We may update these terms. If a change matters, we will say so on this page and update the date at the top. Continuing to use the site after that means the new terms apply.',
        ],
      },
    ],
  }
}
