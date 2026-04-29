import Link from 'next/link';
import type { Route } from 'next';

export const metadata = { title: 'Cómo funciona — Padel League' };

type Step = { title: string; body: React.ReactNode };

const SECTIONS: Array<{ id: string; title: string; intro: string; steps: Step[] }> = [
  {
    id: 'crear-equipo',
    title: '1 · Crear un equipo',
    intro: 'Antes de jugar una liga necesitas tener un equipo de pádel. Tú mismo lo creas y luego invitas a tu pareja.',
    steps: [
      {
        title: 'Ve a "Mis equipos" y pulsa Nuevo equipo',
        body: <>Encontrarás el acceso en el menú principal o en el footer. Decide un nombre y un <strong>nivel inicial</strong> (Principiante, Intermedio o Avanzado).</>,
      },
      {
        title: 'El equipo nace con un solo miembro: tú',
        body: <>Hasta que aceptes una segunda persona, el equipo tendrá 1/2 jugadores y no podrá apuntarse a ninguna liga.</>,
      },
    ],
  },
  {
    id: 'invitar',
    title: '2 · Invitar a alguien al equipo',
    intro: 'Para tener un equipo completo necesitas a una segunda persona. Solo puede haber una invitación pendiente a la vez.',
    steps: [
      {
        title: 'Desde la página del equipo, “Invitar jugador”',
        body: <>Introduce el <strong>email o el nombre de usuario</strong> de la persona. Debe estar registrada en la app.</>,
      },
      {
        title: 'La persona recibe una notificación',
        body: <>Aparece en su panel principal y en su sección &ldquo;Mis equipos&rdquo;. Puede aceptar o rechazar.</>,
      },
      {
        title: 'Hasta que la acepte, queda como pendiente',
        body: <>Verás &ldquo;Invitación pendiente&rdquo; en la tarjeta del equipo. Puedes cancelarla en cualquier momento si te equivocaste.</>,
      },
    ],
  },
  {
    id: 'aceptar-invitacion',
    title: '3 · Aceptar (o rechazar) una invitación',
    intro: 'Cuando alguien te invita a su equipo, recibes una alerta y eliges qué hacer.',
    steps: [
      {
        title: 'Verás un aviso en "Mis equipos"',
        body: <>Aparece en la zona superior de <Link href={'/equipos' as Route} className="text-brand-blue underline">Mis equipos</Link>, con dos botones: Aceptar o Rechazar.</>,
      },
      {
        title: 'Al aceptar, te conviertes en miembro',
        body: <>El equipo pasa a 2/2 jugadores. Tanto tú como la persona que invitó podéis apuntarlo a una liga.</>,
      },
      {
        title: 'Al rechazar, el invitador recibe un aviso',
        body: <>No pasa nada más; el equipo sigue con un solo miembro y puede invitar a otra persona.</>,
      },
    ],
  },
  {
    id: 'apuntarse-liga',
    title: '4 · Apuntarse a una liga',
    intro: 'Solo durante el periodo de inscripción de una liga podrás apuntar a tu equipo. El nivel no tiene que coincidir.',
    steps: [
      {
        title: 'Mira la liga y comprueba el estado de la inscripción',
        body: <>En <Link href={'/ligas' as Route} className="text-brand-blue underline">Ligas</Link> verás el periodo de inscripción de cada liga: si está abierta podrás apuntarte; si aún no ha empezado o ya ha terminado, no.</>,
      },
      {
        title: 'Pulsa "Apuntarse" desde el detalle de la liga',
        body: <>Si tienes varios equipos elegibles (con 2 jugadores), elige con cuál te apuntas. No puedes apuntar el mismo equipo dos veces a la misma liga.</>,
      },
      {
        title: 'Al apuntarse, ambos miembros del equipo reciben un aviso',
        body: <>Lo mismo si más tarde os dais de baja: la otra persona del equipo se entera al instante.</>,
      },
    ],
  },
  {
    id: 'borrarse-liga',
    title: '5 · Borrarse de una liga',
    intro: 'Solo se permite mientras la inscripción siga abierta y la liga no haya empezado.',
    steps: [
      {
        title: 'Cualquier miembro del equipo puede dar de baja',
        body: <>Desde el detalle de la liga, junto a tu equipo apuntado, hay un botón &ldquo;Borrarse&rdquo;.</>,
      },
      {
        title: 'Si la liga ya ha empezado, ya no es posible',
        body: <>El partido se mantiene aunque cierres el equipo posteriormente.</>,
      },
    ],
  },
  {
    id: 'jugar',
    title: '6 · Jugar y registrar resultados',
    intro: 'Cuando la liga arranca, se generan automáticamente los partidos contra el resto de equipos apuntados.',
    steps: [
      {
        title: 'Encuentra tus partidos en "Mis partidos"',
        body: <>Aparecen ordenados por fecha límite. Puedes proponer una fecha de juego y la otra pareja la acepta o contrapropone.</>,
      },
      {
        title: 'Registra el resultado al acabar',
        body: <>Cualquiera de los 4 jugadores puede enviar el resultado por sets. La otra pareja confirma o discute. El sistema reconoce 2, 3 o más sets.</>,
      },
      {
        title: 'Si pasa el deadline sin jugar, ambos pierden 1 punto',
        body: <>Es el incentivo para no dejarlo. Podéis solicitar una extensión si la otra pareja la acepta.</>,
      },
    ],
  },
  {
    id: 'seguimiento',
    title: '7 · Seguir el progreso',
    intro: 'Toda la actividad de tus ligas y equipos vive en el panel principal.',
    steps: [
      {
        title: 'Dashboard',
        body: <>Vas a ver una tarjeta por liga activa con la clasificación, tu progreso de victorias/derrotas y banners de propuestas (cambios de nivel, invitaciones, etc.).</>,
      },
      {
        title: 'Crónicas',
        body: <>Cada partido jugado genera una crónica corta con humor. Aparecen en el feed de la liga y en tu dashboard.</>,
      },
      {
        title: 'Nivel del equipo',
        body: <>Si dominas una liga (≥75 % de los puntos máximos posibles) o cae estrepitosamente (≤25 %), el sistema propone subir o bajar de nivel. Cualquier miembro del equipo puede aceptar o rechazar.</>,
      },
    ],
  },
];

export default function ComoFuncionaPage() {
  return (
    <div className="space-y-10 max-w-3xl">
      <header>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Guía</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Cómo funciona Padel League</h1>
        <p className="text-slate-500 mt-2">
          Una guía rápida desde crear tu equipo hasta seguir tu progreso. Si te quedas atascado en algún paso, vuelve aquí.
        </p>
      </header>

      <nav className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Índice</p>
        <ul className="space-y-1.5 text-sm">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-brand-navy hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="space-y-3 scroll-mt-24">
          <h2 className="text-xl font-bold text-brand-navy">{s.title}</h2>
          <p className="text-sm text-slate-600">{s.intro}</p>
          <ol className="space-y-2 list-none">
            {s.steps.map((step, i) => (
              <li key={i} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <p className="text-sm font-semibold text-brand-navy mb-1">{i + 1}. {step.title}</p>
                <p className="text-sm text-slate-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <footer className="border-t border-slate-200/80 pt-6 text-sm text-slate-500">
        <p>
          ¿Sigues sin encontrar lo que buscabas? El chatbot de ayuda llega pronto. Mientras tanto, escríbenos a través de tu administrador de liga.
        </p>
      </footer>
    </div>
  );
}
