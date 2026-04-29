import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reglamento — Padel League' };

export default function ReglamentoPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Documentación</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Reglamento</h1>
        <p className="text-sm text-slate-400 mt-1">Cómo funcionan las ligas, los partidos y el sistema de puntos.</p>
      </div>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Sistema de puntos</h2>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li><strong>Ganar partido:</strong> 3 puntos</li>
          <li><strong>Empatar:</strong> 1 punto</li>
          <li><strong>Perder:</strong> 0 puntos</li>
          <li><strong>No jugar</strong> (deadline expirado): −1 punto para ambos equipos</li>
        </ul>
        <p className="text-sm text-slate-600">
          La clasificación ordena por: puntos → diferencia de sets → diferencia de juegos → sets ganados.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Reglas de los partidos</h2>
        <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
          <li>Todos los partidos son al <strong>mejor de 3 sets</strong>.</li>
          <li>Cada equipo está formado por <strong>2 jugadores</strong>.</li>
          <li>Una vez jugado el partido, cualquier jugador puede enviar el resultado.</li>
          <li>El equipo rival tiene <strong>7 días</strong> para confirmar o disputar.</li>
          <li>Si pasan 7 días sin respuesta, el resultado se aprueba automáticamente.</li>
          <li>En caso de disputa, un administrador resuelve.</li>
        </ul>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-brand-navy">Calendario y jornadas</h2>
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
        <h2 className="text-lg font-bold text-brand-navy">Disputas</h2>
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
