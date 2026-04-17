import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  const user = await getValidatedSession(token);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Bienvenido, {user.name}</h1>
      <p className="text-sm text-gray-500 mb-8">Gestiona tus ligas de pádel</p>
      <Link
        href={'/ligas' as Route}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
      >
        Ver ligas
      </Link>
    </div>
  );
}
