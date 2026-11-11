'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * The business category chosen in the homepage enquiry form. It was shared with
 * the category buttons of "A place for your business" until that section was
 * removed (11 November 2026); the form still reads it from here.
 */
const Category = createContext<{ value: string; set: (value: string) => void }>({
  value: '',
  set: () => {},
})

export function CategoryProvider({ initial, children }: { initial: string; children: ReactNode }) {
  const [value, set] = useState(initial)
  return <Category.Provider value={{ value, set }}>{children}</Category.Provider>
}

export const useCategory = () => useContext(Category)
