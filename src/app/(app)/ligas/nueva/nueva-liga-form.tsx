'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CompetitionType, AmericanaVariant, AmericanaRoundFormat, BracketSeeding } from '@prisma/client';
import { CATEGORY_LABEL, CATEGORY_VALUES } from '@/modules/leagues/presentation/category';
import {
  COMPETITION_TYPE_LABEL,
  COMPETITION_TYPE_DESCRIPTION,
  COMPETITION_TYPE_BADGE_CLASS,
} from '@/modules/leagues/presentation/competition-type';
import { createLeagueAction } from '../actions';

// Wizard de 3 pasos para crear una Competición.
// Paso 1: Tipo (Liga / Americana / Torneo).
// Paso 2: Datos base (nombre, descripción, categoría, fechas).
// Paso 3: Configuración específica por tipo.
//
// Mantenemos useActionState para arrastrar el `error` del server. Los valores
// los maneja React local; en `onSubmit` armamos un FormData con todos los
// campos visibles + ocultos y se lo pasamos al action.

type Step = 1 | 2 | 3;

const TYPES: CompetitionType[] = ['LEAGUE', 'AMERICANA', 'TOURNAMENT'];

// Default sensato para que el usuario solo elija pocos campos: arrancamos
// hoy y empujamos el inicio una semana adelante. El admin puede editar
// luego desde "Editar competición".
function defaultDates() {
  const today = new Date();
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  const inDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };
  return {
    registrationStart: isoDate(today),
    registrationEnd: isoDate(inDays(7)),
    startDate: isoDate(inDays(10)),
    endDate: isoDate(inDays(40)),
  };
}

export function NuevaLigaForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createLeagueAction, null);

  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<CompetitionType>('LEAGUE');

  // Paso 2 — datos base
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORY_VALUES)[number]>('INTERMEDIATE');
  const [dates, setDates] = useState(defaultDates);

  // Paso 3 — Americana
  const [americanaVariant, setAmericanaVariant] = useState<AmericanaVariant>('ROTATING_INDIVIDUAL');
  const [americanaRoundFormat, setAmericanaRoundFormat] = useState<AmericanaRoundFormat>('FIRST_TO_GAMES');
  const [americanaTargetGames, setAmericanaTargetGames] = useState('8');
  const [americanaRoundMinutes, setAmericanaRoundMinutes] = useState('20');
  const [americanaCourts, setAmericanaCourts] = useState('2');

  // Paso 3 — Torneo
  const [hasGroupPhase, setHasGroupPhase] = useState(false);
  const [groupCount, setGroupCount] = useState('2');
  const [teamsPerGroup, setTeamsPerGroup] = useState('4');
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState('2');
  const [bracketSeedingMode, setBracketSeedingMode] = useState<BracketSeeding>('AUTO');

  // Derivaciones por tipo para los campos ocultos:
  //  - Americana es de un día: registrationEnd = startDate, endDate = startDate + 1
  //    (el validador del servicio exige endDate estrictamente > startDate).
  //  - Torneo: endDate placeholder = startDate + 30d hasta que el bracket
  //    determine la fecha real al confirmarse las llaves.
  const effectiveDates = (() => {
    const addDays = (iso: string, days: number): string => {
      const d = new Date(iso);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    if (type === 'AMERICANA') {
      return {
        ...dates,
        registrationEnd: dates.startDate,
        endDate: addDays(dates.startDate, 1),
      };
    }
    if (type === 'TOURNAMENT') {
      return {
        ...dates,
        endDate: addDays(dates.startDate, 30),
      };
    }
    return dates;
  })();

  const canAdvanceStep2 =
    name.trim().length >= 2 &&
    dates.registrationStart &&
    dates.startDate &&
    (type !== 'LEAGUE' || (dates.registrationEnd && dates.endDate));

  return (
    <form action={formAction} className="space-y-6">
      {/* Stepper */}
      <ol className="flex items-center gap-2 text-xs font-semibold">
        {([1, 2, 3] as const).map((s) => (
          <li key={s} className="flex-1 flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center ${
                step >= s ? 'bg-brand-navy text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {s}
            </span>
            <span className={`hidden sm:inline ${step >= s ? 'text-brand-navy' : 'text-slate-400'}`}>
              {s === 1 ? 'Tipo' : s === 2 ? 'Datos' : 'Configuración'}
            </span>
            {s < 3 && <span className="flex-1 h-px bg-slate-200" />}
          </li>
        ))}
      </ol>

      {state?.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {state.error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        {/* Paso 1: Tipo */}
        {step === 1 && (
          <>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Elige el tipo</h2>
            <div className="grid gap-3">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`text-left rounded-xl border-2 p-4 transition-all ${
                    type === t
                      ? 'border-brand-navy bg-brand-navy/5'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${COMPETITION_TYPE_BADGE_CLASS[t]}`}>
                      {COMPETITION_TYPE_LABEL[t]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{COMPETITION_TYPE_DESCRIPTION[t]}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Paso 2: Datos base */}
        {step === 2 && (
          <>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Datos básicos</h2>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                type="text"
                placeholder="Ej: Verano 2026"
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
                Descripción
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Descripción opcional…"
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all resize-none"
              />
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
                Nivel
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof CATEGORY_VALUES)[number])}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
              >
                {CATEGORY_VALUES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </div>

            {/* Fechas — distintos campos visibles por tipo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="registrationStart" className="block text-sm font-medium text-slate-700 mb-1">
                  Inicio inscripción <span className="text-red-500">*</span>
                </label>
                <input
                  id="registrationStart"
                  type="date"
                  value={dates.registrationStart}
                  onChange={(e) => setDates((d) => ({ ...d, registrationStart: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                />
              </div>
              {(type === 'LEAGUE' || type === 'TOURNAMENT') && (
                <div>
                  <label htmlFor="registrationEnd" className="block text-sm font-medium text-slate-700 mb-1">
                    Cierre inscripción <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="registrationEnd"
                    type="date"
                    value={dates.registrationEnd}
                    onChange={(e) => setDates((d) => ({ ...d, registrationEnd: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                  />
                </div>
              )}
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-1">
                  {type === 'AMERICANA' ? 'Fecha del evento' : 'Inicio competición'} <span className="text-red-500">*</span>
                </label>
                <input
                  id="startDate"
                  type="date"
                  value={dates.startDate}
                  onChange={(e) => setDates((d) => ({ ...d, startDate: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                />
              </div>
              {type === 'LEAGUE' && (
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 mb-1">
                    Fin competición <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    value={dates.endDate}
                    onChange={(e) => setDates((d) => ({ ...d, endDate: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                  />
                </div>
              )}
            </div>
            {type === 'AMERICANA' && (
              <p className="text-xs text-slate-500">
                En una Americana la inscripción se cierra justo al empezar el evento, y el evento dura un día.
              </p>
            )}
            {type === 'TOURNAMENT' && (
              <p className="text-xs text-slate-500">
                La fecha de fin del torneo se calcula automáticamente a partir de los partidos del cuadro.
              </p>
            )}
          </>
        )}

        {/* Paso 3: Configuración específica */}
        {step === 3 && type === 'LEAGUE' && (
          <>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Liga — confirmar</h2>
            <p className="text-sm text-slate-600">
              Crearemos una Liga round-robin: todas las parejas inscritas se enfrentan entre sí. Cuando estés listo
              para empezar, podrás activarla desde la página de la competición.
            </p>
          </>
        )}

        {step === 3 && type === 'AMERICANA' && (
          <>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Americana — configuración</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Variante</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(['ROTATING_INDIVIDUAL', 'FIXED_PAIRS'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmericanaVariant(v)}
                    className={`text-left rounded-xl border-2 p-3 transition-all ${
                      americanaVariant === v ? 'border-brand-navy bg-brand-navy/5' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {v === 'ROTATING_INDIVIDUAL' ? 'Rotación individual' : 'Parejas fijas'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {v === 'ROTATING_INDIVIDUAL'
                        ? 'Cada jugador se inscribe solo. Las parejas cambian cada ronda.'
                        : 'Cada pareja se inscribe junta. Los rivales rotan cada ronda.'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Formato de cada ronda</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(['FIRST_TO_GAMES', 'BY_TIME'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setAmericanaRoundFormat(f)}
                    className={`text-left rounded-xl border-2 p-3 transition-all ${
                      americanaRoundFormat === f ? 'border-brand-navy bg-brand-navy/5' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {f === 'FIRST_TO_GAMES' ? 'Primero a N games' : 'Por tiempo'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {f === 'FIRST_TO_GAMES'
                        ? 'La ronda termina cuando una pareja llega a N games.'
                        : 'La ronda dura X minutos; ganan los games ganados al sonar el timer.'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {americanaRoundFormat === 'FIRST_TO_GAMES' ? (
                <div>
                  <label htmlFor="americanaTargetGames" className="block text-sm font-medium text-slate-700 mb-1">
                    Games por ronda
                  </label>
                  <input
                    id="americanaTargetGames"
                    type="number"
                    min={4}
                    max={16}
                    value={americanaTargetGames}
                    onChange={(e) => setAmericanaTargetGames(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="americanaRoundMinutes" className="block text-sm font-medium text-slate-700 mb-1">
                    Minutos por ronda
                  </label>
                  <input
                    id="americanaRoundMinutes"
                    type="number"
                    min={5}
                    max={90}
                    value={americanaRoundMinutes}
                    onChange={(e) => setAmericanaRoundMinutes(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                  />
                </div>
              )}
              <div>
                <label htmlFor="americanaCourts" className="block text-sm font-medium text-slate-700 mb-1">
                  Pistas paralelas
                </label>
                <input
                  id="americanaCourts"
                  type="number"
                  min={1}
                  max={4}
                  value={americanaCourts}
                  onChange={(e) => setAmericanaCourts(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                />
              </div>
            </div>
          </>
        )}

        {step === 3 && type === 'TOURNAMENT' && (
          <>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Torneo — configuración</h2>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasGroupPhase}
                onChange={(e) => setHasGroupPhase(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-slate-800">Con fase de grupos previa</span>
                <span className="block text-xs text-slate-500">
                  Round-robin dentro de cada grupo y luego eliminación con Oro y Plata. Si lo dejas desactivado,
                  el torneo va directo a eliminación.
                </span>
              </span>
            </label>
            {hasGroupPhase && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="groupCount" className="block text-sm font-medium text-slate-700 mb-1">
                    Nº de grupos
                  </label>
                  <input
                    id="groupCount"
                    type="number"
                    min={2}
                    max={16}
                    value={groupCount}
                    onChange={(e) => setGroupCount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="teamsPerGroup" className="block text-sm font-medium text-slate-700 mb-1">
                    Parejas por grupo
                  </label>
                  <input
                    id="teamsPerGroup"
                    type="number"
                    min={3}
                    max={16}
                    value={teamsPerGroup}
                    onChange={(e) => setTeamsPerGroup(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="qualifiersPerGroup" className="block text-sm font-medium text-slate-700 mb-1">
                    Clasificados por grupo
                  </label>
                  <input
                    id="qualifiersPerGroup"
                    type="number"
                    min={1}
                    max={8}
                    value={qualifiersPerGroup}
                    onChange={(e) => setQualifiersPerGroup(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Siembra del bracket</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(['AUTO', 'MANUAL'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBracketSeedingMode(m)}
                    className={`text-left rounded-xl border-2 p-3 transition-all ${
                      bracketSeedingMode === m ? 'border-brand-navy bg-brand-navy/5' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {m === 'AUTO' ? 'Automática' : 'Manual'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {m === 'AUTO'
                        ? 'Cruzado clásico desde la clasificación de grupos (o aleatoria reproducible si no hay grupos).'
                        : 'Tú decides la siembra a mano antes de iniciar el bracket.'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Hidden inputs con todos los valores. El form solo se envía en el paso 3. */}
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="registrationStart" value={effectiveDates.registrationStart} />
        <input type="hidden" name="registrationEnd" value={effectiveDates.registrationEnd} />
        <input type="hidden" name="startDate" value={effectiveDates.startDate} />
        <input type="hidden" name="endDate" value={effectiveDates.endDate} />

        {type === 'AMERICANA' && (
          <>
            <input type="hidden" name="americanaVariant" value={americanaVariant} />
            <input type="hidden" name="americanaRoundFormat" value={americanaRoundFormat} />
            <input
              type="hidden"
              name="americanaTargetGames"
              value={americanaRoundFormat === 'FIRST_TO_GAMES' ? americanaTargetGames : ''}
            />
            <input
              type="hidden"
              name="americanaRoundMinutes"
              value={americanaRoundFormat === 'BY_TIME' ? americanaRoundMinutes : ''}
            />
            <input type="hidden" name="americanaCourts" value={americanaCourts} />
          </>
        )}
        {type === 'TOURNAMENT' && (
          <>
            <input type="hidden" name="hasGroupPhase" value={hasGroupPhase ? 'true' : 'false'} />
            <input type="hidden" name="groupCount" value={hasGroupPhase ? groupCount : ''} />
            <input type="hidden" name="teamsPerGroup" value={hasGroupPhase ? teamsPerGroup : ''} />
            <input type="hidden" name="qualifiersPerGroup" value={hasGroupPhase ? qualifiersPerGroup : ''} />
            <input type="hidden" name="bracketSeedingMode" value={bracketSeedingMode} />
          </>
        )}
      </div>

      {/* Navegación */}
      <div className="flex gap-3">
        {step === 1 ? (
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            ← Atrás
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            onClick={() => {
              if (step === 2 && !canAdvanceStep2) return;
              setStep((s) => ((s + 1) as Step));
            }}
            disabled={step === 2 && !canAdvanceStep2}
            className="flex-1 px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Continuar →
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="flex-1 px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {pending ? 'Creando…' : 'Crear competición'}
          </button>
        )}
      </div>
    </form>
  );
}
