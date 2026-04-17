import { cookies } from 'next/headers';
import { SESSION_COOKIE, SessionService } from '@/shared/auth/session';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)!.value;
  const user = await SessionService.validate(token);

  return (
    <div>
      <h1>Bienvenido, {user.name}</h1>
      <p style={{ color: '#6b7280' }}>Dashboard en construcción. Spec 2 añadirá las ligas.</p>
    </div>
  );
}
