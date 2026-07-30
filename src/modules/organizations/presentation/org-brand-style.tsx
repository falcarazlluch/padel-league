/**
 * Whitelabel theming. Overrides the `--color-brand-*` custom properties that
 * globals.css defines, so every existing `bg-brand-navy` / `text-brand-blue`
 * utility across the app repaints in the tenant's palette with no per-component
 * changes.
 *
 * The derived `-light` / `-dark` variants are produced by mixing with white and
 * black via `color-mix`, which keeps the gradients in the nav and buttons
 * looking intentional without asking the admin for six colours.
 */

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * The values reach a `<style>` block, so anything that is not exactly a 6-digit
 * hex colour falls back to the platform default. OrganizationService validates
 * on write too — this is the second lock, because a bad value here would be a
 * stylesheet-injection sink.
 */
function safeColor(value: string, fallback: string): string {
  return HEX_COLOR_RE.test(value) ? value : fallback;
}

export function OrgBrandStyle({
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}) {
  const primary = safeColor(primaryColor, '#0D1E45');
  const secondary = safeColor(secondaryColor, '#5BB8D4');
  const accent = safeColor(accentColor, '#F9C920');
  const css = `:root{
  --color-brand-navy:${primary};
  --color-brand-navy-light:color-mix(in srgb, ${primary} 78%, white);
  --color-brand-blue:${secondary};
  --color-brand-blue-light:color-mix(in srgb, ${secondary} 70%, white);
  --color-brand-yellow:${accent};
  --color-brand-yellow-dark:color-mix(in srgb, ${accent} 88%, black);
}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
