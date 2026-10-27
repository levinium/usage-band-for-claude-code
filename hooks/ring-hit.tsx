import type { ClientSurface } from 'claude-code'

// An invisible hit area laid over the context ring: it reports clicks to the
// hooks module, which compacts. Hover is the enclosing Box's job, so moving
// the pointer never redraws the band.
export default function RingHit(_props: unknown, surface: ClientSurface<{ isListening: boolean }>) {
  if (!surface.state?.isListening) {
    surface.onPointer(e => {
      if (e.type === 'up' && e.button === 'left') surface.post({ press: true })
    })
    surface.setState({ isListening: true })
  }
  const { Text } = surface.elements
  return <Text>{' '.repeat(Math.max(1, surface.columns))}</Text>
}
