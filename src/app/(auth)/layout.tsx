import Image from 'next/image';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(135deg, #0D1E45 0%, #1A3268 60%, #0D1E45 100%)' }}
    >
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl border-t-4 border-brand-yellow p-8">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="Padel League"
              width={240}
              height={96}
              className="w-4/5 h-auto object-contain"
              priority
              unoptimized
            />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
