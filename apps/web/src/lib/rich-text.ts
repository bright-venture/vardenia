/**
 * Plain text to a Lexical editor state, one paragraph per string.
 *
 * A copy of the small builder in seed/rich-text.ts: runtime code must not import
 * from the seed folder. Plain paragraphs only; anything richer is authored in
 * the admin.
 */

interface LexicalParagraph {
  type: 'paragraph'
  children: {
    type: 'text'
    text: string
    format: number
    style: string
    mode: 'normal'
    detail: number
    version: 1
  }[]
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
