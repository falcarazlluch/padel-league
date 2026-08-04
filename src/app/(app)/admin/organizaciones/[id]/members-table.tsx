'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState, useTransition } from 'react';
import type { OrganizationMemberRow } from '@/modules/organizations';
import { CATEGORY_LABEL } from '@/modules/leagues/presentation/category';
import { removeOrgMemberAction, setOrgMemberRoleByIdAction } from '../actions';

const PLATFORM_ROLE_LABEL = {
  SUPER_ADMIN: 'Super Admin',
  LEAGUE_ADMIN: 'Admin de liga',
  PLAYER: 'Jugador',
} as const;

type Row = Omit<OrganizationMemberRow, 'joinedAt'> & { joinedAt: string };

/**
 * The club's roster, from the platform side.
 *
 * Removing a member only drops the membership — the account, its history and any
 * competition already entered survive. The confirm text says so, because "quitar"
 * next to a person's name reads like a deletion otherwise.
 */
export function MembersTable({
  organizationId,
  organizationName,
  members,
}: {
  organizationId: string;
  organizationName: string;
  members: Row[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const admins = members.filter((m) => m.role === 'ORG_ADMIN').length;

  const run = (userId: string, fn: () => Promise<{ error?: string }>) => {
    setError(null);
    setBusyUserId(userId);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      setBusyUserId(null);
    });
  };

  const toggleRole = (m: Row) => {
    const next = m.role === 'ORG_ADMIN' ? 'ORG_PLAYER' : 'ORG_ADMIN';
    // Losing the last admin leaves the club with nobody who can open its
    // competitions or mint inscription links, so it needs saying out loud.
    if (next === 'ORG_PLAYER' && admins === 1) {
      if (
        !confirm(
          `${m.name} es el único administrador de ${organizationName}. Si lo quitas, nadie del club podrá crear competiciones ni enlaces de inscripción. ¿Continuar?`,
        )
      ) {
        return;
      }
    }
    run(m.userId, () => setOrgMemberRoleByIdAction(organizationId, m.userId, next));
  };

  const remove = (m: Row) => {
    const activity =
      m.teamCount > 0 || m.enrollmentCount > 0
        ? ` Mantendrá sus ${m.teamCount} pareja(s) y ${m.enrollmentCount} inscripción(es) ya registradas.`
        : '';
    if (
      !confirm(
        `¿Sacar a ${m.name} de ${organizationName}? Su cuenta de Padel League no se toca: solo deja de ver el entorno del club.${activity}`,
      )
    ) {
      return;
    }
    run(m.userId, () => removeOrgMemberAction(organizationId, m.userId));
  };

  if (members.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Todavía no hay nadie en {organizationName}. Añade al administrador del club con el formulario
        de abajo, o reparte un enlace de inscripción.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[42rem]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Miembro</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">En el club</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">En la plataforma</th>
              <th className="text-center px-3 py-3 font-medium text-gray-600">Parejas</th>
              <th className="text-center px-3 py-3 font-medium text-gray-600">Inscripciones</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map((m) => {
              const busy = pending && busyUserId === m.userId;
              return (
                <tr key={m.userId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 flex items-center gap-2">
                      {m.name}
                      {m.inactive && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-slate-100 text-slate-500 border-slate-200">
                          baja
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{m.email}</div>
                    <div className="text-xs text-slate-400">
                      {CATEGORY_LABEL[m.category]} · desde{' '}
                      {new Date(m.joinedAt).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        m.role === 'ORG_ADMIN'
                          ? 'bg-brand-blue/10 text-brand-navy border-brand-blue/30'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {m.role === 'ORG_ADMIN' ? 'Administrador' : 'Jugador'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        m.platformRole === 'SUPER_ADMIN'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : m.platformRole === 'LEAGUE_ADMIN'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {PLATFORM_ROLE_LABEL[m.platformRole]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-slate-600">{m.teamCount}</td>
                  <td className="px-3 py-3 text-center text-slate-600">{m.enrollmentCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleRole(m)}
                        disabled={busy}
                        className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
                      >
                        {busy ? '...' : m.role === 'ORG_ADMIN' ? 'Hacer jugador' : 'Hacer admin'}
                      </button>
                      <Link
                        href={`/admin/usuarios/${m.userId}` as Route}
                        className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        Ficha
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(m)}
                        disabled={busy}
                        className="text-xs px-3 py-1.5 bg-white border border-red-200 text-red-700 font-semibold rounded-lg hover:bg-red-50 disabled:opacity-60 transition-colors"
                      >
                        Sacar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        «Sacar» solo quita la membresía del club. Para bloquear o anonimizar una cuenta de Padel
        League, entra en su ficha.
      </p>
    </div>
  );
}
