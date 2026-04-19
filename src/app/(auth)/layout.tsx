import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(135deg, #0D1E45 0%, #1A3268 60%, #0D1E45 100%)' }}
    >
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="Padel League" className="h-20 w-auto object-contain drop-shadow-lg" />
        </div>
        <div className="bg-white rounded-2xl shadow-xl border border-white/10 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
