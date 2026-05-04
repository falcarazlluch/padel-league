'use client';

import { useActionState, useRef, useEffect } from 'react';
import { changePasswordAction } from './actions';
import { PasswordInput } from '@/app/(auth)/_components/password-input';

type Result = { error?: string; success?: string };

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<Result | null, FormData>(
    async (_prev, formData) => changePasswordAction(formData),
    null,
  );

  useEffect(() => {
    if (state && 'success' in state && state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div>
        <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700 mb-1">
          Contraseña actual
        </label>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          required
          autoComplete="current-password"
        />
      </div>
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-1">
          Nueva contraseña
        </label>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          required
          autoComplete="new-password"
          placeholder="Mín. 10 caracteres con número y letra"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Guardando…' : 'Cambiar contraseña'}
      </button>

      {state?.error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          {state.success}
        </p>
      )}
    </form>
  );
}
