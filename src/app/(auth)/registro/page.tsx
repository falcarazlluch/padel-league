import { RegistroForm } from './registro-form';
import { InviteLinkService, EnrollmentService } from '@/modules/organizations';

/**
 * Three ways in, all rendered by the same form:
 *  - `code`          — the platform's classic admin-issued registration code.
 *  - `inviteToken`   — a tournament inscription link. The link IS the invitation,
 *                      so the code field disappears.
 *  - `partnerToken`  — a partner invite for someone with no account yet. Same
 *                      deal, and we can prefill the email we were given.
 */
export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; inviteToken?: string; partnerToken?: string; next?: string }>;
}) {
  const { code = '', inviteToken = '', partnerToken = '', next = '' } = await searchParams;

  // Resolve whichever token was supplied so the copy names the real
  // competition — and so a bogus token falls back to requiring a code rather
  // than silently granting free registration.
  const invitePreview = inviteToken ? await InviteLinkService.preview(inviteToken) : null;
  const partnerInvite = partnerToken
    ? await EnrollmentService.getPartnerInvite(partnerToken, null)
    : null;

  const inviteUsable = invitePreview !== null && invitePreview.blockedReason === null;
  const partnerUsable = partnerInvite !== null && partnerInvite.blockedReason === null;
  const codeless = inviteUsable || partnerUsable;

  const contextLine = inviteUsable
    ? `Te apuntas a ${invitePreview.competition.name} · ${invitePreview.organization.name}.`
    : partnerUsable
      ? `${partnerInvite.inviter.name} te invita como pareja en ${partnerInvite.competition.name}.`
      : null;

  return (
    <>
      <h1 className="text-xl font-bold text-brand-navy mb-1">Crear cuenta</h1>
      <p className="text-sm text-slate-400 mb-6">
        {contextLine ??
          (inviteToken || partnerToken
            ? 'El enlace que has usado ya no es válido. Necesitas un código de invitación de un administrador.'
            : 'Necesitas un código de invitación de un administrador.')}
      </p>
      <RegistroForm
        defaultCode={code}
        inviteToken={inviteUsable ? inviteToken : ''}
        partnerToken={partnerUsable ? partnerToken : ''}
        codeless={codeless}
        defaultEmail={partnerUsable ? (partnerInvite.invitedEmail ?? '') : ''}
        defaultName={partnerUsable ? (partnerInvite.invitedName ?? '') : ''}
        next={next}
      />
    </>
  );
}
