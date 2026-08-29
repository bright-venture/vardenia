"""
Build the spreadsheet that other people fill in to add listings.

# Why a spreadsheet and not a small app

The people filling this in are not on the team and will not be trained. A form
would need building, hosting, an account each, and a way to save half-finished
work; a spreadsheet is a thing they already know, works offline, and can be
emailed. What a form would have bought is validation, and Excel's own dropdowns
buy most of that at the point where it matters - while they are typing, rather
than in a report afterwards.

The columns are not a design. They are exactly what import/listing-row.ts reads,
because a template that produces a file the importer cannot read is worse than
no template. Anything the importer ignores is marked as such rather than quietly
included, so nobody spends an afternoon filling a column that goes nowhere.

# What this cannot express

The importer hardcodes Mount Lebanon and knows three district headings. A
listing anywhere else needs the importer changed first, so the district list
here is short on purpose rather than by oversight.

Run: python scripts/make-listing-template.py
"""

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = "vardenia-listing-template.xlsx"

# Straight from CATEGORY_BY_HEADING in import/listing-row.ts. Anything not on
# this list is reported as "unknown category" and the row is not imported.
CATEGORIES = [
    "Hotels",
    "Guest Houses",
    "Restaurants",
    "Activities",
    "Tour Guides",
    "Festivals",
]

# From DISTRICT_BY_HEADING. Short because the importer only covers Mount Lebanon.
DISTRICTS = [
    "Keserwan District",
    "Byblos / Jbeil District",
    "Keserwan + Byblos / Jbeil Districts",
]

# seasonalityFrom() looks for these words. Anything else contributes nothing.
SEASONS = ["Year-round", "Summer", "Winter", "Summer and Winter"]

# (header, width, help text, dropdown list or None, required)
COLUMNS = [
    ("Name / Listing", 34, "The business name as it should appear on the site. Nothing else - no town, no phone.", None, True),
    ("Category", 20, "Pick from the list. This decides which section of the site the listing appears in.", CATEGORIES, True),
    ("District", 26, "Pick from the list.", DISTRICTS, True),
    ("Location", 26, "Town or village. Goes on the listing as its address.", None, False),
    ("Type / Activity", 30, "What it is, in a few words. Becomes the listing's tags. Separate several with commas.", None, False),
    ("Hotel Stars", 11, "Hotels only. 1 to 5. Under 4 files the hotel as boutique rather than luxury.", None, False),
    ("Price Range", 16, "Write it with a dollar sign, for example $80 or $80-120. Banded automatically.", None, False),
    ("Rating / 5", 11, "The Google rating, 0 to 5, one decimal. Leave empty if you have not checked.", None, False),
    ("Usually When", 20, "When it is open or worth visiting.", SEASONS, False),
    ("Overview / Description", 60, "A short paragraph. The first sentence becomes the tagline under the name.", None, False),
]

HEADER_FILL = PatternFill("solid", fgColor="1F2937")
HELP_FILL = PatternFill("solid", fgColor="F3F4F6")
REQUIRED_FILL = PatternFill("solid", fgColor="FEF3C7")

book = Workbook()

# --- instructions ----------------------------------------------------------
guide = book.active
guide.title = "Read me first"
guide.column_dimensions["A"].width = 100

GUIDE = [
    ("Vardenia - adding listings", "title"),
    ("", None),
    ("Fill in the Listings tab. One business per row. Do not rename or reorder the columns:", None),
    ("the importer finds them by name and will skip anything it does not recognise.", None),
    ("", None),
    ("The two orange columns are required. A row without them cannot be imported.", None),
    ("Everything else can be left empty and added later.", None),
    ("", None),
    ("Category and District are dropdowns. Use them. A category typed by hand that is not", None),
    ("on the list means the row is rejected, and the list is short because it matches the", None),
    ("sections that exist on the site.", None),
    ("", None),
    ("Only Mount Lebanon for now", "head"),
    ("The importer currently covers Keserwan and Byblos / Jbeil only. A business anywhere", None),
    ("else needs a change to the site first - send it separately rather than inventing a district.", None),
    ("", None),
    ("Photos", "head"),
    ("Do not put photos in this file. Photos go in folders, one folder per business.", None),
    ("After this sheet is filled in, run scripts/make-photo-folders.mjs and it creates the", None),
    ("empty folders for you, named correctly, with a note in each saying what goes inside.", None),
    ("You then drop the photos in and send the whole folder back.", None),
    ("", None),
    ("Inside each folder:", None),
    ("    cover.jpg    the main photo, the one that appears at the top of the listing", None),
    ("    01.jpg       gallery photos, in the order you want them shown", None),
    ("    02.jpg", None),
    ("", None),
    ("Send cover plus one gallery photo unless you have been told otherwise. Listings on the", None),
    ("free tier display one gallery image, so anything beyond that is stored and never seen.", None),
    ("", None),
    ("Photographs must be ones we are allowed to publish. Send the credit and where each", None),
    ("came from with the folder - a photo we cannot show is worse than no photo.", None),
    ("", None),
    ("What happens to what you write", "head"),
    ("Nothing appears on the site automatically. Every listing arrives as a draft and somebody", None),
    ("on the team reads it before it is published.", None),
]

row = 1
for text, kind in GUIDE:
    cell = guide.cell(row=row, column=1, value=text)
    if kind == "title":
        cell.font = Font(size=16, bold=True)
    elif kind == "head":
        cell.font = Font(size=12, bold=True)
    row += 1

# --- the sheet they fill ---------------------------------------------------
sheet = book.create_sheet("Listings")

for index, (header, width, help_text, options, required) in enumerate(COLUMNS, start=1):
    letter = get_column_letter(index)
    sheet.column_dimensions[letter].width = width

    head = sheet.cell(row=1, column=index, value=header)
    head.font = Font(bold=True, color="FFFFFF")
    head.fill = HEADER_FILL
    head.alignment = Alignment(vertical="center", wrap_text=True)

    hint = sheet.cell(row=2, column=index, value=help_text)
    hint.fill = REQUIRED_FILL if required else HELP_FILL
    hint.font = Font(size=9, italic=True, color="374151")
    hint.alignment = Alignment(vertical="top", wrap_text=True)

    if options:
        # A formula-style list rather than a range, so the file stays one sheet
        # they cannot accidentally break by deleting a lookup tab.
        rule = DataValidation(
            type="list",
            formula1='"' + ",".join(options) + '"',
            allow_blank=not required,
            showDropDown=False,
        )
        rule.error = "Pick one of the listed options. Anything else is rejected by the importer."
        rule.errorTitle = "Not an accepted value"
        rule.prompt = "Choose from the list"
        sheet.add_data_validation(rule)
        rule.add(f"{letter}3:{letter}500")

sheet.row_dimensions[1].height = 28
sheet.row_dimensions[2].height = 58
sheet.freeze_panes = "A3"

# One filled row, so the shape is obvious rather than described.
EXAMPLE = [
    "Beit el Qamar",
    "Guest Houses",
    "Keserwan District",
    "Faraya",
    "Guest house, mountain views, breakfast included",
    "",
    "$90-140",
    "4.6",
    "Year-round",
    "A restored stone house above Faraya with six rooms and a terrace looking over the valley.",
]

for index, value in enumerate(EXAMPLE, start=1):
    cell = sheet.cell(row=3, column=index, value=value)
    cell.font = Font(color="9CA3AF", italic=True)
    cell.alignment = Alignment(vertical="top", wrap_text=True)

sheet.cell(row=4, column=1, value="^ example, delete this row").font = Font(
    size=9, italic=True, color="9CA3AF"
)

book.save(OUT)
print(f"wrote {OUT}")
print(f"  {len(COLUMNS)} columns, dropdowns on Category, District, Usually When")
