/**
 * Whether listings show where they are: the area under a card and above a
 * listing's name ("Food & drink · Chouf"), the address, "View on map" and the
 * "Get directions" button.
 *
 * Off since 6 November 2026, at the owner's request, until the locations are
 * checked. Every address the catalogue held was only an area (Zahle,
 * Ashrafieh, Jiyeh), and with no coordinates on any listing the map links were
 * a Google search for the name and that area, which is not something to send a
 * reader to unchecked.
 *
 * Only the display is off. Each listing keeps its governorate and district, so
 * the directory's area filters, "nearby" suggestions and the structured data
 * for search engines go on working. The addresses themselves were emptied in
 * the database the same day, with a backup in backups/addresses.
 *
 * To show locations again, set this to true.
 */
export const SHOW_LOCATION = false
