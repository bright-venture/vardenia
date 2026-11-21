import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { roomLabel, type RoomsTranslator } from './room-labels'

const rooms = (locale: 'fr' | 'en' | 'ar'): RoomsTranslator =>
  createTranslator({
    locale,
    messages: getMessages(locale),
    namespace: 'rooms',
  }) as unknown as RoomsTranslator

describe('roomLabel', () => {
  it('uses the translated message where one exists', () => {
    expect(roomLabel(rooms('fr'), 'views', 'sea', 'fr')).toBe('Vue mer')
  })

  it('falls back to the core label for a slug with no message', () => {
    const t = rooms('fr')
    expect(t.has('amenities.hairdryer')).toBe(false)
    expect(roomLabel(t, 'amenities', 'hairdryer', 'fr')).toBe('Hairdryer')
    expect(roomLabel(rooms('ar'), 'amenities', 'hairdryer', 'ar')).toBe('مجفف شعر')
  })
})
