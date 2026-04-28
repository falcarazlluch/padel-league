import { notFound } from 'next/navigation';
import { LeagueService } from '@/modules/leagues';
import { NuevoEquipoForm } from './form';

export default async function NuevoEquipoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const league = await LeagueService.getBySlug(slug).catch(() => null);
  if (!league) notFound();

  return (
    <div className="max-w-sm">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Liga</p>
        <h1 className="text-2xl font-extrabold text-brand-navy mb-6">Nuevo equipo</h1>
      </div>
      <NuevoEquipoForm leagueId={league.id} slug={slug} />
    </div>
  );
}
