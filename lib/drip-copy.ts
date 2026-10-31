/**
 * Resume-order and checklist copy. English matches the spec.
 * When no locale is stored, resume mail is English unless the filing
 * entry path is under /es.
 * No em dashes.
 */

import { tierPriceParts } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

export type DripLocale = 'es' | 'en';
export type ResumeStepId = 'RESUME_1H' | 'RESUME_1D' | 'RESUME_3D';
type LaterResumeStepId = Exclude<ResumeStepId, 'RESUME_1H'>;

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

function essentialTotalLabel(): string {
  return formatCurrency(tierPriceParts('BASIC', 'LLC', 'FL').totalCents);
}

/** Approved abandoned-cart copy. The dollar amount is the live Essential total. */
function abandonedCartCopy(locale: DripLocale): ResumeStepCopy {
  const total = essentialTotalLabel();
  if (locale === 'es') {
    return {
      subject: 'Tu borrador de LLC en Florida sigue abierto',
      preview: 'El nombre que escribiste está guardado. Puedes terminarlo cuando quieras.',
      paragraphs: [
        'Empezaste una LLC en Florida con LaunchForma y guardamos el borrador.',
        `Esencial cuesta ${total} todo incluido, y ese total incluye la tarifa estatal de Florida. Presentamos ante el estado en 1 día hábil después del pago. El tiempo de aprobación lo decide el estado.`,
        'Cuando quieras seguir, abre el borrador desde el enlace de este correo. Puedes cambiar el nombre de la empresa antes de que hagamos el registro.',
        'LaunchForma es un servicio privado de presentación, no una agencia del gobierno.',
      ],
      cta: 'Terminar mi LLC',
    };
  }
  return {
    subject: 'Your Florida LLC draft is still open',
    preview: 'The name you entered is saved. You can finish when you are ready.',
    paragraphs: [
      'You started a Florida LLC with LaunchForma and we saved the draft.',
      `Essential is ${total} all-in, and that total includes the Florida state filing fee. We file with the state within 1 business day of checkout. Approval timing is up to the state.`,
      'When you want to continue, open the draft from the link in this email. You can change the company name before we file.',
      'LaunchForma is a private filing service, not a government agency.',
    ],
    cta: 'Finish my LLC',
  };
}

const RESUME_EN: Record<LaterResumeStepId, ResumeStepCopy> = {
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

const RESUME_ES: Record<LaterResumeStepId, ResumeStepCopy> = {
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
  if (step === 'RESUME_1H') return abandonedCartCopy(locale);
  return locale === 'en' ? RESUME_EN[step] : RESUME_ES[step];
}

export function resumeFrameCopy(locale: DripLocale): ResumeFrameCopy {
  return locale === 'en' ? FRAME_EN : FRAME_ES;
}

export interface ChecklistSection {
  title: string;
  items: readonly string[];
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
  sections: readonly ChecklistSection[];
  closerTitle: string;
  closerBody: string;
  closerCta: string;
  pageDisclaimer: string;
  confirmSubject: string;
  confirmPreview: string;
  confirmBody: string;
  confirmCta: string;
  confirmExpiry: string;
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
  thanksTitle: 'Almost done!',
  thanksBody: "Check your inbox and click the link to confirm, then we'll send your checklist.",
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
  pageTitle: 'Starting Your LLC: A One-Page Checklist',
  pageIntro:
    'A simple list to help you go from idea to up-and-running. Check each box as you go.',
  sections: [
    {
      title: 'Plan',
      items: [
        'Pick your state of formation (often the state where you live and do business)',
        'Choose a business name and check that it is available in your state',
        'Check if a matching domain and social handles are free',
        'Decide who the members are and how ownership is split',
      ],
    },
    {
      title: 'Form',
      items: [
        'Choose a registered agent with a physical address in your state',
        'File your Articles of Organization (some states call it a Certificate of Formation)',
        'Write an Operating Agreement, even if you are the only member',
        'Get an EIN from the IRS (free at irs.gov)',
      ],
    },
    {
      title: 'Set up',
      items: [
        'Open a business bank account and keep business money separate',
        'Check which local, state, or industry licenses and permits you need',
        'Register for state taxes if you sell taxable goods or hire employees',
        'Set up simple bookkeeping from day one',
      ],
    },
    {
      title: 'Stay in good standing',
      items: [
        "Put your state's annual report or annual fee date on your calendar",
        'Keep your registered agent and business address up to date',
        'Store your formation documents, EIN letter, and agreements in one safe place',
        'Review your filings once a year',
      ],
    },
  ],
  closerTitle: 'Want the forms handled for you?',
  closerBody:
    'LaunchForma files your LLC online, step by step, so you can focus on your business.',
  closerCta: 'Start your LLC at LaunchForma',
  pageDisclaimer: 'This checklist is general information, not legal or tax advice.',
  confirmSubject: 'Confirm your email for the checklist',
  confirmPreview: 'One click and we will send your free Starting your LLC checklist.',
  confirmBody:
    'Please confirm your email so we can send your free "Starting your LLC" checklist.',
  confirmCta: 'Confirm my email',
  confirmExpiry: 'This link expires in 48 hours. If you did not ask for this, you can ignore this email.',
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
  thanksTitle: '¡Ya casi!',
  thanksBody: 'Revisa tu correo y toca el enlace para confirmar; luego te enviamos la lista.',
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
  pageTitle: 'Cómo empezar tu LLC: una lista de una página',
  pageIntro:
    'Una lista sencilla para pasar de la idea a tener el negocio en marcha. Marca cada casilla a medida que avanzas.',
  sections: [
    {
      title: 'Planear',
      items: [
        'Elige el estado donde vas a formar la empresa (muchas veces el estado donde vives y trabajas)',
        'Elige el nombre del negocio y confirma que esté disponible en tu estado',
        'Revisa si el dominio y los nombres en redes sociales están libres',
        'Decide quiénes son los miembros y cómo se reparte la propiedad',
      ],
    },
    {
      title: 'Formar',
      items: [
        'Elige un agente registrado con dirección física en tu estado',
        'Presenta los artículos de organización (en algunos estados se llaman certificado de formación)',
        'Escribe un acuerdo operativo, aunque seas el único miembro',
        'Obtén un EIN del IRS (gratis en irs.gov)',
      ],
    },
    {
      title: 'Poner en marcha',
      items: [
        'Abre una cuenta bancaria del negocio y separa el dinero de la empresa',
        'Revisa qué licencias y permisos locales, estatales o de tu industria necesitas',
        'Regístrate para impuestos estatales si vendes bienes gravados o contratas empleados',
        'Lleva una contabilidad simple desde el primer día',
      ],
    },
    {
      title: 'Mantenerte al día',
      items: [
        'Anota en tu calendario la fecha del reporte anual o de la cuota anual de tu estado',
        'Mantén al día el agente registrado y la dirección del negocio',
        'Guarda en un solo lugar seguro los documentos de formación, la carta del EIN y los acuerdos',
        'Revisa tus presentaciones una vez al año',
      ],
    },
  ],
  closerTitle: '¿Quieres que nosotros nos encarguemos de los formularios?',
  closerBody:
    'LaunchForma presenta tu LLC en línea, paso a paso, para que tú te concentres en el negocio.',
  closerCta: 'Empieza tu LLC en LaunchForma',
  pageDisclaimer: 'Esta lista es información general, no asesoría legal ni fiscal.',
  confirmSubject: 'Confirma tu correo para recibir la lista',
  confirmPreview: 'Un clic y te enviamos la lista gratis para empezar tu LLC.',
  confirmBody: 'Confirma tu correo para que te enviemos la lista gratis "Cómo empezar tu LLC".',
  confirmCta: 'Confirmar mi correo',
  confirmExpiry: 'Este enlace vence en 48 horas. Si no pediste esta lista, ignora este correo.',
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

export interface EmailShellCopy {
  lang: DripLocale;
  tagline: string;
  questions: string;
  preferences: string;
  notALawFirm: string;
}

const EMAIL_SHELL_EN: EmailShellCopy = {
  lang: 'en',
  tagline: 'Form your business the honest way',
  questions: 'Questions?',
  preferences: 'Email preferences',
  notALawFirm: 'Not a law firm',
};

const EMAIL_SHELL_ES: EmailShellCopy = {
  lang: 'es',
  tagline: 'Forma tu empresa con claridad',
  questions: '¿Preguntas?',
  preferences: 'Preferencias de correo',
  notALawFirm: 'LaunchForma no ofrece asesoría legal',
};

export function emailShellCopy(locale: DripLocale): EmailShellCopy {
  return locale === 'es' ? EMAIL_SHELL_ES : EMAIL_SHELL_EN;
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
    const shell = emailShellCopy(locale);
    chunks.push(shell.tagline, shell.questions, shell.preferences, shell.notALawFirm);
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
      list.closerTitle,
      list.closerBody,
      list.closerCta,
      list.pageDisclaimer,
      list.confirmSubject,
      list.confirmPreview,
      list.confirmBody,
      list.confirmCta,
      list.confirmExpiry,
      ...list.sections.flatMap((section) => [section.title, ...section.items]),
    );
  }
  return chunks.join('\n');
}
