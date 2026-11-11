'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * The business category chosen on the homepage, shared by the category buttons
 * ("A place for your business") and the enquiry form's select further down, so
 * choosing one updates the other, as in the designer's page.
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

export function BusinessCategories({
  label,
  categories,
}: {
  label: string
  categories: { key: string; label: string; body: string; link: string }[]
}) {
  const { value, set } = useCategory()
  const active = categories.find((category) => category.key === value) ?? categories[0]!
  return (
    <div>
      <div className="vd-biz-categories" role="group" aria-label={label} data-vd-reveal>
        {categories.map((category) => (
          <button
            key={category.key}
            type="button"
            aria-pressed={category.key === active.key}
            onClick={() => set(category.key)}
          >
            {category.label}
          </button>
        ))}
      </div>
      <p className="vd-biz-category-body" aria-live="polite">
        {active.body}
      </p>
      <a className="vd-biz-link" href="#contact">
        {active.link}
      </a>
    </div>
  )
}
