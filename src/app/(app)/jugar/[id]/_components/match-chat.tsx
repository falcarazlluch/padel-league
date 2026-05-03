'use client';

import { useActionState, useRef } from 'react';
import { UserAvatar } from '@/modules/users/presentation/user-avatar';
import { postChatMessageAction } from '../actions';

type ActionResult = { error: string } | { success: true };

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  content: string;
  createdAt: string; // ISO string
}

interface Props {
  matchId: string;
  currentUserId: string;
  messages: ChatMessage[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) {
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Madrid',
    }).format(d);
  }
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(d);
}

export function MatchChat({ matchId, currentUserId, messages }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => {
      const res = await postChatMessageAction(_prev, formData);
      if (res && 'success' in res) {
        formRef.current?.reset();
      }
      return res;
    },
    null,
  );

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <header className="px-5 py-3 border-b border-slate-200/80 bg-slate-50">
        <h2 className="text-sm font-bold text-brand-navy">Chat del partido</h2>
        <p className="text-[11px] text-slate-500">
          Visible para organizador, jugadores apuntados e invitados.
        </p>
      </header>

      <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <li className="px-5 py-6 text-sm text-slate-400">
            Aún no hay mensajes. Sé el primero.
          </li>
        ) : (
          messages.map((m) => {
            const mine = m.userId === currentUserId;
            return (
              <li key={m.id} className="px-5 py-3 flex gap-3 items-start">
                <UserAvatar url={m.avatarUrl} name={m.userName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`text-xs font-bold ${mine ? 'text-brand-blue' : 'text-brand-navy'}`}>
                      {mine ? 'Tú' : m.userName}
                    </span>
                    <span className="text-[11px] text-slate-400">{formatTime(m.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words mt-0.5">
                    {m.content}
                  </p>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <form
        ref={formRef}
        action={action}
        className="border-t border-slate-200/80 p-3 flex flex-col sm:flex-row gap-2 items-stretch"
      >
        <input type="hidden" name="matchId" value={matchId} />
        <textarea
          name="content"
          required
          maxLength={2000}
          rows={2}
          placeholder="Escribe un mensaje…"
          className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all resize-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
      {state && 'error' in state && (
        <p className="px-4 py-2 text-xs text-rose-600 bg-rose-50 border-t border-rose-100">{state.error}</p>
      )}
    </section>
  );
}
