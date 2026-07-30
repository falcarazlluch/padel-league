import Link from 'next/link';
import type { Route } from 'next';
import type { TournamentEnrollmentStatus } from '@/modules/organizations';

type Item = {
  leagueName: string;
  leagueSlug: string;
  status: TournamentEnrollmentStatus;
  /**
   * Whole days until the registration window closes, computed by the caller.
   * Reading the clock during render would make the component non-idempotent.
   */
  daysLeft: number;
  /** Live invite link token, when one still exists, to resume the wizard. */
  resumeToken: string | null;
};

/**
 * Loud, unmissable reminder that an inscription is NOT closed. Deliberately
 * amber rather than red: nothing is broken, but the player has to act before
 * the deadline or they will not be in the draw.
 */
export function UnfinishedEnrollmentBanner({ items }: { items: Item[] }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const { daysLeft } = item;
        const waiting = item.status === 'AWAITING_PARTNER_ACCEPT';
        return (
          <div
            key={item.leagueSlug}
            role="status"
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-wrap items-start justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-900">
                Tu inscripción a {item.leagueName} está sin confirmar
              </p>
              <p className="text-sm text-amber-800 mt-0.5">
                {waiting
                  ? 'Falta que tu pareja acepte la invitación. Todavía no ocupáis plaza.'
                  : 'Te falta elegir pareja. Todavía no ocupas plaza.'}
              </p>
              <p className="text-xs text-amber-700/80 mt-1">
                {daysLeft > 1
                  ? `Quedan ${daysLeft} días para el cierre de inscripción.`
                  : daysLeft === 1
                    ? 'La inscripción cierra mañana.'
                    : 'La inscripción cierra hoy.'}
              </p>
            </div>
            <Link
              href={
                (item.resumeToken
                  ? `/inscripcion/${item.resumeToken}?paso=4`
                  : `/inscripcion/estado/${item.leagueSlug}`) as Route
              }
              className="px-4 py-2 bg-amber-900 text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity shrink-0"
            >
              {waiting ? 'Ver estado' : 'Terminar ahora'}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
