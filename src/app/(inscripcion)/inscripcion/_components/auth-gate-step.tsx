import Link from 'next/link';
import type { Route } from 'next';

/**
 * Fork for visitors with no session. The invite token rides along in both
 * directions: `inviteToken` lets /registro create the account without an
 * invitation code (the tournament link *is* the invitation), and `next` brings
 * either path straight back into the wizard.
 */
export function AuthGateStep({
  token,
  organizationName,
}: {
  token: string;
  organizationName: string;
}) {
  const next = encodeURIComponent(`/inscripcion/${token}`);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-brand-navy">Para apuntarte, identifícate</h2>
        <p className="text-sm text-slate-600 mt-1">
          Tarda menos de un minuto. Al entrar quedarás dado de alta en el entorno de{' '}
          {organizationName} y volverás automáticamente aquí para terminar la inscripción.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href={`/registro?inviteToken=${encodeURIComponent(token)}&next=${next}` as Route}
          className="block text-center px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
        >
          Soy nuevo — crear cuenta
        </Link>
        <Link
          href={`/login?next=${next}` as Route}
          className="block text-center px-4 py-3 bg-white border border-slate-200 text-brand-navy text-sm font-bold rounded-xl shadow-sm hover:bg-slate-50 transition-colors"
        >
          Ya tengo cuenta — entrar
        </Link>
      </div>

      <p className="text-xs text-slate-400">
        No se te apunta a nada hasta que completes el asistente y te lo confirmemos por escrito.
      </p>
    </section>
  );
}
