import type { ChecklistItem } from '../domain/types';

/**
 * The "¿me falta algo?" answer, rendered identically in the wizard's last step,
 * the status page and the dashboard banner. One component means the three
 * surfaces can never disagree about whether the player is in.
 */
export function EnrollmentChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="space-y-2" aria-label="Estado de tu inscripción">
      {items.map((item) => (
        <li
          key={item.key}
          className={`flex items-start gap-3 rounded-xl border p-3 ${STATE_BOX[item.state]}`}
        >
          <StateIcon state={item.state} />
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${STATE_TEXT[item.state]}`}>{item.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const STATE_BOX: Record<ChecklistItem['state'], string> = {
  done: 'bg-emerald-50/70 border-emerald-200',
  pending: 'bg-amber-50/70 border-amber-200',
  blocked: 'bg-slate-50 border-slate-200',
};

const STATE_TEXT: Record<ChecklistItem['state'], string> = {
  done: 'text-emerald-800',
  pending: 'text-amber-800',
  blocked: 'text-slate-700',
};

function StateIcon({ state }: { state: ChecklistItem['state'] }) {
  const common = 'h-5 w-5 shrink-0 mt-0.5';
  if (state === 'done') {
    return (
      <svg className={`${common} text-emerald-600`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (state === 'pending') {
    return (
      <svg className={`${common} text-amber-600`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2 2a1 1 0 001.414-1.414L11 9.586V6z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg className={`${common} text-slate-400`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="10" cy="10" r="7" strokeDasharray="3 3" />
    </svg>
  );
}
