import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(160deg,#e8eef8 0%,#f0f4fb 40%,#f5f7fa 100%)' }}
    >
      <header className="bg-white border-b border-slate-200/80">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.png"
              alt="Padel League"
              width={120}
              height={48}
              className="h-10 w-auto object-contain"
              priority
              unoptimized
            />
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-brand-navy hover:text-brand-navy-light transition-colors"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
