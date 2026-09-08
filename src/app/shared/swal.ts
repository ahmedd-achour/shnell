import Swal, { SweetAlertIcon } from 'sweetalert2';

/**
 * Branded SweetAlert2 wrappers — the single entry point for every admin dialog.
 * Never call window.alert / window.confirm in the admin; use these instead.
 *
 * Visual theme (amber brand, warm ink) is applied in src/styles.css via the
 * `.swal2-*` overrides, so options here stay behaviour-only.
 */

const AMBER = '#FFC107';
const INK = '#6B6459';
const DANGER = '#D42F2F';

/** Small non-blocking toast, top-right. Use for "saved", "sent", "updated". */
const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2800,
  timerProgressBar: true,
  customClass: { popup: 'sh-swal-toast' },
});

export function toastSuccess(title: string): void {
  toast.fire({ icon: 'success', title });
}

export function toastError(title: string, text?: string): void {
  toast.fire({ icon: 'error', title, text });
}

export function toastInfo(title: string): void {
  toast.fire({ icon: 'info', title });
}

/** Centered acknowledgement dialog (single OK button). */
export function notify(
  icon: SweetAlertIcon,
  title: string,
  text?: string
): Promise<unknown> {
  return Swal.fire({
    icon,
    title,
    text,
    confirmButtonText: 'OK',
    confirmButtonColor: AMBER,
    customClass: { popup: 'sh-swal' },
  });
}

export const alertError = (title: string, text?: string) => notify('error', title, text);
export const alertSuccess = (title: string, text?: string) => notify('success', title, text);

interface ConfirmOpts {
  title: string;
  text?: string;
  html?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: SweetAlertIcon;
  /** Red confirm button + warning framing for destructive actions. */
  danger?: boolean;
}

/** Awaitable confirm. Returns true only when the user presses the confirm button. */
export async function confirmAction(opts: ConfirmOpts): Promise<boolean> {
  const res = await Swal.fire({
    icon: opts.icon ?? (opts.danger ? 'warning' : 'question'),
    title: opts.title,
    text: opts.text,
    html: opts.html,
    showCancelButton: true,
    focusCancel: opts.danger === true,
    reverseButtons: true,
    confirmButtonText: opts.confirmText ?? (opts.danger ? 'Supprimer' : 'Confirmer'),
    cancelButtonText: opts.cancelText ?? 'Annuler',
    confirmButtonColor: opts.danger ? DANGER : AMBER,
    cancelButtonColor: INK,
    customClass: { popup: 'sh-swal' },
  });
  return res.isConfirmed === true;
}

export { Swal };
