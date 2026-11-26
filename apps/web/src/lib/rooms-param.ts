export interface RoomPick {
  roomType: number
  option: string
  count: number
}

/**
 * The `rooms` query value /booking/rooms and /booking/availability read
 * ("type:count:option,..."), built from what a guest picked on the hotel page.
 * The inverse of parseRoomsParam, which the server uses; picks with a zero
 * count are left out. Empty when nothing is picked.
 */
export function formatRoomsParam(picks: readonly RoomPick[]): string {
  return picks
    .filter((pick) => pick.count > 0)
    .map((pick) => `${pick.roomType}:${pick.count}:${pick.option}`)
    .join(',')
}
