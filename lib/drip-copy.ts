/**
 * Resume-order and checklist copy. English matches the spec.
 * Spanish is the default for the resume sequence when no locale is stored.
 * No em dashes.
 */

export type DripLocale = 'es' | 'en';
export type ResumeStepId = 'RESUME_1H' | 'RESUME_1D' | 'RESUME_3D';

export const DRIP_MAILING_ADDRESS =
  '14160 Palmetto Frontage Rd, Suite 101, Miami Lakes, FL 33016';

export interface ResumeStepCopy {
  subject: string;
  preview: string;
  paragraphs: readonly string[];
  cta: string;
}

export interface ResumeFrameCopy {
  greeting: (firstName?: string | null) => string;
  thanks: string;
  team: string;
  reason: string;
  unsubscribe: string;
  address: string;
}

const RESUME_EN: Record<ResumeStepId, ResumeStepCopy> = {
  RESUME_1H: {
    subject: 'Your LaunchForma order is saved',
    preview: 'Your details are saved, so you can finish whenever you are ready.',
    paragraphs: [
      'You started setting up your business with LaunchForma, and we saved your progress. Nothing is lost.',
      'When you have a few minutes, you can jump back in and finish from the same step.',
    ],
    cta: 'Resume my order',
  },
  RESUME_1D: {
    subject: 'Still thinking it over?',
    preview: 'Have a question before you finish? Just reply to this email.',
    paragraphs: [
      'Starting a business comes with a lot of decisions, so taking your time makes sense.',
      "If something about the order form was unclear, reply to this email and we'll get back to you. Your saved order is ready whenever you are.",
    ],
    cta: 'Finish my order',
  },
  RESUME_3D: {
    subject: 'A quick note about your saved order',
    preview: 'This is our last reminder. Your progress is still saved.',
    paragraphs: [
      'This is our last reminder about the order you started. Your progress is still saved, and you can finish it at any time.',
      'If you decided to wait, no problem. We will be here when you are ready.',
    ],
    cta: 'Complete my order',
  },
};

const RESUME_ES: Record<ResumeStepId, ResumeStepCopy> = {
  RESUME_1H: {
    subject: 'Tu pedido de LaunchForma está guardado',
    preview: 'Tus datos están guardados, así que puedes terminar cuando quieras.',
    paragraphs: [
      'Empezaste a configurar tu negocio con LaunchForma y guardamos tu progreso. No se ha perdido nada.',
      'Cuando tengas unos minutos, puedes volver y terminar desde el mismo paso.',
    ],
    cta: 'Reanudar mi pedido',
  },
  RESUME_1D: {
    subject: '¿Sigues pensándolo?',
    preview: '¿Tienes alguna pregunta antes de terminar? Solo responde a este correo.',
    paragraphs: [
      'Empezar un negocio implica muchas decisiones, así que tomarte tu tiempo tiene sentido.',
      'Si algo del formulario no quedó claro, responde a este correo y te contestaremos. Tu pedido guardado está listo cuando tú lo estés.',
    ],
    cta: 'Terminar mi pedido',
  },
  RESUME_3D: {
    subject: 'Una nota rápida sobre tu pedido guardado',
    preview: 'Este es nuestro último recordatorio. Tu progreso sigue guardado.',
    paragraphs: [
      'Este es nuestro último recordatorio sobre el pedido que empezaste. Tu progreso sigue guardado y puedes terminarlo en cualquier momento.',
      'Si decidiste esperar, no hay problema. Estaremos aquí cuando estés listo.',
    ],
    cta: 'Completar mi pedido',
  },
};

const FRAME_EN: ResumeFrameCopy = {
  greeting: (firstName) => `Hi ${firstName?.trim() || 'there'},`,
  thanks: 'Thanks,',
  team: 'The LaunchForma team',
  reason:
    'You are receiving this because you started an order at launchforma.com. LaunchForma is not a law firm and does not provide legal advice.',
  unsubscribe: 'Unsubscribe',
  address: DRIP_MAILING_ADDRESS,
};

const FRAME_ES: ResumeFrameCopy = {
  greeting: (firstName) => (firstName?.trim() ? `Hola ${firstName.trim()},` : 'Hola,'),
  thanks: 'Gracias,',
  team: 'El equipo de LaunchForma',
  reason:
    'Recibes este mensaje porque empezaste un pedido en launchforma.com. LaunchForma no es un bufete de abogados y no ofrece asesoría legal.',
  unsubscribe: 'Cancelar suscripción',
  address: DRIP_MAILING_ADDRESS,
};

export function resumeStepCopy(step: ResumeStepId, locale: DripLocale): ResumeStepCopy {
  return locale === 'en' ? RESUME_EN[step] : RESUME_ES[step];
}

export function resumeFrameCopy(locale: DripLocale): ResumeFrameCopy {
  return locale === 'en' ? FRAME_EN : FRAME_ES;
}

export interface ChecklistItem {
  title: string;
  body: string;
}

export interface ChecklistCopy {
  headline: string;
  subline: string;
  emailPlaceholder: string;
  emailLabel: string;
  button: string;
  submitting: string;
  consentBefore: string;
  consentLink: string;
  consentAfter: string;
  thanksTitle: string;
  thanksBody: string;
  errorEmail: string;
  errorConsent: string;
  errorGeneric: string;
  subject: string;
  preview: string;
  greeting: (firstName?: string | null) => string;
  intro: string;
  cta: string;
  detail: string;
  closing: string;
  thanks: string;
  team: string;
  disclaimer: string;
  unsubscribe: string;
  address: string;
  pageTitle: string;
  pageIntro: string;
  items: readonly ChecklistItem[];
}

const CHECKLIST_EN: ChecklistCopy = {
  headline: 'Get the free "Starting your LLC" checklist',
  subline:
    'A simple, step by step list of what to have ready before you form your LLC. Enter your email and we will send it over.',
  emailPlaceholder: 'you@example.com',
  emailLabel: 'Email',
  button: 'Send me the checklist',
  submitting: 'Sending...',
  consentBefore:
    'Yes, I opt in to get the free checklist plus occasional tips and updates from LaunchForma by email. This list is opt-in only: we only add you if you check this box, and you can unsubscribe at any time. See our ',
  consentLink: 'Privacy Policy',
  consentAfter: '.',
  thanksTitle: 'Thanks, you are all set!',
  thanksBody:
    'Your checklist is on its way to your inbox. If you do not see it in a few minutes, check your spam or promotions folder.',
  errorEmail: 'Please enter a valid email address.',
  errorConsent: 'Please check the box to receive the checklist.',
  errorGeneric: 'Something went wrong. Please try again.',
  subject: 'Your "Starting your LLC" checklist is here',
  preview: 'Here is your free checklist, ready to download.',
  greeting: (firstName) => `Hi ${firstName?.trim() || 'there'},`,
  intro: 'Thanks for signing up. Here is your free "Starting your LLC" checklist.',
  cta: 'Download the checklist',
  detail:
    'It walks through the information and decisions to have ready before you form your LLC. Keep it handy as you go.',
  closing: 'When you are ready to file, LaunchForma can handle the formation for you at launchforma.com.',
  thanks: 'Thanks,',
  team: 'The LaunchForma team',
  disclaimer:
    'This checklist is for general information only and is not legal advice. LaunchForma is not a law firm.',
  unsubscribe: 'Unsubscribe',
  address: DRIP_MAILING_ADDRESS,
  pageTitle: 'Starting your LLC',
  pageIntro:
    'A simple, step by step list of what to have ready before you form your LLC. This is general information, not legal advice.',
  items: [
    {
      title: 'Business name',
      body: 'The name you want for the company, plus one backup in case the state does not accept it.',
    },
    {
      title: 'Entity type',
      body: 'Whether you are forming an LLC or a corporation.',
    },
    {
      title: 'Addresses',
      body: 'A principal address and a mailing address.',
    },
    {
      title: 'Owners and managers',
      body: 'Who owns the company, who manages it, and how ownership is split.',
    },
    {
      title: 'Registered agent',
      body: 'A person or company with a street address in the formation state who can receive legal mail.',
    },
    {
      title: 'Organizer',
      body: 'The person who will sign the formation documents.',
    },
    {
      title: 'EIN',
      body: 'Whether you want a federal tax ID, and who the responsible party will be.',
    },
    {
      title: 'Payment',
      body: 'How you will pay the state fee and the service fee.',
    },
  ],
};

const CHECKLIST_ES: ChecklistCopy = {
  headline: 'Recibe la lista gratis "Cómo empezar tu LLC"',
  subline:
    'Una lista sencilla, paso a paso, de lo que debes tener listo antes de formar tu LLC. Escribe tu correo y te la enviamos.',
  emailPlaceholder: 'you@example.com',
  emailLabel: 'Correo',
  button: 'Envíame la lista',
  submitting: 'Enviando...',
  consentBefore:
    'Sí, acepto recibir la lista gratis y, de vez en cuando, consejos y novedades de LaunchForma por correo. Esta lista es solo con consentimiento: solo te agregamos si marcas esta casilla, y puedes darte de baja en cualquier momento. Consulta nuestra ',
  consentLink: 'Política de privacidad',
  consentAfter: '.',
  thanksTitle: 'Gracias, ya quedó todo listo.',
  thanksBody:
    'Tu lista va en camino a tu bandeja. Si no la ves en unos minutos, revisa la carpeta de spam o promociones.',
  errorEmail: 'Escribe un correo válido.',
  errorConsent: 'Marca la casilla para recibir la lista.',
  errorGeneric: 'Algo salió mal. Inténtalo de nuevo.',
  subject: 'Tu lista "Cómo empezar tu LLC" ya está aquí',
  preview: 'Aquí tienes tu lista gratis, lista para descargar.',
  greeting: (firstName) => (firstName?.trim() ? `Hola ${firstName.trim()},` : 'Hola,'),
  intro: 'Gracias por registrarte. Aquí tienes tu lista gratis "Cómo empezar tu LLC".',
  cta: 'Descargar la lista',
  detail:
    'Recorre la información y las decisiones que conviene tener listas antes de formar tu LLC. Tenla a mano mientras avanzas.',
  closing:
    'Cuando quieras presentar la solicitud, LaunchForma puede encargarse de la formación en launchforma.com.',
  thanks: 'Gracias,',
  team: 'El equipo de LaunchForma',
  disclaimer:
    'Esta lista es solo información general y no es asesoría legal. LaunchForma no es un bufete de abogados.',
  unsubscribe: 'Cancelar suscripción',
  address: DRIP_MAILING_ADDRESS,
  pageTitle: 'Cómo empezar tu LLC',
  pageIntro:
    'Una lista sencilla, paso a paso, de lo que debes tener listo antes de formar tu LLC. Es información general, no asesoría legal.',
  items: [
    {
      title: 'Nombre del negocio',
      body: 'El nombre que quieres para la empresa y uno de respaldo por si el estado no lo acepta.',
    },
    {
      title: 'Tipo de entidad',
      body: 'Si vas a formar una LLC o una corporación.',
    },
    {
      title: 'Direcciones',
      body: 'Una dirección principal y una dirección postal.',
    },
    {
      title: 'Dueños y administradores',
      body: 'Quién es dueño, quién administra y cómo se reparte la propiedad.',
    },
    {
      title: 'Agente registrado',
      body: 'Una persona o empresa con dirección física en el estado de formación que pueda recibir correspondencia legal.',
    },
    {
      title: 'Organizador',
      body: 'La persona que firmará los documentos de formación.',
    },
    {
      title: 'EIN',
      body: 'Si quieres un número de identificación fiscal federal y quién será la parte responsable.',
    },
    {
      title: 'Pago',
      body: 'Cómo pagarás la tarifa del estado y la tarifa del servicio.',
    },
  ],
};

export function checklistCopy(locale: DripLocale): ChecklistCopy {
  return locale === 'en' ? CHECKLIST_EN : CHECKLIST_ES;
}

/** Plain sentence the person agreed to, plus the policy URL they were shown. */
export function checklistConsentText(locale: DripLocale, privacyUrl: string): string {
  const copy = checklistCopy(locale);
  return `${copy.consentBefore}${copy.consentLink}${copy.consentAfter} ${privacyUrl}`;
}

export function privacyPolicyUrl(locale: DripLocale, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return locale === 'es' ? `${base}/es/privacy` : `${base}/privacy`;
}

export function checklistPageUrl(locale: DripLocale, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return locale === 'es' ? `${base}/es/checklist` : `${base}/checklist`;
}

/** Every user-facing string, for the no-em-dash check. */
export function allDripCopyText(): string {
  const chunks: string[] = [DRIP_MAILING_ADDRESS];
  for (const locale of ['es', 'en'] as const) {
    for (const step of ['RESUME_1H', 'RESUME_1D', 'RESUME_3D'] as const) {
      const copy = resumeStepCopy(step, locale);
      chunks.push(copy.subject, copy.preview, copy.cta, ...copy.paragraphs);
    }
    const frame = resumeFrameCopy(locale);
    chunks.push(frame.greeting('Ana'), frame.greeting(''), frame.thanks, frame.team, frame.reason, frame.unsubscribe);
    const list = checklistCopy(locale);
    chunks.push(
      list.headline,
      list.subline,
      list.button,
      list.consentBefore,
      list.consentLink,
      list.thanksTitle,
      list.thanksBody,
      list.subject,
      list.preview,
      list.intro,
      list.cta,
      list.detail,
      list.closing,
      list.disclaimer,
      list.pageTitle,
      list.pageIntro,
      ...list.items.flatMap((item) => [item.title, item.body]),
    );
  }
  return chunks.join('\n');
}
