import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Aviso legal — Padel League' };

const LAST_UPDATED = '29 de abril de 2026';

export default function AvisoLegalPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Información legal</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Aviso legal</h1>
        <p className="text-sm text-slate-400 mt-1">Última actualización: {LAST_UPDATED}</p>
      </div>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">1. Identificación del responsable</h2>
        <p>
          En cumplimiento de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y
          de Comercio Electrónico (LSSI-CE), se informa de los datos identificativos del responsable del
          presente sitio web (en adelante, &ldquo;Padel League&rdquo;):
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Titular:</strong> Padel League</li>
        </ul>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">2. Objeto del sitio web</h2>
        <p>
          Padel League es una plataforma privada de gestión de ligas amateur de pádel. El acceso y uso de
          la plataforma están sujetos a invitación previa por parte de un administrador de liga. La
          finalidad del servicio es facilitar la organización de partidos, calendarios, resultados y
          clasificaciones entre los participantes invitados.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">3. Condiciones de uso</h2>
        <p>El uso de la plataforma implica la aceptación de las siguientes condiciones por parte del usuario:</p>
        <ul className="list-disc list-inside space-y-1.5">
          <li>
            Hacer un uso correcto y lícito de los servicios, evitando cualquier conducta que pueda dañar la
            plataforma, su imagen, sus contenidos o a otros usuarios.
          </li>
          <li>
            No introducir, almacenar o difundir contenidos ilícitos, ofensivos, falsos, engañosos, que
            vulneren derechos de terceros o que incumplan la legislación aplicable.
          </li>
          <li>
            Mantener la confidencialidad de las credenciales de acceso. El usuario es responsable de toda
            actividad realizada bajo su cuenta.
          </li>
          <li>
            No realizar ingeniería inversa, descompilar, ni intentar acceder al código fuente, datos o
            sistemas internos de la plataforma.
          </li>
          <li>
            Aceptar que los resultados deportivos enviados deben corresponderse con la realidad del partido jugado.
          </li>
        </ul>
        <p>
          El responsable se reserva el derecho a suspender o cancelar el acceso a usuarios que incumplan
          estas condiciones, sin perjuicio de las acciones legales correspondientes.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">4. Propiedad intelectual e industrial</h2>
        <p>
          Todos los contenidos del sitio web (diseño, código, textos, gráficos, logos, marcas, nombres y
          demás elementos) son titularidad del responsable o de terceros que han autorizado su uso. Queda
          prohibida su reproducción, distribución, comunicación pública o transformación sin la
          autorización expresa del titular.
        </p>
        <p>
          Los datos generados por los usuarios (resultados, fechas, comentarios, información de equipos)
          son propiedad del usuario que los introduce, sin perjuicio de la licencia no exclusiva,
          territorial e indefinida que el usuario otorga al responsable para tratarlos con la finalidad de
          prestar el servicio.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">5. Crónicas generadas por inteligencia artificial</h2>
        <p>
          Algunas funcionalidades de la plataforma generan automáticamente comentarios o crónicas
          deportivas mediante modelos de inteligencia artificial. Estos textos son aproximaciones
          generadas a partir del contexto deportivo (nombres de equipo, marcadores y clasificación), no
          reflejan opiniones del responsable y pueden contener inexactitudes. Los administradores de liga
          pueden editar o eliminar dichos comentarios.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">6. Limitación de responsabilidad</h2>
        <p>
          El responsable hará sus mejores esfuerzos para que la plataforma esté disponible de forma
          continua, pero no garantiza la ausencia de interrupciones, errores o fallos derivados del
          funcionamiento de internet, los proveedores de infraestructura o circunstancias ajenas a su
          control.
        </p>
        <p>
          El responsable no se hace responsable de los daños y perjuicios derivados del uso indebido de la
          plataforma por parte de los usuarios, ni del contenido introducido por estos.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">7. Modificaciones</h2>
        <p>
          El responsable se reserva el derecho a modificar el presente aviso legal en cualquier momento.
          Las modificaciones se publicarán en esta misma página, indicando la fecha de la última
          actualización en la cabecera. El uso continuado de la plataforma tras la publicación de los
          cambios implica la aceptación de los mismos.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">8. Legislación aplicable y jurisdicción</h2>
        <p>
          Las presentes condiciones se rigen por la legislación española. Para la resolución de cualquier
          controversia derivada del uso de la plataforma, las partes se someten, salvo disposición legal
          en contrario, a los Juzgados y Tribunales del domicilio del responsable, salvo que el usuario
          sea consumidor, en cuyo caso aplicará el fuero que corresponda según la normativa aplicable.
        </p>
      </article>
    </div>
  );
}
