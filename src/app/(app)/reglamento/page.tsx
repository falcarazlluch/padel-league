import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reglamento — Padel League' };

export default function ReglamentoPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Documentación</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Reglamento</h1>
        <p className="text-sm text-slate-400 mt-1">
          Cómo funcionan las competiciones, los partidos y el sistema de puntos.
        </p>
      </div>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Tipos de competición</h2>
        <p className="text-sm text-slate-600">
          Al crear una competición, el administrador elige uno de estos tres formatos. Cada uno tiene
          sus propias reglas de inscripción, calendario y clasificación.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-widest">Liga</p>
            <p className="text-sm text-slate-700 mt-1">
              Round-robin entre parejas: todas juegan contra todas. Clasificación por puntos. La opción
              clásica para temporadas largas.
            </p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
            <p className="text-xs font-bold text-purple-700 uppercase tracking-widest">Americana</p>
            <p className="text-sm text-slate-700 mt-1">
              Formato social rotatorio en un solo día. Variantes: <strong>rotación individual</strong>
              (cambia la pareja cada ronda) o <strong>parejas fijas</strong>.
            </p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
            <p className="text-xs font-bold text-orange-700 uppercase tracking-widest">Torneo</p>
            <p className="text-sm text-slate-700 mt-1">
              Eliminación directa con cuadro de Oro (ganadores) y Plata (perdedores de primera ronda).
              Opcionalmente con fase de grupos previa.
            </p>
          </div>
        </div>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Liga</h2>
        <p className="text-sm font-semibold text-slate-700">Sistema de puntos</p>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li><strong>Ganar partido:</strong> 3 puntos</li>
          <li><strong>Empatar:</strong> 1 punto</li>
          <li><strong>Perder:</strong> 0 puntos</li>
          <li><strong>No jugar</strong> (deadline expirado): −1 punto para ambos equipos</li>
        </ul>
        <p className="text-sm text-slate-600">
          La clasificación ordena por: puntos → diferencia de sets → diferencia de juegos → sets ganados.
        </p>

        <p className="text-sm font-semibold text-slate-700 mt-3">Reglas de los partidos</p>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>El número de sets es <strong>flexible</strong> (entre 2 y 5). Gana el partido el equipo que gane más sets.</li>
          <li>Cada equipo está formado por <strong>2 jugadores</strong>.</li>
          <li>Una vez jugado el partido, cualquier jugador puede enviar el resultado set a set.</li>
          <li>El equipo rival tiene <strong>7 días</strong> para confirmar o disputar.</li>
          <li>Si pasan 7 días sin respuesta, el resultado se aprueba automáticamente.</li>
        </ul>

        <p className="text-sm font-semibold text-slate-700 mt-3">Calendario y jornadas</p>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>El calendario se genera automáticamente al activar la liga (round-robin).</li>
          <li>Cada jornada tiene una <strong>fecha límite</strong> (deadline).</li>
          <li>Antes del deadline, los dos equipos deben acordar fecha y hora del partido.</li>
          <li>Cualquier jugador puede proponer fecha; el equipo rival acepta o propone otra.</li>
          <li>Si llega el deadline sin partido jugado, cuenta como <strong>no jugado</strong> (−1 punto a cada equipo).</li>
          <li>
            Antes de que llegue el deadline, cualquier equipo puede <strong>proponer extender el plazo</strong>.
            El rival debe aceptarlo. Una vez aceptado, el nuevo deadline sustituye al anterior.
          </li>
          <li>Las extensiones son ilimitadas, siempre dentro del rango de fechas de la liga.</li>
          <li>Una vez expirado un partido, no se puede revivir.</li>
        </ul>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Americana</h2>
        <p className="text-sm text-slate-600">
          Evento social de un día con rondas cortas en paralelo. El admin configura al crear: variante,
          formato de ronda y número de pistas.
        </p>

        <p className="text-sm font-semibold text-slate-700 mt-3">Variantes</p>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>
            <strong>Rotación individual</strong> (4–16 jugadores): cada jugador se inscribe en solitario.
            En cada ronda se forman parejas nuevas. El algoritmo minimiza partners repetidos.
            La clasificación es <strong>individual</strong>.
          </li>
          <li>
            <strong>Parejas fijas</strong>: las parejas se inscriben como equipo. Los rivales rotan cada
            ronda. La clasificación es <strong>por pareja</strong>.
          </li>
        </ul>

        <p className="text-sm font-semibold text-slate-700 mt-3">Formato de cada ronda</p>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li><strong>Primero a N games</strong> (configurable, default 8): la ronda termina cuando una pareja llega a N games.</li>
          <li><strong>Por tiempo</strong> (X minutos, default 20): se cuentan los games ganados al sonar el timer.</li>
          <li>Se juega <strong>un único set</strong> por ronda.</li>
        </ul>

        <p className="text-sm font-semibold text-slate-700 mt-3">Pistas y rondas</p>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>El admin indica el número de pistas paralelas (1–4).</li>
          <li>El número de rondas se ajusta automáticamente al número de inscritos (típicamente 3–8 rondas).</li>
          <li>Si hay más jugadores que slots simultáneos, algunos descansan cada ronda (el algoritmo balancea descansos).</li>
        </ul>

        <p className="text-sm font-semibold text-slate-700 mt-3">Resultados y clasificación</p>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>Cualquier participante del partido puede enviar el resultado de su ronda.</li>
          <li>Un jugador de la pareja rival lo confirma o lo disputa.</li>
          <li>La clasificación se ordena por <strong>games a favor</strong>, luego por diferencia (favor − contra), luego por nombre.</li>
        </ul>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Torneo</h2>
        <p className="text-sm text-slate-600">
          Eliminación directa con dos cuadros: <strong>Oro</strong> para los ganadores y
          <strong> Plata</strong> de consolación para los perdedores de la primera ronda. Opcionalmente,
          se juega antes una <strong>fase de grupos</strong> que decide qué parejas entran al cuadro.
        </p>

        <p className="text-sm font-semibold text-slate-700 mt-3">Fase de grupos (opcional)</p>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>El admin elige el número de grupos, parejas por grupo y clasificados por grupo.</li>
          <li>Las parejas inscritas se reparten en serpentina (snake) para balancear los grupos.</li>
          <li>Dentro de cada grupo se juega round-robin con las mismas reglas de puntos que la Liga.</li>
          <li>Los primeros clasificados de cada grupo entran al bracket Oro; el bracket se materializa cuando el admin cierra la fase de grupos.</li>
        </ul>

        <p className="text-sm font-semibold text-slate-700 mt-3">Bracket Oro y Plata</p>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>El bracket Oro es eliminación directa: el ganador de cada cruce pasa a la siguiente ronda.</li>
          <li>Si el número de inscritos no es potencia de 2, los top seeds reciben <strong>bye</strong> automático en primera ronda.</li>
          <li>El bracket Plata recoge a los perdedores de la primera ronda del Oro: una eliminación directa entre ellos para repartir los puestos consolación.</li>
          <li>La siembra inicial es <strong>automática</strong> (cruzada desde la clasificación de grupos, o aleatoria reproducible sin grupos). El admin puede sobreescribirla antes de empezar el bracket.</li>
        </ul>

        <p className="text-sm font-semibold text-slate-700 mt-3">Reglas de los partidos</p>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>Mismas reglas que la Liga: sets flexibles (2–5), submit + confirm/dispute en 7 días, auto-aprobación si nadie responde.</li>
          <li>Al confirmarse un partido del bracket, el ganador se propaga automáticamente al siguiente cruce.</li>
          <li>Si una pareja se cae antes de empezar el bracket, el admin puede sustituir su slot.</li>
        </ul>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Disputas (todos los formatos)</h2>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>Si un equipo no está de acuerdo con un resultado enviado, puede disputarlo dentro de los 7 días.</li>
          <li>La disputa la resuelve un administrador con visibilidad sobre el contexto del partido.</li>
          <li>
            Resoluciones posibles: dar el partido al equipo X, dar el partido al equipo Y,
            marcar como no jugado, o desestimar la disputa.
          </li>
        </ul>
      </article>
    </div>
  );
}
