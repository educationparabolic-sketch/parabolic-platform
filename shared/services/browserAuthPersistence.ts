// A token-free availability probe. Firebase alone owns the actual Auth session records.
export function assertBrowserAuthPersistenceAvailable(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage,
): void {
  const key = `parabolic.authPersistenceProbe.${crypto.randomUUID()}`;
  let available = false;
  try {
    storage.setItem(key, "available");
    available = storage.getItem(key) === "available";
  } catch {
    available = false;
  } finally {
    try { storage.removeItem(key); } catch { available = false; }
  }
  if (!available) throw new Error("Browser session persistence is unavailable.");
}
