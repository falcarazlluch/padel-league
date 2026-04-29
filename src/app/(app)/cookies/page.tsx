import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Política de cookies — Padel League' };

const LAST_UPDATED = '29 de abril de 2026';

export default function CookiesPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Información legal</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Política de cookies</h1>
        <p className="text-sm text-slate-400 mt-1">Última actualización: {LAST_UPDATED}</p>
      </div>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">1. ¿Qué son las cookies?</h2>
        <p>
          Las cookies son pequeños archivos de texto que se almacenan en tu navegador cuando visitas un
          sitio web. Permiten al sitio reconocer tu sesión, mantener tus preferencias y proporcionar
          determinadas funcionalidades.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">2. Cookies utilizadas en Padel League</h2>
        <p>
          Padel League utiliza <strong>únicamente cookies técnicas estrictamente necesarias</strong> para
          el funcionamiento del servicio. No se utilizan cookies de analítica, publicidad, perfilado ni
          ningún tipo de cookie de terceros con fines comerciales.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-lg">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-brand-navy">Nombre</th>
                <th className="text-left px-3 py-2 font-semibold text-brand-navy">Finalidad</th>
                <th className="text-left px-3 py-2 font-semibold text-brand-navy">Duración</th>
                <th className="text-left px-3 py-2 font-semibold text-brand-navy">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-2 font-mono">padel_session</td>
                <td className="px-3 py-2">Mantener tu sesión iniciada de forma segura.</td>
                <td className="px-3 py-2">Sesión / hasta cierre de sesión</td>
                <td className="px-3 py-2">Técnica propia</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">__Host-csrf</td>
                <td className="px-3 py-2">
                  Token anti-falsificación de peticiones (CSRF) para proteger formularios.
                </td>
                <td className="px-3 py-2">Sesión</td>
                <td className="px-3 py-2">Técnica propia</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          Las cookies técnicas estrictamente necesarias <strong>no requieren consentimiento previo</strong>{' '}
          según la normativa vigente (LSSI-CE, art. 22.2; Guía de la AEPD sobre cookies).
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">3. Almacenamiento local del navegador</h2>
        <p>
          La plataforma puede utilizar de forma puntual el almacenamiento local del navegador
          (<code>localStorage</code> / <code>sessionStorage</code>) para guardar preferencias de interfaz no
          identificativas (por ejemplo, el último estado de un formulario abierto). Estos datos
          permanecen exclusivamente en tu dispositivo y no se transmiten al servidor.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">4. Cómo gestionar las cookies</h2>
        <p>
          Puedes configurar tu navegador para aceptar, rechazar o eliminar cookies en cualquier momento.
          Ten en cuenta que, al ser cookies estrictamente necesarias, su rechazo impedirá el acceso a la
          plataforma (no podrás iniciar sesión).
        </p>
        <p>Instrucciones por navegador:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer"
              className="text-brand-blue hover:underline">
              Google Chrome
            </a>
          </li>
          <li>
            <a href="https://support.mozilla.org/es/kb/habilitar-y-deshabilitar-cookies-sitios-web-rastrear-preferencias" target="_blank" rel="noopener noreferrer"
              className="text-brand-blue hover:underline">
              Mozilla Firefox
            </a>
          </li>
          <li>
            <a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer"
              className="text-brand-blue hover:underline">
              Safari
            </a>
          </li>
          <li>
            <a href="https://support.microsoft.com/es-es/microsoft-edge/eliminar-las-cookies-en-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer"
              className="text-brand-blue hover:underline">
              Microsoft Edge
            </a>
          </li>
        </ul>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">5. Cambios en la política de cookies</h2>
        <p>
          Si en el futuro se incorporan nuevas cookies (técnicas o de terceros), esta política se
          actualizará y se mostrará un banner de consentimiento previo en caso de que la normativa lo
          exija. La fecha de la última actualización se indica en la cabecera de esta página.
        </p>
      </article>
    </div>
  );
}
