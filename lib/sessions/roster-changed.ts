// RegisterPanel and RegisteredParticipants are sibling client islands on the
// ISR session page, each fetching its own data. Without a signal between them
// a member's own registration only reached the roster after a full reload.
// A window event keeps them decoupled and works without lifting state into
// the server-rendered page.
const EVENT = "twogether:roster-changed";

export function notifyRosterChanged(sessionId: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: sessionId }));
}

export function onRosterChanged(sessionId: string, listener: () => void): () => void {
  const handler = (event: Event) => {
    if ((event as CustomEvent<string>).detail === sessionId) listener();
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
