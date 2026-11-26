# Core backend for bookable and listing-only services

Status: approved by the tech lead in conversation, 20 November 2026.
Branch: `core-booking` (from `staging`). Backend only: the website person arranges the UI.

## Intent

Make the backend complete for the three launch services (restaurants, hotels, guest houses)
and the six listing-only services, so every option a business needs can be stored, read
publicly where it should be, and edited by the business owner from the partner dashboard.

## What the tech lead decided

1. **Prices.** Restaurants have no prices. Hotels set a price per room type (today per sale
   option of the room type). Guest houses set a price per night and optional packages. Each
   business adds, changes or removes its own prices. Prices are public.
2. **Address and map link** are shown publicly. The business enters them in its dashboard.
3. **Guest houses are sold as a whole property.** They stop using room types.
4. **Reviews** exist only for bookable services. The customer books, the business marks the
   booking as completed (the customer came), then the customer can review.
5. **Contact details.** Optional public phone, WhatsApp, email and social links, all managed
   by the business. There is **no website field** anywhere.
6. **Restaurant branches.** A partner account has several listings. Each listing is one
   branch with its own map location, hours and reservations. A brand groups them: the
   customer opens the brand, picks a branch, and books on that branch.
7. **Hotels.** Room types stay (no individual rooms). Each room type gets option lists based
   on Booking.com. The hotel also gets facility lists. The business edits them.
8. **Tiers.** bronze = website. silver = website + magazine. gold = + top of its category.
   platinum = + home page. Two admin inputs: maximum gold and maximum platinum (6 each for
   now, changeable).
9. **All missing things are added**, including restaurant seating areas (smoking or not,
   indoor or outdoor) with their own capacity, from the earlier brief.

## Rulings (mine, change on request)

- **Gold cap is per category; platinum cap is global.** Gold means "top of its category", so
  six gold slots in each category; platinum is the home page, so six in total. Both are admin
  settings, default 6.
- **Existing gold listings stay gold** and lose home page placement. Platinum is a new top
  rung above gold in the database enum, so `-tier` sorting puts platinum first.
- **Restaurant `priceRange` ($ to $$$$) is left untouched.** "No price" is applied to money
  fields (room prices, stay pricing, packages). Revisit if the band should go too.
- **Map link.** A pasted Google Maps link is stored and shown; when it carries coordinates
  the map point is filled from it. Short links are not resolved over the network.
- **Booking.com lists** could not be read (the share link returns an empty page). The option
  lists use Booking.com's standard facility names; the lead should confirm them.
- **Partner edits go live immediately** on their own published listing, but only the fields on
  an allow-list; tier, contract, commission, verified, slug, status, QR code and the
  submission group stay staff-only.
- **New branches are drafts.** A partner creates a branch; staff review, set tier and
  contract, and publish. Booking is off on a new branch until staff turn it on.
- **Prices are USD**, as today.
- **Reviews.** The existing rule (completed booking required) stays; the work is to prove it
  holds, refuse reviews on listings that cannot be booked, and cover it with tests.

## Non-goals

- Frontend pages and styling.
- Online payment, deposits, instant confirmation for hotels and guest houses.
- Individual rooms; channel sync; the six coming-soon services' own flows.

## Open for later

- Confirm Booking.com option lists. Decide gold cap per category vs global. Decide whether
  restaurant `priceRange` should be removed.
