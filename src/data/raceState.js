// Read-only access to the canonical state. No provisional wallet/score mirror.
export function getRaceState(registry) {
  return registry.get('championship');
}
