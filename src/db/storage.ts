export async function requestPersistence(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!navigator.storage?.persist) return 'unsupported'
  if (await navigator.storage.persisted()) return 'granted'
  return (await navigator.storage.persist()) ? 'granted' : 'denied'
}
