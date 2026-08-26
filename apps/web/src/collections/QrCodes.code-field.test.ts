import { describe, expect, it, vi } from 'vitest'
import { getDefaultValue } from 'payload'
import type { Field, FieldHook, TextField } from 'payload'
import { normalizeCode } from '@vardenia/core'
import { QrCodes } from './QrCodes'

/**
 * The Code field, which is required, read-only, and has to fill itself in.
 *
 * # The bug these exist for
 *
 * Creating a QR code by hand in the admin panel was impossible. Code is
 * `required` and `readOnly`, and nothing minted one for the create form, so the
 * panel showed "This field is required" over a box nobody is allowed to type
 * in. Every code until then had been minted by ensureQrCode from a listing, so
 * the path a person uses had never been walked - and the end-to-end probe that
 * was supposed to catch it created codes over the REST API with `code` already
 * supplied, which sails straight past a readOnly rule that only exists in the UI.
 *
 * So the default is checked through Payload's own `getDefaultValue`, which is
 * the function the admin's form-state builder calls, rather than by calling
 * ours directly and assuming Payload would do the same thing.
 */

const codeField = QrCodes.fields.find(
  (field): field is TextField =>
    'name' in field && (field as Field & { name: string }).name === 'code',
)!

/** A payload stub that says every generated code is free. */
const freePayload = () =>
  ({
    find: vi.fn(async () => ({ docs: [], totalDocs: 0 })),
  }) as never

const req = () => ({ payload: freePayload() }) as never

/**
 * Narrowed once here. `getDefaultValue` will not take `undefined`, and the test
 * directly below is the one that asserts it is really there - so widening its
 * signature to accommodate the absent case would delete that test's point.
 */
const defaultValue = codeField.defaultValue as NonNullable<TextField['defaultValue']>

/** Everything `getDefaultValue` needs except the value under test. */
const resolve = (value: unknown, over: Record<string, unknown> = {}) =>
  getDefaultValue({ defaultValue, locale: 'en', req: req(), user: null, value, ...over } as never)

describe('the Code field', () => {
  it('exists, and is the immutable one', () => {
    expect(codeField).toBeDefined()
    expect(codeField.required, 'a code that can be blank is a code that cannot be printed').toBe(
      true,
    )
    expect(codeField.unique).toBe(true)
    expect(codeField.admin?.readOnly, 'a typed code is a typo waiting to reach a printer').toBe(
      true,
    )
  })

  describe('arriving in the create form', () => {
    it('has a default, or the form cannot be saved at all', () => {
      expect(codeField.defaultValue).toBeTypeOf('function')
    })

    it('mints one through the same resolver the admin form uses', async () => {
      const value = await resolve(undefined)

      expect(value).toBeTypeOf('string')
      expect(normalizeCode(value as string), 'minted a code the reader-facing parser rejects').toBe(
        value,
      )
    })

    it('gives a different one each time the form is opened', async () => {
      expect(await resolve(undefined)).not.toBe(await resolve(undefined))
    })

    /**
     * Payload skips the default entirely when a value is already present. Worth
     * pinning: it is what stops the default from overwriting the code on a
     * document that already has one, and it is why reopening a saved record does
     * not quietly mint a second.
     */
    it('leaves an existing value alone', async () => {
      expect(await resolve('K3M9QP2')).toBe('K3M9QP2')
    })

    it('does not fall over when there is no request to mint from', async () => {
      expect(await resolve(undefined, { req: undefined })).toBeUndefined()
    })
  })

  describe('saving', () => {
    const hook = () => codeField.hooks!.beforeChange![0] as FieldHook
    const run = (args: Record<string, unknown>) => hook()({ req: req(), ...args } as never)

    it('mints one for an API create that supplied none', async () => {
      const value = (await run({ operation: 'create', value: undefined })) as string
      expect(normalizeCode(value)).toBe(value)
    })

    it('keeps a code that was supplied, so seeds stay reproducible', async () => {
      expect(await run({ operation: 'create', value: 'K3M9QP2' })).toBe('K3M9QP2')
    })

    /**
     * The premise of the whole printed product. Twenty thousand copies carry
     * this string and cannot be reissued, so an update may not change it - and
     * the admin's readOnly flag is no defence, because the REST API ignores it.
     */
    it('refuses to change an existing code, whatever the request says', async () => {
      const value = await run({
        operation: 'update',
        value: 'ZZZZZZZ',
        originalDoc: { code: 'K3M9QP2' },
      })

      expect(value, 'a printed code was rewritten').toBe('K3M9QP2')
    })

    it('throws rather than saving a code with no code in it', async () => {
      const exhausted = {
        payload: { find: vi.fn(async () => ({ docs: [{}], totalDocs: 1 })) },
      } as never

      await expect(
        hook()({ req: exhausted, operation: 'create', value: undefined } as never),
      ).rejects.toThrow(/could not allocate/i)
    })
  })
})
