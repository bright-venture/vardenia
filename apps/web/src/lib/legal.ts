import { PLACEHOLDER, TBD, contactEmail } from './placeholder'
import { CONTACT } from './contact'

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
export const LEGAL_LAST_UPDATED = '2026-11-09'

/**
 * Who runs the site, as both documents state it.
 *
 * The legal name and registered office were given by the owner on 6 November
 * 2026, and the commercial registration number on 9 November 2026.
 */
export const COMMERCIAL_REGISTRATION_NUMBER = '1036217'

const whoRunsIt = (): string[] => [
  CONTACT.postalAddress
    ? `The site is run by Vardenia, whose registered office is at ${CONTACT.postalAddress}.`
    : TBD('the registered office address of Vardenia, which runs the site'),
  `Vardenia's commercial registration number is ${COMMERCIAL_REGISTRATION_NUMBER}.`,
]

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
          ...whoRunsIt(),
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
          '- **After your visit**: we email you to ask whether you went, and roughly what you spent. We keep your answer and the amount with the booking.',
          '- **If you send a receipt**: the photo or PDF of the bill, the total and currency you confirm, and what was read from it automatically (the total, the receipt number, the date printed on it, and whether the name of the place appears). A receipt can show more than the total, such as what you ordered, a name, or the last digits of a card, so please cover anything you would rather we did not see before you send it.',
          '- **If you write a review**: what you wrote, your rating, and the first name and initial it is shown with.',
          '- **Your passport and saved places**: the places you have visited through a booking, which earn a stamp, and the places you have saved.',
          '- **If you scan a printed code**: the code, the time, your city and country, and whether you were on a phone or a computer. We do not record your precise location, and we do not store your IP address at all - it is hashed in memory to spot repeated scans and never written down.',
          '- **If something breaks**: a record of the error, with email addresses, passwords and access tokens automatically removed before it is stored.',
          '- **When you read any page**: which pages were visited, which site the visit came from, the country it came from, and whether it was a phone or a computer. This is measured for us by an analytics provider, it sets no cookie, and it is counted rather than tied to you.',
          '- **Every visit** passes through the network that protects the site from attacks, which, like any network, sees the address you connect from. When you open an account, it also checks that you are a person rather than a program.',
          /**
           * The network provider's own page-speed measurement (Cloudflare Web
           * Analytics, "Real User Measurements"), which the owner chose on 6
           * November 2026 to keep for its speed figures. It is set in the
           * Cloudflare dashboard to leave out visitors in the EU, and it sets
           * no cookie. If that setting changes, so must this line.
           */
          '- **How fast pages load**: for visitors outside the European Union, the network that carries the site also measures how quickly each page loads and responds, which page it was, and the browser and country, and counts the visit. It sets no cookie and is not tied to you.',
          'We use no advertising trackers, we do not build a profile of you, and nothing here follows you to another site.',
        ],
      },

      {
        heading: 'A note about the booking notes field',
        body: [
          'The notes box on a booking form is where you can tell the place about a dietary need, an anniversary, or an accessibility need such as a wheelchair. Some of that is health information, which Lebanese law (Law No. 81 of 2018 on electronic transactions and personal data, Article 91) lets us handle only with your explicit agreement.',
          '- **It is optional.** Leave it blank and your booking request is exactly the same. You can always tell the place in person instead.',
          '- **If you write in it, you tick a box to agree** that Vardenia and the place may use what you wrote, including any health information, only to arrange that visit. The box is never ticked for you, and notes are not sent without it.',
          '- **Who receives it.** The place you are booking with, and the Vardenia team. Nobody else.',
          '- **How long it is kept.** With the booking, for 12 months after the visit.',
          '- **Your rights.** You can ask us to show you what you wrote, to correct it, or to delete it.',
          'Please only write what you are comfortable sharing with that place.',
        ],
      },

      {
        heading: 'Your answer after a visit, and your receipt',
        body: [
          'Businesses listed on Vardenia pay us a commission on what their guests spend on visits booked through the site. Your visit costs you nothing extra: you pay the business as usual, and Vardenia charges you nothing.',
          'That is why we ask whether you went, and roughly what you spent, and why you can send us the receipt. They let us check that a business is billed fairly, and settle it when the business and you remember the visit differently. Answering is up to you, and so is sending a receipt.',
          '- **Who sees the receipt.** You, and the Vardenia team. The business never sees the photo. It sees only the amount it was billed on, and that it came from a receipt.',
          '- **Reading it automatically.** When you choose the photo, the total, the receipt number, the date and the name of the place can be read from it by an automated service, so you only have to check the figure. You can always correct the total before sending, and nothing is decided about you from it.',
          '- **Each receipt counts once.** The receipt number is read so that the same receipt cannot be sent twice for the same place. A receipt that has already been sent is refused.',
          '- **Who sees your answer.** The Vardenia team. If it disagrees with what the business recorded, we may tell the business that the visit is disputed while we look into it.',
          '- **How long it is kept.** The receipt, what was read from it, and your answer are kept for 12 months after the visit.',
        ],
      },

      {
        heading: 'Why we are allowed to hold it',
        body: [
          '- **To do what you asked.** Making a booking, running your account, and sending you the confirmation are all part of the arrangement between us.',
          '- **To run the business.** Counting scans of a printed code tells an advertiser whether their placement worked, and your answer after a visit and your receipt tell us what a business owes. Scan figures are aggregated and never identify a reader.',
          '- **To keep the site working and safe.** Rate limiting, spotting automated abuse, and recording errors.',
        ],
      },

      {
        heading: 'Who else sees it',
        body: [
          '- **The business you book with** sees your name, your phone number if you gave one, the details of the booking and your notes. They need those to hold your table and to call you if something changes. They do not see your email address, your receipt or your answer after the visit.',
          '- **Everyone who reads the site** sees a review once we publish it, with your first name and initial, never your full name or anything else about you.',
          /**
           * Described by what they do, not named. The owner decided on 6
           * November 2026 that the pages do not name the suppliers. The list of
           * names is kept in this comment so a request for it can be answered:
           * Supabase (database, files), Netlify (hosting), Cloudflare (network,
           * sign-up check), Resend (email), Umami (page visits) and Anthropic
           * (reading receipts).
           */
          '- **Our suppliers**, who process data on our behalf and are not allowed to use it for anything else: our database and file storage host, our website host, the network that protects the site and measures how fast it loads, the service that sends our email, the service that counts page visits, and the service that reads receipts. You can ask us who they are.',
          "We do not sell your information, and we do not share it for anyone else's marketing.",
        ],
      },

      {
        heading: 'Where it is kept',
        body: [
          /**
           * The visit counter is Umami's general cloud (cloud.umami.is), not its
           * EU region, and Umami lists its analytics database as "USA/EU"
           * without saying which. Checked with the owner on 9 November 2026, so
           * the figures are no longer said to stay in the EU. If the site moves
           * to an EU-only address, this can say so again.
           */
          'Our database and the receipt files are hosted in the European Union, in Frankfurt. Our website host, our network provider, our email provider and the service that counts page visits may process data outside it, and a receipt read automatically is read in the United States.',
          'Our database host keeps a daily backup for seven days. Each week we also keep a full copy of the database and of every photo and receipt on a computer we control, outside the European Union, so that nothing is lost if a supplier fails.',
          /**
           * Settled with the owner on 9 November 2026. The weekly copy is
           * encrypted as it is written (backup/crypto.ts) and the private key
           * that opens it is held by Vardenia alone. The sentence says who holds
           * the key, not where: the owner chose to keep it on the backup
           * computer, in its own folder (backups/README.md).
           */
          "When data leaves the European Union, we rely on the EU-US Data Privacy Framework where the supplier is certified under it, and otherwise on the European Commission's standard contractual clauses in our agreement with that supplier.",
          'Our weekly copy is encrypted before it is stored, and only Vardenia holds the key that opens it.',
        ],
      },

      {
        heading: 'How long we keep it',
        body: [
          'Only as long as it is needed for the reason we hold it.',
          '- **Bookings**, including your notes: 12 months after the visit.',
          '- **Receipts**, what was read from them, and your answer after a visit: 12 months after the visit.',
          '- **Records of printed-code scans**: 12 months.',
          '- **Error records**: 90 days.',
          '- **Your account**: until you close it.',
          '- **Reviews**: while they are published, or until you ask us to take one down.',
          /**
           * Ten years: the period Lebanese commercial and tax law sets for a
           * business's accounting records, settled by the owner on 9 November
           * 2026. A bill line holds the booking reference, the day and the
           * amounts (collections/Statements), never a guest's name, so keeping
           * bills this long keeps nothing personal beyond the booking's own
           * 12 months.
           */
          "- **Monthly bills to businesses**: ten years, as Lebanese law requires for a business's accounting records. A bill lists each visit by its booking reference, date and amount, never by a guest's name.",
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
          'Two small cookies, and only once you sign in. One keeps you signed in; the other only tells the page to show your account link instead of Sign in. Neither is used to track you, neither is shared, and there is no advertising or analytics cookie on this site.',
          'That last part is deliberate. We do count page visits, and we chose a provider that needs no cookie to do it, so measuring how the site is read costs you nothing and asks you nothing.',
          'Because both are strictly necessary to provide something you asked for, there is no consent banner. If we ever add anything that is not strictly necessary, there will be.',
          /**
           * Checked on 6 November 2026 against the live site: no page sent a
           * Set-Cookie header, document.cookie stayed empty on the sign-up page
           * with its check drawn, and neither Cloudflare's check script nor its
           * frame set one. It holds while Bot Fight Mode stays off (it sets
           * `__cf_bm`); turning that, or a challenge rule, back on means naming
           * Cloudflare's cookie here.
           */
          'The network that carries every visit, and runs the check on the sign-up form, sets no cookie on this site either.',
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
      'These terms cover using the Vardenia website, opening an account, requesting a booking, and what you send us afterwards: your answer about the visit, a receipt, or a review. Please read the section on bookings in particular, because it explains who your arrangement is actually with.',

    sections: [
      {
        heading: 'Who we are',
        body: [
          'Vardenia publishes a printed magazine and an online directory of places in Lebanon.',
          ...whoRunsIt(),
        ],
      },

      {
        heading: 'What Vardenia is, and is not',
        body: [
          'We are a guide. We choose every place that appears here, and we write about them ourselves. A business cannot edit what we say about it.',
          'We are not the hotel, the restaurant, or the venue. We do not own them, run them, or supervise them, and we cannot guarantee your experience of them.',
        ],
      },

      {
        heading: 'How places are listed and ordered',
        body: [
          'Every place here is one we chose. Paying does not get a place in: a place we have chosen then pays Vardenia to be listed, at one of three levels: bronze, a listing on the website; silver, which adds a page in the printed magazine; and gold, which adds first place in every list and a place on the home page.',
          '- **The order of a list reflects that level.** Gold places come first, then silver, then bronze, and places at the same level are in alphabetical order. A place higher in a list has paid for a higher level; it is not ranked as better.',
          '- **The band at the top of the home page** shows gold places. It is paid placement, and is labelled as chosen by the places who back this guide.',
          '- **Every place here has been visited and checked by us in person** before it appears.',
          '- **Places also pay a commission** on what guests spend on visits booked through Vardenia. It does not change what you pay.',
          'The places suggested at the foot of a listing are the nearest ones first, whatever their level.',
        ],
      },

      {
        heading: 'Bookings',
        body: [
          'This is the part worth reading twice.',
          '- **Your booking is with the business, not with us.** We pass your request on and tell you what they say. The arrangement to hold a table is between the two of you.',
          '- **A request is not a reservation.** Some places confirm immediately and some answer by hand. Nothing is held until you receive a confirmation saying so, and a request can be declined.',
          '- **Cancelling.** You can cancel from your account at any time, and the business is told.',
          "- **Fees for a late cancellation or a missed booking** depend on the place. Some places have one and some do not. A fee like that is the place's own policy, between you and them.",
          '- We do not take payment for bookings and do not hold any card details.',
        ],
      },

      {
        heading: 'After your visit: your answer and your receipt',
        body: [
          'After a visit booked through Vardenia, we email you to ask whether you went and roughly what you spent, and you can send us the receipt. Both are up to you.',
          '- **Answer honestly.** Your answer is how we check what the business is billed, so please only say you went if you did. Your first answer is final, and you can give it for 30 days after the visit.',
          '- **Send only your own receipt, and the real one.** It must be the bill for that visit. When you choose the photo, the total may be read from it automatically; check the figure before you send it, and correct it if it is wrong.',
          "- **Disagreements.** If your account of the visit and the business's differ, the Vardenia team looks at both, and at the receipt if there is one, and decides. We may ask either of you about it.",
          'We may refuse, or stop counting, a receipt or an answer that looks false, and suspend an account that sends them.',
        ],
      },

      {
        heading: 'Your passport',
        body: [
          'Each visit you made through a booking, which the business has confirmed, earns a stamp in your Vardenia passport.',
          '- A stamp is a record of the visit, not money or a voucher, and has no cash value.',
          '- A stamp can be removed if the visit turns out not to have happened, for example after a dispute is settled for the business.',
        ],
      },

      {
        heading: 'Reviews',
        body: [
          'You can review a place once a visit you booked through Vardenia is complete.',
          '- **We read every review before it is published**, and may decline one that is not about a real visit, is abusive, or reveals personal information.',
          '- **It is shown with your first name and initial.**',
          '- **By sending it, you allow us** to publish it on the Vardenia website, with the place it is about, for as long as it is published. You can ask us to take it down.',
          '- **It appears on the website only.** We do not print reviews in the magazine or use them in advertising.',
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
          'Please do not make bookings you do not intend to keep, send answers or receipts that are not true, attempt to reach parts of the site that are not yours, scrape the directory, or use the site to break the law or harass anyone.',
          'We may suspend an account that does any of those.',
        ],
      },

      {
        heading: 'If you run a listed business',
        body: [
          'These terms are for readers and guests. A business listed on Vardenia has its own agreement with us, signed on paper or agreed by email, covering its level, the commission, the monthly bill, the time it has to question a visit on it, and the time it has to pay. These terms do not change that agreement.',
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
          /**
           * Drafted on 6 November 2026 for Lebanese law, which the owner chose.
           * The first line is there because the Lebanese Code of Obligations
           * and Contracts does not let a clause exclude liability for fraud or
           * serious fault, and a clause that tried would be void. The exact
           * article was not checked: worth a lawyer's read before it is relied on.
           */
          '- **What we are responsible for.** Nothing in these terms limits our responsibility for fraud or for serious fault on our part.',
          '- **What we are not responsible for.** What a listed place does or fails to do, including a booking it does not honour; a place that has closed, moved or changed its hours since we wrote about it; and the site being unavailable for a time.',
          '- **Where we are responsible**, it is for the direct loss you suffered that could reasonably have been foreseen, and not for indirect loss such as a lost opportunity.',
        ],
      },

      {
        heading: 'Which law applies',
        body: [
          'These terms are governed by Lebanese law, and the Lebanese courts hear any dispute about them.',
          'Before going to court, please write to us. Most disagreements are settled by a message.',
          contactEmail(),
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
