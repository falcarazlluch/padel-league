import { RegistroForm } from './registro-form';

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code = '' } = await searchParams;

  return (
    <>
      <h1 className="text-xl font-bold text-brand-navy mb-1">Crear cuenta</h1>
      <p className="text-sm text-slate-400 mb-6">Necesitas un código de invitación de un administrador.</p>
      <RegistroForm defaultCode={code} />
    </>
  );
}
