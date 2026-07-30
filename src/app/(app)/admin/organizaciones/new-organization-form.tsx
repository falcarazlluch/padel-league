'use client';

import { useActionState, useState } from 'react';
import { createOrganizationAction } from './actions';

const FIELD =
  'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all';

export function NewOrganizationForm({ domain }: { domain: string }) {
  const [state, formAction, pending] = useActionState(createOrganizationAction, null);
  const [slug, setSlug] = useState('');

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input id="name" name="name" type="text" required maxLength={80} placeholder="RACC" className={FIELD} />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-slate-700 mb-1">
            Identificador / subdominio <span className="text-red-500">*</span>
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="racc"
            className={`${FIELD} font-mono`}
          />
          <p className="text-xs text-slate-400 mt-1">
            {slug ? `${slug}.${domain}` : `<identificador>.${domain}`}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="tagline" className="block text-sm font-medium text-slate-700 mb-1">
          Lema <span className="text-slate-400 font-normal">(opcional)</span>
        </label>
        <input
          id="tagline"
          name="tagline"
          type="text"
          maxLength={140}
          placeholder="Competiciones de pádel para socios"
          className={FIELD}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="logoUrl" className="block text-sm font-medium text-slate-700 mb-1">
            URL del logo <span className="text-slate-400 font-normal">(opcional)</span>
          </label>
          <input id="logoUrl" name="logoUrl" type="url" placeholder="https://..." className={FIELD} />
        </div>
        <div>
          <label htmlFor="contactEmail" className="block text-sm font-medium text-slate-700 mb-1">
            Email de contacto <span className="text-slate-400 font-normal">(opcional)</span>
          </label>
          <input id="contactEmail" name="contactEmail" type="email" className={FIELD} />
        </div>
      </div>

      <fieldset className="grid grid-cols-3 gap-4">
        <legend className="text-sm font-medium text-slate-700 mb-1">Colores de marca</legend>
        <ColorField name="primaryColor" label="Principal" defaultValue="#0D1E45" />
        <ColorField name="secondaryColor" label="Secundario" defaultValue="#5BB8D4" />
        <ColorField name="accentColor" label="Acento" defaultValue="#F9C920" />
      </fieldset>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? 'Creando...' : 'Crear organización'}
      </button>
    </form>
  );
}

function ColorField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-slate-500 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={name}
          name={name}
          type="color"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 w-12 rounded-lg border border-gray-200 bg-white cursor-pointer"
        />
        <span className="text-xs font-mono text-slate-500">{value}</span>
      </div>
    </div>
  );
}
