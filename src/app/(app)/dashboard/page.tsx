import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  const user = await getValidatedSession(token);

  return (
    <div>
      <h1>Bienvenido, {user.name}</h1>
      <p style={{ color: '#6b7280' }}>Dashboard en construcción. Spec 2 añadirá las ligas.</p>
    </div>
  );
}
