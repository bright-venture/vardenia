# Assets retained for the Vardenia redesign

The supplied hero film is the user's existing asset, with an optimized mobile copy.
The following approved photographs are cropped/resized into local responsive WebP
variants. They depict Lebanese places and are not presented as photographs of the
sample hotel/restaurant businesses in the isolated review.

| Photograph     | Creator / licence               | Source                                                                                                                         |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Byblos harbour | Vyacheslav Argenberg, CC BY 4.0 | https://commons.wikimedia.org/wiki/File:The_harbor_in_the_old_city_of_Byblos,_Lebanon.jpg                                      |
| Bsharri        | Vyacheslav Argenberg, CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Bsharri_(Becharre)_village_as_seen_from_the_slopes_of_Mt_Lebanon,_Bsharri,_Lebanon.jpg |
| Raouché        | Vyacheslav Argenberg, CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Pigeon_Rocks_of_Beirut,_Rock_of_Raouche,_Beirut,_Lebanon.jpg                           |
| Baalbek        | Vyacheslav Argenberg, CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Lebanon,_Baalbek,_Temple_of_Jupiter.jpg                                                |
| Tyre           | Vyacheslav Argenberg, CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Port,_Tyre,_Lebanon.jpg                                                                |
| Deir el Qamar  | Patrice Bon, CC0                | https://commons.wikimedia.org/wiki/File:Deir_El-Qamar_mosqu%C3%A9e_Fakhreddine.jpg                                             |

Licences: https://creativecommons.org/licenses/by/4.0/ and
https://creativecommons.org/publicdomain/zero/1.0/ .

Map outline: Natural Earth 1:10m, public domain. Terrain: Lebanon topographical map
by Dr Brains, CC BY-SA 3.0, clipped, desaturated and geographically registered to
the vector outline. Source:
https://commons.wikimedia.org/wiki/File:Lebanon_topographical_map.png .
Licence: https://creativecommons.org/licenses/by-sa/3.0/ . Original relief pixels
remain in `apps/web/public/journey/lebanon-relief-original.png`.
Registration uses its published equirectangular bounds: 34.9°N–32.8°N and
34.8°E–36.9°E. Outline, relief and all city pins use one projection in
`components/journey/map-projection.ts`. The geographic overlay retains CC BY-SA 3.0.

Photographed paper: Brady Erickson / Texturelabs, Paper 214 and Paper 133,
retained under the recorded commercial-use terms:
https://texturelabs.org/textures/paper_214/ ,
https://texturelabs.org/textures/paper_133/ ,
https://texturelabs.org/terms/ .

The visible credits disclosure is at `/#photography-credits`, linked from every
public footer and the independent recovery screens. No new generated imagery or
uncredited remote photographs were introduced in this pass.

Display colour treatment: website photographs share a cinematic SVG grade
(`components/journey/CinematicGrade.tsx`): restrained saturation, cool blacks and
warm highlights. Applied in the site presentation layer; source pixels, content,
place identity and existing source licences are retained. Printed covers, brand
marks, QR symbols, maps and the original film are excluded from the photographic
grade. The homepage credit line identifies the display colour adaptation.

## Physical product illustrations — 16 October

`phone-mockup-v1.webp` and `vardenia-magazine-open-v1.webp`: generated using the built-in image-generation tool. Magazine illustration uses the user's supplied Vardenia PDF pages 6–7 as visual references. Generated miniature print is illustrative. See `MOCKUP_ASSETS.md`. The actual QR is rendered separately as before. Existing photo/map source acknowledgements now live on the footer-linked `/credits` page rather than in a homepage accordion.
