import type { LegalDocument } from './legal'
import { TBD, contactEmail, contactPostal } from './placeholder'

/**
 * The standing pages: About, Contact, FAQ, and the three that sell a listing.
 *
 * # Why these matter more than they look
 *
 * A restaurant owner sees the magazine, wants to be in the next issue, and goes
 * looking for how. Until now that ended in a 404. The partner sign-in exists for
 * businesses already sold to; there was nothing at all for the ones selling
 * themselves to us, which is the top of the revenue funnel.
 *
 * # In code, like the legal documents
 *
 * The Pages collection that used to hold standing pages is gone. It could come
 * back, and for marketing copy there is a real argument for it - somebody in the
 * team will want to reword this without waiting for a deploy.
 *
 * Code for now, for one reason: this copy makes commitments. What a listing
 * includes, what verification means, how long a code lasts. Those are promises
 * that should change through a reviewed diff, the same as the terms they sit
 * next to, and the version live on a given day should be recoverable from git
 * when somebody disputes what they were sold. Revisit when the copy settles and
 * the changes become cosmetic.
 *
 * # Unsettled facts are marked, not invented
 *
 * Same `TO CONFIRM` marker as the legal documents, rendered as a block that
 * cannot be mistaken for body text. Prices, print deadlines and the contact
 * address are not mine to make up, and a plausible invented number on a sales
 * page is worse than a visible gap.
 */

export type ContentPage = LegalDocument

/** Every standing page, keyed by its URL segment. */
export const CONTENT_PAGES = {
  about: aboutPage,
  contact: contactPage,
  faq: faqPage,
  'partner-with-us': partnerWithUsPage,
  advertise: advertisePage,
  'add-your-business': addYourBusinessPage,
} as const

export type ContentPageSlug = keyof typeof CONTENT_PAGES

export const CONTENT_PAGE_SLUGS = Object.keys(CONTENT_PAGES) as ContentPageSlug[]

export function contentPage(slug: string): ContentPage | null {
  const build = CONTENT_PAGES[slug as ContentPageSlug]
  return build ? build() : null
}

// --------------------------------------------------------------------- about

export function aboutPage(): ContentPage {
  return {
    title: 'About Vardenia',
    intro:
      'Vardenia is a printed magazine and an online directory of places worth going in Lebanon. The two are one product: what is in the magazine is on the site, and every listing in print carries a code that opens it.',
    sections: [
      {
        heading: 'Why print, in 2026',
        body: [
          'Because a magazine sits on a hotel reception desk for a year, and a search result lasts as long as the next scroll. A visitor who has just landed, has no local recommendations and does not know what to search for is better served by something they can pick up.',
          'The code on each listing closes the gap. Point a phone at it and the page opens, current, with the hours as they are today rather than as they were when the issue printed.',
          'That is also why a code, once printed, is permanent. A listing can change everything about itself and the code still resolves. If a business leaves us, the code explains what happened rather than failing.',
        ],
      },
      {
        heading: 'Curated, not crowdsourced',
        body: [
          'Nobody can add themselves to Vardenia. Every listing is entered by our team, and businesses cannot publish or edit their own pages.',
          'That is slower and it is the point. A directory anybody can write themselves into is a directory of whoever is most persistent, and it is worth nothing to a reader deciding where to spend an evening.',
          '- **Verified** listings have had their details confirmed with the business directly.',
          '- Bookings are answered by the venue, not by us. We pass the request on and tell you what they said.',
          '- We do not take a commission on a booking, and a business cannot pay to be ranked above another in a way that is hidden from you.',
        ],
      },
      {
        heading: 'Who we are',
        body: [
          TBD('the registered legal entity, its company number and its registered address'),
          TBD('who runs Vardenia, and a sentence about why they started it'),
        ],
      },
    ],
  }
}

// ------------------------------------------------------------------- contact

export function contactPage(): ContentPage {
  return {
    title: 'Contact',
    intro:
      'For anything about a booking, a listing, or the magazine. We read everything that comes in and answer in the order it arrives.',
    sections: [
      {
        heading: 'If it is about a booking',
        body: [
          'Quote the reference from your confirmation email. It looks like **5N9DA470** and it is the fastest way for us to find the reservation.',
          'A booking is held by the venue rather than by us, so if the date is close it is worth calling them directly. Their number is on their listing page.',
        ],
      },
      {
        heading: 'If you are a business',
        body: [
          'To be listed, see **Add your business**. To advertise in the magazine, see **Advertise with us**.',
          'If you already have a partner account and cannot sign in, say so here and we will sort it out rather than sending you round a reset loop.',
        ],
      },
      {
        heading: 'How to reach us',
        body: [
          contactEmail(),
          contactPostal(),
          TBD('the hours somebody is reading this, and how quickly we aim to reply'),
        ],
      },
    ],
  }
}

// ----------------------------------------------------------------------- faq

export function faqPage(): ContentPage {
  return {
    title: 'Questions',
    intro: 'The things people ask most often, answered plainly.',
    sections: [
      {
        heading: 'Is Vardenia free to use?',
        body: [
          'Yes. Reading the site, browsing listings, making a booking and reading the magazine online all cost nothing, and none of it requires an account.',
          'An account is only worth having if you want your bookings kept in one place.',
        ],
      },
      {
        heading: 'Do I need an account to book?',
        body: [
          'No. A booking can be made with a name, an email address and a phone number.',
          'If you later open an account with the same email address, the bookings you already made are there waiting.',
        ],
      },
      {
        heading: 'Is my booking confirmed straight away?',
        body: [
          'It depends on the venue. Some confirm immediately; others want to look at the book first, and those arrive as a request.',
          'Either way you are told by email what happened, and the listing says which kind it is before you send anything.',
        ],
      },
      {
        heading: 'I scanned a code and the listing had moved',
        body: [
          'That means the business is no longer with us, or the listing was withdrawn after the issue printed. The code still works and always will; it just explains itself instead of opening a page that is no longer true.',
          'The page it lands on offers the rest of the directory, which is usually what you wanted anyway.',
        ],
      },
      {
        heading: 'How do I get my business listed?',
        body: [
          'See **Add your business**. Nobody can add themselves, so it starts with a message.',
        ],
      },
      {
        heading: 'Can I have my data deleted?',
        body: [
          'Yes, and you can do it yourself from your account without asking us. Everything identifying is removed.',
          "Bookings that already happened stay on the venue's record with nothing personal on them, because a reservation is their business record as much as yours.",
        ],
      },
      {
        heading: 'Is the site available in Arabic?',
        body: [
          'Yes. Every page has an Arabic version, and the language switcher is in the header.',
          'The legal documents are in English only for now: a machine translation of a contract reads as authoritative and is not.',
        ],
      },
    ],
  }
}

// ---------------------------------------------------------- partner with us

export function partnerWithUsPage(): ContentPage {
  return {
    title: 'Partner with us',
    intro:
      'A Vardenia listing puts a business in front of people who are deciding where to go, in print and online, with one code connecting the two.',
    sections: [
      {
        heading: 'What a listing is',
        body: [
          '- A page on the site with photographs, hours, location, and everything a visitor needs before they decide.',
          '- A printed entry in the magazine, carrying a code that opens that page.',
          '- A code that never expires. It keeps working for the life of the issue and beyond, and it follows the listing if anything about the business changes.',
          '- Bookings, if the business takes them, answered from a dashboard rather than from a phone that rings during service.',
        ],
      },
      {
        heading: 'What it is not',
        body: [
          'It is not an advertising slot dressed as editorial. Listings are marked, and a reader can tell a listing from an article.',
          'We do not take a commission on bookings. What a business is paid for a table is what it keeps.',
          'A listing cannot be bought into a place it does not belong. A restaurant is under Eat & Drink whether or not it pays more than the one next to it.',
        ],
      },
      {
        heading: 'What it costs',
        body: [
          TBD('the tiers, what each includes, and the price of each'),
          TBD('the contract length, and what happens at renewal'),
          TBD('the print deadline for the next issue'),
        ],
      },
      {
        heading: 'How to start',
        body: [
          'Send us the business name, where it is, and a sentence about it. We will come back to you about whether it is right for the directory and what it would involve.',
          contactEmail(),
          'Or see **Add your business** for what to send.',
        ],
      },
    ],
  }
}

// ------------------------------------------------------------------ advertise

export function advertisePage(): ContentPage {
  return {
    title: 'Advertise with us',
    intro:
      'Advertising in Vardenia is separate from being listed. A listing describes a place; an advertisement is space in the magazine.',
    sections: [
      {
        heading: 'Who reads it',
        body: [
          TBD('the print run, where issues are distributed, and who picks them up'),
          TBD('the audience, in whatever terms we can actually support with evidence'),
        ],
      },
      {
        heading: 'What is available',
        body: [
          TBD('the ad formats and sizes, and the price of each'),
          TBD('artwork specifications and the deadline for supplying them'),
          TBD('whether we offer any placement on the website, and if so what'),
        ],
      },
      {
        heading: 'What we will not do',
        body: [
          'Advertising is marked as advertising. We do not write an article about a business because it bought a page, and we do not let an advertiser choose what the editorial says.',
          'That rule costs us money occasionally and it is the reason the magazine is worth reading.',
        ],
      },
      {
        heading: 'Get in touch',
        body: ['Tell us what you have in mind and we will send the current rates.', contactEmail()],
      },
    ],
  }
}

// ----------------------------------------------------- add your business

export function addYourBusinessPage(): ContentPage {
  return {
    title: 'Add your business',
    intro:
      'Every listing in Vardenia is entered by our team, so this starts with a conversation rather than a form that publishes itself.',
    sections: [
      {
        heading: 'What to send',
        body: [
          '- The name of the business and where it is.',
          '- What it is: a hotel, a restaurant, a wedding venue, a clinic, a car service.',
          "- A sentence or two about what makes it worth a visitor's evening.",
          '- A website or a social account, if there is one.',
          '- Whether you would want to take bookings through Vardenia.',
        ],
      },
      {
        heading: 'What happens next',
        body: [
          contactEmail(),
          'We look at every business that gets in touch. If it is right for the directory we will come back to you with what a listing involves and what it costs.',
          'If it is not, we will say so plainly rather than leaving you waiting. A directory is only worth something to a reader if some things are left out.',
          TBD('how long we aim to take to reply'),
        ],
      },
      {
        heading: 'If you are already listed',
        body: [
          'To correct something on an existing listing, or to add photographs, get in touch and we will update it. Businesses cannot edit their own pages.',
          'To answer bookings, sign in at **For partners**. If you have not been given an account and you want one, say so.',
        ],
      },
    ],
  }
}
