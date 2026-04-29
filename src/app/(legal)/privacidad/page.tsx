import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Política de privacidad — Padel League' };

const LAST_UPDATED = '29 de abril de 2026';

export default function PrivacidadPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Información legal</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Política de privacidad</h1>
        <p className="text-sm text-slate-400 mt-1">Última actualización: {LAST_UPDATED}</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p>
          <strong>Aviso provisional:</strong> este texto es una plantilla orientativa basada en lo que la
          plataforma realmente trata. Debe ser revisado por un profesional del derecho antes de su uso
          comercial. Los campos entre corchetes (<code>[…]</code>) deben ser completados por el responsable
          del sitio.
        </p>
      </div>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">1. Responsable del tratamiento</h2>
        <p>
          De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), el
          responsable del tratamiento de los datos personales recogidos en esta plataforma es:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Titular:</strong> [NOMBRE O RAZÓN SOCIAL]</li>
          <li><strong>NIF/CIF:</strong> [NIF/CIF]</li>
          <li><strong>Domicilio:</strong> [DIRECCIÓN POSTAL]</li>
          <li><strong>Correo electrónico:</strong> [EMAIL DE CONTACTO]</li>
        </ul>
        <p>
          Para cualquier consulta o ejercicio de derechos en materia de protección de datos puedes
          contactar a través del correo electrónico indicado.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">2. Datos personales tratados</h2>
        <p>El responsable trata exclusivamente los datos estrictamente necesarios para prestar el servicio:</p>
        <ul className="list-disc list-inside space-y-1.5">
          <li>
            <strong>Datos de cuenta:</strong> nombre o alias, dirección de correo electrónico y contraseña
            (almacenada cifrada con bcrypt; el responsable nunca conoce la contraseña original).
          </li>
          <li>
            <strong>Datos deportivos:</strong> equipo al que perteneces, partidos jugados, marcadores,
            propuestas de fechas y resultados. Estos datos pueden ser visibles para el resto de
            participantes de tu liga.
          </li>
          <li>
            <strong>Datos de uso:</strong> notificaciones internas, fechas de inicio de sesión y eventos de
            auditoría relevantes para la seguridad (cambios de contraseña, intentos de acceso fallidos,
            resoluciones de disputa).
          </li>
          <li>
            <strong>Datos técnicos:</strong> dirección IP y agente de usuario asociados a tus sesiones,
            con fines de seguridad y prevención de abuso.
          </li>
        </ul>
        <p>
          La plataforma <strong>no recoge categorías especiales de datos</strong> (salud, ideología,
          religión, etc.) ni datos de menores de 14 años.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">3. Finalidades del tratamiento y base legal</h2>
        <ul className="list-disc list-inside space-y-1.5">
          <li>
            <strong>Prestación del servicio:</strong> gestionar tu cuenta, los partidos, calendarios,
            resultados y clasificaciones. Base legal: ejecución del contrato (art. 6.1.b RGPD).
          </li>
          <li>
            <strong>Comunicaciones operativas por correo:</strong> envío de invitaciones, recuperación de
            contraseña, notificaciones relacionadas con tus partidos y disputas. Base legal: ejecución del
            contrato.
          </li>
          <li>
            <strong>Generación automática de crónicas deportivas:</strong> con el fin de ofrecer una
            experiencia más lúdica, se generan textos breves a partir de nombres de equipo, marcadores y
            clasificación. <strong>No se envían nombres ni datos individuales de jugadores</strong> a los
            proveedores de IA. Base legal: interés legítimo del responsable (art. 6.1.f RGPD).
          </li>
          <li>
            <strong>Seguridad y prevención de abuso:</strong> registros de auditoría y datos técnicos.
            Base legal: interés legítimo y cumplimiento de obligaciones legales (arts. 6.1.f y 6.1.c RGPD).
          </li>
        </ul>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">4. Plazos de conservación</h2>
        <ul className="list-disc list-inside space-y-1.5">
          <li>
            <strong>Datos de cuenta y deportivos:</strong> mientras la cuenta esté activa. Si solicitas la
            supresión, los datos se eliminan o anonimizan en un plazo máximo de 30 días, salvo que la ley
            obligue a conservarlos.
          </li>
          <li>
            <strong>Registros de auditoría y seguridad:</strong> se conservan durante un máximo de 12
            meses para prevención de fraude y resolución de incidencias.
          </li>
          <li>
            <strong>Datos contables o fiscales</strong> (en caso de existir): se conservarán durante los
            plazos legales aplicables.
          </li>
        </ul>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">5. Destinatarios y encargados de tratamiento</h2>
        <p>
          El responsable comparte determinados datos con proveedores tecnológicos que actúan como
          encargados del tratamiento, debidamente contratados conforme al art. 28 RGPD. Estos proveedores
          tratan tus datos exclusivamente para prestar el servicio que se les contrata:
        </p>
        <ul className="list-disc list-inside space-y-1.5">
          <li>
            <strong>Vercel Inc.</strong> (alojamiento de la web). Datos: IP, peticiones HTTP, datos en
            tránsito. Localización: Estados Unidos. Base de transferencia: cláusulas contractuales tipo de
            la Comisión Europea.
          </li>
          <li>
            <strong>Railway Corporation</strong> (alojamiento de base de datos). Datos: contenido de la
            base de datos. Localización: Estados Unidos / UE según región configurada.
          </li>
          <li>
            <strong>Resend Inc.</strong> (envío de correos transaccionales). Datos: dirección de correo
            electrónico, asunto y cuerpo del mensaje. Localización: Estados Unidos.
          </li>
          <li>
            <strong>OpenAI, L.L.C.</strong> (generación de crónicas deportivas mediante IA). Datos:
            nombres de equipo, marcadores, posiciones de clasificación. <strong>No se envían nombres,
            correos ni identificadores de jugadores individuales.</strong> Localización: Estados Unidos.
          </li>
          <li>
            <strong>Functional Software, Inc. (Sentry)</strong> (registro de errores). Datos: trazas de
            error, identificador de usuario seudonimizado. Localización: Estados Unidos.
          </li>
        </ul>
        <p>
          Las transferencias internacionales a Estados Unidos se realizan al amparo del marco
          UE-EE.&nbsp;UU. de Protección de la Privacidad (Data Privacy Framework) o, en su defecto, mediante
          cláusulas contractuales tipo aprobadas por la Comisión Europea.
        </p>
        <p>
          Salvo lo anterior, <strong>el responsable no comparte tus datos con terceros</strong> ni los
          vende, salvo obligación legal.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">6. Tus derechos</h2>
        <p>Como interesado, dispones de los siguientes derechos:</p>
        <ul className="list-disc list-inside space-y-1.5">
          <li><strong>Acceso:</strong> conocer qué datos tuyos tratamos.</li>
          <li><strong>Rectificación:</strong> solicitar la corrección de datos inexactos o incompletos.</li>
          <li><strong>Supresión</strong> (&ldquo;derecho al olvido&rdquo;): solicitar el borrado o anonimización de tu cuenta y datos asociados.</li>
          <li><strong>Oposición:</strong> oponerte al tratamiento basado en interés legítimo (por ejemplo, a la generación de crónicas IA sobre tus partidos).</li>
          <li><strong>Limitación:</strong> solicitar la limitación temporal del tratamiento.</li>
          <li><strong>Portabilidad:</strong> recibir tus datos en formato estructurado y de uso común.</li>
          <li><strong>Retirar el consentimiento</strong> en cualquier momento, cuando el tratamiento se base en consentimiento.</li>
        </ul>
        <p>
          Para ejercer cualquiera de estos derechos puedes escribir a <strong>[EMAIL DE CONTACTO]</strong>{' '}
          desde la dirección de correo asociada a tu cuenta. Recibirás respuesta en un plazo máximo de un mes.
        </p>
        <p>
          Si consideras que el tratamiento de tus datos no se ajusta a la normativa, puedes presentar una
          reclamación ante la <strong>Agencia Española de Protección de Datos</strong>{' '}
          (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">www.aepd.es</a>).
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">7. Seguridad</h2>
        <p>
          El responsable ha implementado medidas técnicas y organizativas para proteger los datos
          personales contra acceso no autorizado, alteración, pérdida o divulgación: cifrado en tránsito
          (HTTPS/TLS), cifrado en reposo de campos sensibles (contraseñas con bcrypt, tokens con
          ENCRYPTION_KEY), políticas de mínimos privilegios, separación de entornos, registros de
          auditoría y monitorización.
        </p>
      </article>

      <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3 text-sm text-slate-700 leading-relaxed">
        <h2 className="text-lg font-bold text-brand-navy">8. Modificaciones</h2>
        <p>
          Esta política puede ser actualizada en el futuro. Las modificaciones se publicarán en esta
          página, indicando la fecha de la última actualización. En caso de cambios sustanciales se
          notificará a los usuarios mediante un aviso en la plataforma o por correo electrónico.
        </p>
      </article>
    </div>
  );
}
