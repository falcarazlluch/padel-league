'use client';

import { useActionState, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { updateOrgBrandingAction } from './actions';

const FIELD =
  'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all';

type Initial = {
  name: string;
  tagline: string;
  logoUrl: string;
  contactEmail: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
};

export function BrandingForm({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: Initial;
}) {
  const [state, formAction, pending] = useActionState(updateOrgBrandingAction, null);

  // Held in state purely so the preview updates as you type; the form still
  // submits plain fields, so it works with JS disabled too.
  const [name, setName] = useState(initial.name);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [primary, setPrimary] = useState(initial.primaryColor);
  const [secondary, setSecondary] = useState(initial.secondaryColor);
  const [accent, setAccent] = useState(initial.accentColor);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      // Pathname must start with the org id: the API route derives the
      // authorisation target from it.
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const blob = await upload(`org-logos/${organizationId}-${Date.now()}.${ext}`, file, {
        access: 'public',
        handleUploadUrl: '/api/org-logo/upload',
      });
      setLogoUrl(blob.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo subir el logo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <BrandPreview name={name} logoUrl={logoUrl} primary={primary} secondary={secondary} accent={accent} />

      <form action={formAction} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="contactEmail" className="block text-sm font-medium text-slate-700 mb-1">
              Email de contacto
            </label>
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={initial.contactEmail}
              placeholder="padel@club.es"
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <label htmlFor="tagline" className="block text-sm font-medium text-slate-700 mb-1">
            Lema
          </label>
          <input
            id="tagline"
            name="tagline"
            type="text"
            maxLength={140}
            defaultValue={initial.tagline}
            placeholder="Competiciones de pádel para socios"
            className={FIELD}
          />
          <p className="text-xs text-slate-400 mt-1">
            Se ve en la landing del enlace de inscripción y en la descripción de la app instalada.
          </p>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-slate-700">Logo</span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
              {uploading ? 'Subiendo...' : 'Subir imagen'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                disabled={uploading}
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
            </label>
            {logoUrl && (
              <button
                type="button"
                onClick={() => setLogoUrl('')}
                className="text-xs text-red-600 font-semibold hover:underline"
              >
                Quitar logo
              </button>
            )}
          </div>
          {/* The URL is what actually gets saved, so keep it visible and
              editable: an admin may prefer to point at an existing asset. */}
          <input
            id="logoUrl"
            name="logoUrl"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
            className={`${FIELD} font-mono text-xs`}
          />
          <p className="text-xs text-slate-400">
            PNG, JPG, WebP o SVG, máximo 4 MB. Se recorta solo lo que sobre; un logo apaisado y sin
            mucho margen se lee mejor en la barra de navegación.
          </p>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-700">Colores</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ColorField
              name="primaryColor"
              label="Principal"
              hint="Barra de navegación, botones y titulares."
              value={primary}
              onChange={setPrimary}
            />
            <ColorField
              name="secondaryColor"
              label="Secundario"
              hint="Enlaces y textos destacados sobre blanco."
              value={secondary}
              onChange={setSecondary}
            />
            <ColorField
              name="accentColor"
              label="Acento"
              hint="Pestaña activa y detalles."
              value={accent}
              onChange={setAccent}
            />
          </div>
          <p className="text-xs text-slate-400">
            El principal lleva texto blanco encima, así que necesita ser oscuro. El secundario se usa
            sobre fondo blanco, así que un amarillo o un tono muy claro no se leería.
          </p>
        </fieldset>

        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {state.success}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || uploading}
          className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Guardando...' : 'Guardar identidad'}
        </button>
      </form>
    </div>
  );
}

function ColorField({
  name,
  label,
  hint,
  value,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={name}
          name={name}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded-lg border border-gray-200 bg-white cursor-pointer shrink-0"
        />
        <span className="text-xs font-mono text-slate-500">{value.toUpperCase()}</span>
      </div>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
    </div>
  );
}

/**
 * Mock of the real nav bar and a card. The point is to catch the two mistakes
 * that are easy to make and awkward to discover in production: a light primary
 * (white nav text disappears) and a pale secondary (unreadable links).
 */
function BrandPreview({
  name,
  logoUrl,
  primary,
  secondary,
  accent,
}: {
  name: string;
  logoUrl: string;
  primary: string;
  secondary: string;
  accent: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden bg-white">
      <p className="px-4 pt-3 text-xs font-bold uppercase tracking-widest text-slate-400">
        Vista previa
      </p>
      <div className="p-4 space-y-3">
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: `linear-gradient(to right, ${primary}, ${mix(primary, 22)})` }}
        >
          <span className="flex items-center gap-2 min-w-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-8 w-auto max-w-[7rem] object-contain" />
            ) : (
              <span className="font-black text-white truncate">{name || 'Tu club'}</span>
            )}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full border"
              style={{ color: accent, borderColor: `${accent}55`, background: `${accent}22` }}
            >
              Competiciones
            </span>
            <span className="text-xs text-white/70">Partidos</span>
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 p-3 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: secondary }}>
            Temporada 2026
          </p>
          <p className="text-sm font-extrabold" style={{ color: primary }}>
            Torneo de socios
          </p>
          <p className="text-xs text-slate-500">
            Un enlace de ejemplo:{' '}
            <span className="underline" style={{ color: secondary }}>
              ver clasificación
            </span>
          </p>
          <div className="pt-1">
            <span
              className="inline-block text-xs font-bold text-white px-3 py-1.5 rounded-lg"
              style={{ background: primary }}
            >
              Apuntarme
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Lightens a hex colour towards white by `pct`, mirroring the app's gradient. */
function mix(hex: string, pct: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = Number.parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const up = (c: number) => Math.round(c + (255 - c) * (pct / 100));
  return `#${[up(r), up(g), up(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
