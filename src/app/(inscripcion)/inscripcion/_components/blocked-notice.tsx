/**
 * Explains why a link cannot be used right now. Always a specific reason rather
 * than a generic error, so the visitor knows whether to wait, ask for a new
 * link, or give up.
 */
export function BlockedNotice({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3"
    >
      <svg
        className="h-5 w-5 text-amber-600 shrink-0 mt-0.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M8.257 3.1c.765-1.36 2.72-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <div>
        <p className="text-sm font-semibold text-amber-900">No puedes inscribirte ahora</p>
        <p className="text-sm text-amber-800 mt-0.5">{message}</p>
        <p className="text-xs text-amber-700/80 mt-2">
          Si crees que es un error, pide al organizador un enlace nuevo.
        </p>
      </div>
    </div>
  );
}
