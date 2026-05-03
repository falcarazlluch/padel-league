import { redirect } from 'next/navigation';

export default function HomePage() {
  // Authenticated users land on /dashboard. Non-authenticated users get
  // bounced to /login by the middleware.
  redirect('/dashboard');
}
