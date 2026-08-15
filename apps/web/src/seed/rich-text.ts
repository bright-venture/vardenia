/**
 * Minimal Lexical document builder.
 *
 * Payload stores rich text as Lexical's editor state, which is a deeply nested
 * JSON shape with a lot of required bookkeeping fields. Writing that out by hand
 * for every fixture paragraph would bury the actual copy, and getting one
 * `version` or `direction` wrong produces a document that saves fine and then
 * renders as nothing.
 *
 * This covers paragraphs of plain text, which is all the seed needs. Anything
 * richer should be authored in the admin.
 */

interface LexicalText {
  type: 'text'
  text: string
  format: number
  style: string
  mode: 'normal'
  detail: number
  version: 1
}

interface LexicalParagraph {
  type: 'paragraph'
  children: LexicalText[]
  format: ''
  indent: 0
  version: 1
  direction: 'ltr'
  textFormat: 0
}

export interface LexicalRoot {
  root: {
    type: 'root'
    children: LexicalParagraph[]
    format: ''
    indent: 0
    version: 1
    direction: 'ltr'
  }
}

function paragraph(text: string): LexicalParagraph {
  return {
    type: 'paragraph',
    children: [{ type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 }],
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    textFormat: 0,
  }
}

/** Build an editor state from one paragraph per string. */
export function richText(paragraphs: string[]): LexicalRoot {
  return {
    root: {
      type: 'root',
      children: paragraphs.map(paragraph),
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
    },
  }
}
