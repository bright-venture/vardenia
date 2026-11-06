import { describe, expect, it } from 'vitest'
import { editionsBucket, editionsPublicBase, mediaPublicBase } from './storage-base'

/**
 * The public addresses of the two public buckets. The site builds file URLs
 * from these and the magazine reader only serves files from them, so they must
 * agree for photos and for magazine PDFs alike.
 */
const supabase = {
  S3_ENDPOINT: 'https://abc.supabase.co/storage/v1/s3',
  S3_BUCKET: 'media',
}

describe('public bucket addresses', () => {
  it('derives both from the S3 endpoint', () => {
    expect(mediaPublicBase(supabase)).toBe('https://abc.supabase.co/storage/v1/object/public/media')
    expect(editionsPublicBase(supabase)).toBe(
      'https://abc.supabase.co/storage/v1/object/public/editions',
    )
  })

  it('uses the override for media, and swaps its bucket for the magazine PDFs', () => {
    const env = { ...supabase, S3_PUBLIC_BASE_URL: 'https://abc.storage.supabase.co/public/media/' }
    expect(mediaPublicBase(env)).toBe('https://abc.storage.supabase.co/public/media')
    expect(editionsPublicBase(env)).toBe('https://abc.storage.supabase.co/public/editions')
  })

  it('takes another name for the magazine PDFs bucket when one is set', () => {
    expect(editionsBucket({ S3_EDITIONS_BUCKET: ' issues ' })).toBe('issues')
    expect(editionsBucket({})).toBe('editions')
  })

  it('gives nothing rather than a guess when it cannot tell', () => {
    expect(editionsPublicBase({})).toBe('')
    expect(editionsPublicBase({ S3_PUBLIC_BASE_URL: 'https://cdn.example.com' })).toBe('')
  })
})
