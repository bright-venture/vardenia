'use client'

import { useState } from 'react'
import Image from 'next/image'
import { PhotoPlaceholder } from './PhotoPlaceholder'

/** Preserve the parent's image frame when a real upload cannot be fetched. */
export function ResilientPhoto({
  src,
  alt,
  sizes,
  priority = false,
  className = 'object-cover',
}: {
  src: string
  alt: string
  sizes: string
  priority?: boolean
  className?: string
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  if (failedSource === src) {
    // A missing pixel resource must not erase an informative alternative.
    // Empty-alt card artwork remains decorative, just as before the failure.
    return alt.trim() ? (
      <span role="img" aria-label={alt} className="absolute inset-0">
        <PhotoPlaceholder />
      </span>
    ) : (
      <PhotoPlaceholder />
    )
  }

  return (
    <Image
      key={src}
      data-vd-photo
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      onError={() => setFailedSource(src)}
    />
  )
}
