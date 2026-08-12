# Printing the codes

Everything a designer or a member of staff needs to get a code onto paper. The reasoning behind
immutable codes lives in `adr/0002-immutable-qr-codes.md`.

## Getting the artwork

Open any code in the admin under Directory > QR Codes. The edit screen shows the code with two
download links:

- **SVG** for anything printed. Vector, so it scales to any size without going soft.
- **PNG** for slides and email only.

Direct URLs, if you would rather script it:

```
/qr/K3M9QP2                        SVG at the default 25mm
/qr/K3M9QP2?size=40                SVG at 40mm
/qr/K3M9QP2?format=png&size=2048   PNG, 2048px
/qr/K3M9QP2?download=1             forces a save dialog
```

An unknown code returns 404 rather than an image. That is deliberate: a typo in a code should fail
at the point somebody tries to download it, not after 20,000 copies are printed.

## The whole issue at once

```
/qr/sheet             every active code
/qr/sheet?issue=1     just the codes assigned to one print issue
/qr/sheet?size=30     each code at 30mm
```

Staff only, so sign in to the admin panel first. Print it from the browser, or use it on screen to
check every code against the layout before the issue goes to press. Each card shows the business
name, the code, and the URL it resolves to.

## Rules for the layout

**Do not crop the white border.** It is four modules wide on every side and it is part of the code,
not padding. A scanner uses it to find the symbol's edges. This is the single most common reason a
printed code fails, and you cannot tell by looking at it.

**Do not print smaller than 15mm.** The default is 25mm, which is about the smallest that scans
reliably from a phone held over a magazine page. Below 15mm the app refuses to generate.

**Do not recolour or redraw it.** Black on white, at full contrast. Inverted codes, gradients, and
brand-coloured codes all reduce the contrast a camera has to work with, in a lobby that is probably
dimly lit.

**Do not place it across a fold or a gutter.** A code bent through the middle loses the geometry the
scanner aligns on.

Codes are generated at error correction level Q, which recovers around a quarter of a damaged
symbol. That is the budget covering ink spread, varnish, scuffing, and a reader photographing the
page at an angle. Cropping the quiet zone or shrinking the code spends that budget before the
magazine has left the printer.

## Never delete a code

A printed code is permanent. The app refuses to delete a code that has been scanned, assigned to an
issue, or produced as anything other than a digital placement, and it refuses to delete a listing
that owns one.

To retire a code, uncheck **active**. Scans then land on a "this listing has moved" page instead of
a dead end, which is what keeps copies already in circulation from becoming worthless.

Deleting a listing and recreating it mints a **different** code. This happened once during testing
and it is why the protection exists.
