import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main style={{ maxWidth: '400px', margin: '4rem auto', padding: '0 1rem' }}>
      {children}
    </main>
  );
}
