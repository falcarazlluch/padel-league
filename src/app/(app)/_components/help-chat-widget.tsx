'use client';

import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string };

const STORAGE_KEY = 'pl_help_chat_history_v1';

const WELCOME: Msg = {
  role: 'assistant',
  content: '¡Hola! Soy el asistente de Padel League. Pregúntame cómo funciona algo o por el estado de tus equipos y ligas.',
};

export function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate history once
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist + autoscroll on changes
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
    } catch {
      // ignore
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = async () => {
    const question = input.trim();
    if (!question || pending) return;
    setError(null);
    const next: Msg[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setPending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          history: messages.filter((m) => m !== WELCOME).slice(-10),
        }),
      });
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || !data.content) {
        setError(data.error ?? 'Algo falló.');
        return;
      }
      setMessages([...next, { role: 'assistant', content: data.content }]);
    } catch (err) {
      setError((err as Error).message ?? 'Error de red.');
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send();
  };

  const reset = () => {
    setMessages([WELCOME]);
    setError(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir chat de ayuda"
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,360px)] h-[min(72vh,520px)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white">
            <div className="text-sm font-bold">Ayuda — Padel League</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={reset}
                aria-label="Borrar conversación"
                className="text-white/80 hover:text-white text-xs px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar chat"
                className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M6 6 L18 18" />
                  <path d="M18 6 L6 18" />
                </svg>
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'ml-auto bg-brand-navy text-white rounded-br-sm'
                    : 'mr-auto bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
                }`}
              >
                {m.content}
              </div>
            ))}
            {pending && (
              <div className="mr-auto max-w-[85%] rounded-2xl px-3 py-2 text-sm bg-white border border-slate-200 text-slate-400 italic">
                Escribiendo…
              </div>
            )}
            {error && (
              <div className="mx-auto max-w-[90%] text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white p-2 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder="¿Cómo invito a alguien?"
              disabled={pending}
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={pending || input.trim().length === 0}
              className="px-3 py-2 bg-brand-navy text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
