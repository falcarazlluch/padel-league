import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { RegistrationCodeService } from '@/modules/users';
import { GenerateForm } from './generate-form';
import { CodesTable } from './codes-table';

export default async function CodigosRegistroPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);

  const codes = await RegistrationCodeService.list(user.id);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Administración</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Códigos de registro</h1>
        <p className="text-sm text-slate-500 mt-1">
          Genera códigos de invitación de un solo uso. Compártelos con los nuevos jugadores;
          los necesitarán para crear cuenta en <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">/registro</code>.
        </p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <GenerateForm />
      </section>

      <section>
        <h2 className="text-base font-semibold text-brand-navy mb-3">Histórico ({codes.length})</h2>
        <CodesTable
          codes={codes.map((c) => ({
            id: c.id,
            code: c.code,
            createdAt: c.createdAt.toISOString(),
            expiresAt: c.expiresAt?.toISOString() ?? null,
            usedAt: c.usedAt?.toISOString() ?? null,
            createdByName: c.createdByName,
            usedByName: c.usedByName,
          }))}
        />
      </section>
    </div>
  );
}
