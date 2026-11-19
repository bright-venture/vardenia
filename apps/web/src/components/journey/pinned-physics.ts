export interface PinSpring {
  angle: number
  velocity: number
}

/** Degrees relative to the print's resting tilt; stable after a dropped frame. */
export function advancePinSpring(
  state: PinSpring,
  target: number,
  elapsed: number,
  limit = 2,
  stiffness = 32,
): PinSpring {
  let { angle, velocity } = state
  const duration = Math.min(Math.max(elapsed, 0), 0.064)
  const steps = Math.max(1, Math.ceil(duration / (1 / 120)))
  const dt = duration / steps
  for (let i = 0; i < steps; i++) {
    // Gravity pulls a suspended print back towards its resting angle.
    const gravity = Math.sin(((target - angle) * Math.PI) / 180) * (180 / Math.PI) * stiffness
    velocity += (gravity - velocity * 0.8 * Math.sqrt(stiffness)) * dt
    angle += velocity * dt
    if (Math.abs(angle) > limit) {
      angle = Math.sign(angle) * limit
      if (Math.sign(velocity) === Math.sign(angle)) velocity = 0
    }
  }
  return { angle, velocity }
}

/** Smooth resistance preserves the grabbed angle, without a hard stop at the edge. */
export function resistedPinAngle(start: number, delta: number, limit: number): number {
  const ratio = Math.max(-0.999, Math.min(0.999, start / limit))
  return limit * Math.tanh(Math.atanh(ratio) + delta / limit)
}

/** Scroll adds a small impulse; the spring keeps its velocity when direction changes. */
export function mountPinnedPhotos(host: HTMLElement): () => void {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  const prints = [...host.querySelectorAll<HTMLElement>('.vd-pinned-print')]
  const items = prints.map((element, index) => ({
    element,
    visible: false,
    gain: index % 2 ? -0.8 : 1,
    state: { angle: 0, velocity: 0 },
    limit: 2,
    stiffness: Math.max(24, Math.min(58, 32 * (420 / Math.max(240, element.offsetHeight)))),
    lift: { angle: 0, velocity: 0 },
    corner: 0,
    blockClicksUntil: 0,
  }))
  type Item = (typeof items)[number]
  let drag:
    | {
        item: Item
        id: number
        active: boolean
        touch: boolean
        x: number
        y: number
        pivotX: number
        pivotY: number
        start: number
        angle: number
        time: number
        radius: number
      }
    | undefined
  const paint = (item: Item) => {
    item.element.style.setProperty('--vd-pin-sway', `${item.state.angle.toFixed(4)}deg`)
    item.element.style.setProperty('--vd-paper-lift', item.lift.angle.toFixed(4))
    item.element.style.setProperty('--vd-paper-twist', (item.lift.angle * item.corner).toFixed(4))
  }
  const clearItem = (item: Item) => {
    item.state = { angle: 0, velocity: 0 }
    item.lift = { angle: 0, velocity: 0 }
    item.corner = 0
    item.limit = 2
    for (const property of ['--vd-pin-sway', '--vd-paper-lift', '--vd-paper-twist'])
      item.element.style.removeProperty(property)
  }
  const endDrag = (cancelled = false) => {
    if (!drag) return
    const { item, id, active } = drag
    if (active || cancelled) item.blockClicksUntil = performance.now() + 1000
    drag = undefined
    item.element.removeAttribute('data-dragging')
    if (cancelled) {
      item.state.velocity = 0
      item.lift.velocity = 0
    }
    if (item.element.hasPointerCapture?.(id)) item.element.releasePointerCapture(id)
  }
  let frame = 0
  let lastFrame = 0
  let lastScroll = window.scrollY
  let lastInput = performance.now()
  let drive = 0
  const reset = () => {
    endDrag(true)
    cancelAnimationFrame(frame)
    frame = 0
    drive = 0
    lastFrame = 0
    lastScroll = window.scrollY
    lastInput = performance.now()
    for (const item of items) {
      clearItem(item)
    }
  }
  const tick = (now: number) => {
    frame = 0
    if (media.matches || document.hidden) return reset()
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.064) : 1 / 60
    lastFrame = now
    drive *= Math.exp(-12 * dt)
    let moving = false
    for (const item of items) {
      if (!item.visible || drag?.item === item) continue
      item.state = advancePinSpring(item.state, drive * item.gain, dt, item.limit, item.stiffness)
      item.lift = advancePinSpring(item.lift, 0, dt, 1, 58)
      // The wall stops the paper from swinging through its supporting surface.
      if (item.lift.angle < 0)
        item.lift = { angle: 0, velocity: Math.abs(item.lift.velocity) * 0.12 }
      paint(item)
      moving ||=
        Math.abs(item.state.angle) > 0.002 ||
        Math.abs(item.state.velocity) > 0.01 ||
        item.lift.angle > 0.001 ||
        Math.abs(item.lift.velocity) > 0.005
    }
    if (moving || Math.abs(drive) > 0.002) frame = requestAnimationFrame(tick)
    else if (!drag) reset()
    else lastFrame = 0
  }
  const wake = () => {
    if (!frame) {
      lastFrame = 0
      frame = requestAnimationFrame(tick)
    }
  }
  const angleAt = (x: number, y: number, pivotX: number, pivotY: number) =>
    (Math.atan2(x - pivotX, y - pivotY) * 180) / Math.PI
  const onPointerDown = (event: PointerEvent) => {
    if (media.matches || document.hidden || event.button !== 0 || drag || event.isPrimary === false)
      return
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const item = items.find((item) => item.element.contains(event.target as Node))
    if (!item) return
    item.blockClicksUntil = 0
    const rect = item.element.parentElement!.getBoundingClientRect()
    const pivotX = rect.left + rect.width / 2,
      pivotY = rect.top
    drag = {
      item,
      id: event.pointerId,
      active: false,
      touch: event.pointerType === 'touch',
      x: event.clientX,
      y: event.clientY,
      pivotX,
      pivotY,
      start: angleAt(event.clientX, event.clientY, pivotX, pivotY),
      angle: item.state.angle,
      time: performance.now(),
      radius: Math.max(40, Math.hypot(event.clientX - pivotX, event.clientY - pivotY)),
    }
    item.corner = Math.max(-1, Math.min(1, (event.clientX - pivotX) / Math.max(1, rect.width / 2)))
    item.stiffness = Math.max(24, Math.min(58, 32 * (420 / Math.max(240, rect.height))))
    item.state.velocity = 0
    drive = 0
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return
    if (!drag.active) {
      const dx = Math.abs(event.clientX - drag.x),
        dy = Math.abs(event.clientY - drag.y)
      if (Math.hypot(dx, dy) < 7) return
      if (drag.touch && dy >= dx) {
        endDrag(true)
        return
      }
      drag.active = true
      drag.item.element.setAttribute('data-dragging', 'true')
      drag.item.element.setPointerCapture?.(event.pointerId)
    }
    const now = performance.now(),
      item = drag.item
    const limit = window.innerWidth < 701 ? 4 : 8
    const next = resistedPinAngle(
      drag.angle,
      -angleAt(event.clientX, event.clientY, drag.pivotX, drag.pivotY) + drag.start,
      limit,
    )
    const elapsed = Math.max(0.008, (now - drag.time) / 1000)
    const speed = (next - item.state.angle) / elapsed
    const extension =
      Math.hypot(event.clientX - drag.pivotX, event.clientY - drag.pivotY) - drag.radius
    const lift = Math.max(0, Math.min(0.85, extension / 110 + Math.abs(next - drag.angle) * 0.018))
    item.lift = {
      angle: lift,
      velocity: Math.max(-2, Math.min(2, (lift - item.lift.angle) / elapsed)),
    }
    item.limit = limit
    item.state = {
      angle: next,
      velocity: Math.max(-35, Math.min(35, item.state.velocity * 0.65 + speed * 0.35)),
    }
    drag.time = now
    paint(item)
    if (event.cancelable) event.preventDefault()
  }
  const onPointerUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return
    // Holding still before release removes the old throwing velocity.
    const item = drag.item
    if (performance.now() - drag.time > 90) {
      item.state.velocity = 0
      item.lift.velocity = 0
    } else {
      // Leave room for the release arc instead of slamming into the safety bound.
      const room =
        Math.sqrt(Math.max(0, item.limit ** 2 - item.state.angle ** 2) * item.stiffness) * 0.85
      item.state.velocity = Math.max(-room, Math.min(room, item.state.velocity))
    }
    endDrag(event.type !== 'pointerup')
    wake()
  }
  const onClick = (event: MouseEvent) => {
    if (media.matches) return
    // Keyboard activation and modified clicks keep normal browser link behavior.
    if (event.detail === 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return
    const item = items.find((item) => item.element.contains(event.target as Node))
    if (item && performance.now() < item.blockClicksUntil) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (media.matches || document.hidden) return
    const item = items.find((item) => item.element === event.target)
    if (!item) return
    if (event.key === 'Enter' && item.element.matches('a[href]')) return
    if (event.key === 'Escape' || event.key === 'Home') {
      reset()
      event.preventDefault()
      return
    }
    const direction =
      event.key === 'ArrowLeft' ? 1 : ['ArrowRight', 'Enter', ' '].includes(event.key) ? -1 : 0
    if (!direction || (event.repeat && ['Enter', ' '].includes(event.key))) return
    event.preventDefault()
    item.limit = window.innerWidth < 701 ? 4 : 8
    item.state.angle = Math.max(-item.limit, Math.min(item.limit, item.state.angle + direction * 2))
    item.state.velocity = direction * 8
    paint(item)
    wake()
  }
  const stopNativeDrag = (event: DragEvent) => {
    if (items.some((item) => item.element.contains(event.target as Node))) event.preventDefault()
  }
  const onScroll = () => {
    const now = performance.now()
    const delta = window.scrollY - lastScroll
    const elapsed = Math.max(16, Math.min(64, now - lastInput))
    lastScroll = window.scrollY
    lastInput = now
    if (drag?.active || media.matches || document.hidden || !items.some((item) => item.visible))
      return
    // A jump to an anchor must not throw the photographs across the page.
    if (Math.abs(delta) > window.innerHeight) return
    drive = Math.max(-1.4, Math.min(1.4, (delta / elapsed) * 0.7))
    if (!frame) {
      lastFrame = 0
      frame = requestAnimationFrame(tick)
    }
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const item = items.find((candidate) => candidate.element === entry.target)
      if (!item) continue
      item.visible = entry.isIntersecting
      if (!item.visible) {
        if (drag?.item === item) endDrag(true)
        clearItem(item)
      }
    }
  })
  for (const item of items) observer.observe(item.element)
  host.addEventListener('click', onClick, true)
  host.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  host.addEventListener('lostpointercapture', onPointerUp)
  host.addEventListener('keydown', onKeyDown)
  host.addEventListener('dragstart', stopNativeDrag)
  window.addEventListener('blur', reset)
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('visibilitychange', reset)
  media.addEventListener('change', reset)
  return () => {
    reset()
    observer.disconnect()
    host.removeEventListener('click', onClick, true)
    host.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    host.removeEventListener('lostpointercapture', onPointerUp)
    host.removeEventListener('keydown', onKeyDown)
    host.removeEventListener('dragstart', stopNativeDrag)
    window.removeEventListener('blur', reset)
    window.removeEventListener('scroll', onScroll)
    document.removeEventListener('visibilitychange', reset)
    media.removeEventListener('change', reset)
  }
}
