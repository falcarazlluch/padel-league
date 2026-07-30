import Image from 'next/image';
import type { ReactNode } from 'react';
import { AuthBackgroundVideo } from './_components/auth-background-video';
import { getTenant } from '@/shared/tenant/context';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // Under a whitelabel subdomain the auth card wears the club's mark: a player
  // sent to log in from a RACC link must not suddenly see another brand.
  const tenant = await getTenant();
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
            {tenant ? (
              tenant.logoUrl ? (
                <Image
                  src={tenant.logoUrl}
                  alt={tenant.name}
                  width={240}
                  height={96}
                  className="max-h-20 w-auto max-w-[80%] object-contain"
                  priority
                  unoptimized
                />
              ) : (
                <p className="text-2xl font-black text-brand-navy text-center">{tenant.name}</p>
              )
            ) : (
              <Image
                src="/logo.png"
                alt="Padel League"
                width={240}
                height={96}
                className="w-4/5 h-auto object-contain"
                priority
                unoptimized
              />
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
