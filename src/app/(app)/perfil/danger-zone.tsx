'use client';

import { useState, useTransition } from 'react';
import { deleteAccountAction } from './actions';

export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <section className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
        <h2 className="text-base font-bold text-rose-700 mb-1">Zona de peligro</h2>
        <p className="text-sm text-rose-700/80 mb-3">
          Eliminar tu cuenta es irreversible: tu nombre, email y avatar se anonimizan,
          tus sesiones se cierran y dejas de poder iniciar sesión. El historial de partidos
          se conserva con un identificador anónimo para no romper el ranking de las ligas
          que ya hayas jugado.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-semibold px-4 py-2 bg-white border border-rose-300 text-rose-700 rounded-xl hover:bg-rose-100 transition-colors"
        >
          Eliminar mi cuenta
        </button>
      </section>
    );
  }

  return (
    <section className="bg-rose-50 border border-rose-300 rounded-2xl p-5 space-y-3">
      <h2 className="text-base font-bold text-rose-700">¿Seguro que quieres eliminar tu cuenta?</h2>
      <p className="text-sm text-rose-700/80">
        Esta acción es permanente. Para continuar:
      </p>
      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const res = await deleteAccountAction(formData);
            if (res?.error) setError(res.error);
          });
        }}
        className="space-y-3"
      >
        <label className="block text-xs font-medium text-rose-700">
          Contraseña actual
          <input
            type="password"
            name="currentPassword"
            required
            autoComplete="current-password"
            className="mt-1 block w-full px-3 py-2 bg-white border border-rose-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </label>
        <label className="block text-xs font-medium text-rose-700">
          Escribe <strong className="font-bold">ELIMINAR</strong> para confirmar
          <input
            type="text"
            name="confirmation"
            required
            autoComplete="off"
            spellCheck={false}
            className="mt-1 block w-full px-3 py-2 bg-white border border-rose-200 rounded-xl text-sm text-slate-800 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </label>
        {error && <p className="text-sm text-rose-700 font-medium">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="text-sm font-bold px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors"
          >
            {pending ? 'Eliminando…' : 'Sí, eliminar definitivamente'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="text-sm font-semibold px-4 py-2 bg-white border border-rose-200 text-rose-700 rounded-xl hover:bg-rose-100 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
