import { notFound } from 'next/navigation';
import { LeagueService } from '@/modules/leagues';
import { NuevoEquipoForm } from './form';

export default async function NuevoEquipoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const league = await LeagueService.getBySlug(slug).catch(() => null);
  if (!league) notFound();

  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nuevo equipo</h1>
      <NuevoEquipoForm leagueId={league.id} slug={slug} />
    </div>
  );
}
