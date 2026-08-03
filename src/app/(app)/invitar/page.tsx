import { notFound } from 'next/navigation';
import { getTenantId } from '@/shared/tenant/context';
import { InviteForm } from './invite-form';

export const metadata = { title: 'Invitar a un amigo — Padel League' };

export default async function InvitarPage() {
  // The friend-invite flow mints a platform registration code. Inside a tenant
  // the door is the organiser's inscription link, so this page does not exist
  // there — the nav already hides it; this closes the direct URL.
  if (await getTenantId()) notFound();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Comparte la app</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Invitar a un amigo</h1>
        <p className="text-sm text-slate-500 mt-1">
          Envíale un email y recibirá un enlace personal para crear cuenta. La invitación es válida durante 14 días.
        </p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <InviteForm />
      </section>
    </div>
  );
}
