'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { generateCodesAction } from './actions';

export function GenerateForm() {
  const [state, formAction] = useActionState<{ error?: string; codes?: string[] } | null, FormData>(
    async (_prev, formData) => generateCodesAction(_prev, formData),
    null,
  );
  const [copied, setCopied] = useState<string | null>(null);

  const copyAll = () => {
    if (!state?.codes) return;
    void navigator.clipboard.writeText(state.codes.join('\n'));
    setCopied('all');
    setTimeout(() => setCopied(null), 1500);
  };

  const copyOne = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-brand-navy">Generar nuevos códigos</h2>
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-[auto_auto_auto] gap-3 items-end">
        <div>
          <label htmlFor="count" className="block text-xs font-medium text-slate-500 mb-1">Cantidad</label>
          <input
            id="count"
            name="count"
            type="number"
            min={1}
            max={25}
            defaultValue={1}
            required
            className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div>
          <label htmlFor="expiresInDays" className="block text-xs font-medium text-slate-500 mb-1">
            Caduca en (días)
          </label>
          <input
            id="expiresInDays"
            name="expiresInDays"
            type="number"
            min={0}
            max={365}
            defaultValue={30}
            placeholder="0 = sin caducidad"
            className="w-40 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <SubmitButton />
      </form>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{state.error}</p>
      )}

      {state?.codes && state.codes.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-emerald-800">
              {state.codes.length === 1 ? 'Código generado' : `${state.codes.length} códigos generados`}
            </p>
            {state.codes.length > 1 && (
              <button
                type="button"
                onClick={copyAll}
                className="text-xs px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 font-semibold rounded-lg hover:bg-emerald-50 transition-colors"
              >
                {copied === 'all' ? '¡Copiados!' : 'Copiar todos'}
              </button>
            )}
          </div>
          <ul className="space-y-1.5">
            {state.codes.map((code) => (
              <li key={code} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-emerald-200">
                <code className="font-mono text-sm tracking-widest text-brand-navy">{code}</code>
                <button
                  type="button"
                  onClick={() => copyOne(code)}
                  className="text-xs px-2 py-1 text-emerald-700 hover:text-emerald-900 transition-colors"
                >
                  {copied === code ? '¡Copiado!' : 'Copiar'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending ? 'Generando…' : 'Generar'}
    </button>
  );
}
