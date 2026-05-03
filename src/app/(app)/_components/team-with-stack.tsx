import { TeamLogo } from '@/modules/teams/presentation/team-logo';
import { PlayerStack, type StackPlayer } from './player-stack';

interface Props {
  team: {
    id: string;
    name: string;
    logoUrl: string | null;
    members: StackPlayer[];
  };
  /** Mirrors the layout (logo on the right) — useful for the rival team. */
  reverse?: boolean;
  /** Bold-styled team name when this side won. */
  highlight?: boolean;
}

export function TeamWithStack({ team, reverse, highlight }: Props) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${reverse ? 'flex-row-reverse text-right' : ''}`}>
      <TeamLogo url={team.logoUrl} name={team.name} size="xl" />
      <PlayerStack players={team.members} size={28} />
      <span
        className={`truncate min-w-0 ${highlight ? 'font-bold text-brand-navy' : 'text-slate-700'}`}
        title={team.name}
      >
        {team.name}
      </span>
    </div>
  );
}
