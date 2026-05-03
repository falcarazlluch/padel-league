'use client';

import { useActionState, useState } from 'react';
import {
  inviteFriendAction,
  generateShareLinkAction,
  type ShareLinkResult,
} from './actions';

type EmailResult = { error: string } | { success: true; email: string };

export function InviteForm() {
  const [emailState, emailAction, emailPending] = useActionState<EmailResult | null, FormData>(
    async (_prev, formData) => inviteFriendAction(_prev, formData),
    null,
  );

  const [waLoading, setWaLoading] = useState(false);
  const [waResult, setWaResult] = useState<Extract<ShareLinkResult, { ok: true }> | null>(null);
  const [waError, setWaError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'text' | null>(null);

  async function handleShareWhatsApp() {
    setWaLoading(true);
    setWaError(null);
    const result = await generateShareLinkAction();
    setWaLoading(false);
    if ('error' in result) {
      setWaError(result.error);
      return;
    }
    setWaResult(result);
    const waUrl = `https://wa.me/?text=${encodeURIComponent(result.whatsappText)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  async function copy(text: string, kind: 'link' | 'text') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-brand-blue">Por email</h3>
        <form action={emailAction} className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
              Email del amigo
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="amigo@ejemplo.com"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={emailPending}
            className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {emailPending ? 'Enviando…' : 'Enviar invitación'}
          </button>
          {emailState && 'error' in emailState && (
            <p className="text-sm text-rose-600">{emailState.error}</p>
          )}
          {emailState && 'success' in emailState && (
            <p className="text-sm text-emerald-700">
              Invitación enviada a <strong>{emailState.email}</strong>.
            </p>
          )}
        </form>
      </section>

      <div className="border-t border-slate-200/80" />

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-brand-blue">Por WhatsApp</h3>
        <p className="text-sm text-slate-500">
          Genera un enlace personal y elige a quién mandárselo desde tu lista de contactos de WhatsApp.
        </p>
        <button
          type="button"
          onClick={handleShareWhatsApp}
          disabled={waLoading}
          className="w-full sm:w-auto inline-flex items-center gap-2 px-4 py-2.5 bg-[#25D366] text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          {waLoading ? 'Generando…' : 'Compartir por WhatsApp'}
        </button>

        {waError && <p className="text-sm text-rose-600">{waError}</p>}

        {waResult && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <p className="text-xs text-slate-500">
              Si WhatsApp no se ha abierto, copia el texto o el enlace y mándalo manualmente:
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => copy(waResult.whatsappText, 'text')}
                className="flex-1 text-xs font-semibold px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
              >
                {copied === 'text' ? '✓ Copiado' : 'Copiar texto'}
              </button>
              <button
                type="button"
                onClick={() => copy(waResult.registerUrl, 'link')}
                className="flex-1 text-xs font-semibold px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
              >
                {copied === 'link' ? '✓ Copiado' : 'Copiar enlace'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 break-all">{waResult.registerUrl}</p>
            <p className="text-[11px] text-slate-400">
              Código: <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded">{waResult.code}</code>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
