/**
 * One way to start recording a sale, however the agent reaches for it.
 *
 * Picking "Sold" from the status dropdown is the obvious thing to do, so it
 * should do the obvious thing — open the questions — rather than tell the
 * agent they used the wrong control. The status control fires this and the
 * sale dialog, sitting beside it in the header, opens.
 */
export const OPEN_SALE_EVENT = "acc:open-sale";

export function openSaleDialog() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_SALE_EVENT));
}
