/** Fields added to the existing wizard error-boundary log. Not a new tracker. */
export function wizardRenderFailureContext(input: {
  digest?: string;
  language?: string;
  htmlClassName?: string;
}): { digest?: string; tag: string; language?: string; translated: boolean } {
  const classes = (input.htmlClassName ?? '').split(/\s+/).filter(Boolean);
  return {
    digest: input.digest,
    tag: 'wizard-error-boundary',
    language: input.language,
    translated: classes.includes('translated-ltr') || classes.includes('translated-rtl'),
  };
}
