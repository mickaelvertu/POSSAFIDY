export function assertOnlineForTransaction(isOnline = typeof navigator === "undefined" || navigator.onLine): void {
  if (!isOnline) {
    throw new Error("Cette action nécessite une connexion Internet. Réessayez lorsque l'application sera de nouveau en ligne.");
  }
}
