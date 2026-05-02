import Image from 'next/image';
import type { ReactNode } from 'react';
import { AuthBackgroundVideo } from './_components/auth-background-video';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden bg-brand-navy">
      <AuthBackgroundVideo
        sources={[
          { src: '/pelota.webm', type: 'video/webm' },
          { src: '/pelota.mp4', type: 'video/mp4' },
        ]}
        poster="/pelota-poster.jpg"
        rate={0.5}
      />
      <div className="absolute inset-0 bg-brand-navy/60 pointer-events-none" aria-hidden />
      <div className="relative w-full max-w-sm">
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
