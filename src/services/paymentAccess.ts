export class PaymentAccessError extends Error {
  readonly code = "permission-denied";
  constructor(readonly stage: string) {
    super(`Paiement refusé : ${stage}.`);
    this.name = "PaymentAccessError";
  }
}

export async function withPaymentAccess<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PaymentAccessError) throw error;
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "permission-denied" || code === "firestore/permission-denied") throw new PaymentAccessError(stage);
    throw error;
  }
}

export async function paymentClockHint(): Promise<string> {
  if (typeof window === "undefined") return "";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`/index.html?payment-clock=${Date.now()}`, {
      method: "HEAD", cache: "no-store", signal: controller.signal
    });
    const date = response.headers.get("Date");
    if (!response.ok || !date) return "";
    const serverTime = Date.parse(date) + Number(response.headers.get("Age") || 0) * 1000;
    const drift = Date.now() - serverTime;
    if (!Number.isFinite(drift) || (drift >= -295000 && drift <= 55000)) return "";
    return " L'horloge de cet appareil est décalée par rapport au serveur. Activez la date et l'heure automatiques, puis réessayez.";
  } catch {
    return "";
  } finally {
    window.clearTimeout(timeout);
  }
}
