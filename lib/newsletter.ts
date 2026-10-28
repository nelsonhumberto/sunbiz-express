import { isChecklistTestAddress } from '@/lib/checklist-opt-in';
import { DRIP_MAILING_ADDRESS, type DripLocale } from '@/lib/drip-copy';

/**
 * Weekday morning in America/New_York.
 *
 * The recovery cron at 13:00 UTC is 9:00 EDT and 8:00 EST. The send slot is
 * 8:00 ET, and the morning window is 8, 9, and 10. The 17:00, 22:00, and
 * 02:00 UTC runs are outside that window, so they do not send the newsletter.
 */
export const NEWSLETTER_MORNING_HOUR_ET = 8;
const MORNING_HOURS = new Set([8, 9, 10]);
const WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

interface EtParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

export function etParts(date: Date): EtParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    weekday: bag.weekday ?? '',
  };
}

export function etLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wallAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const parts = etParts(new Date(utc));
    const got = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const delta = wallAsUtc - got;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

function addCalendarDays(year: number, month: number, day: number, days: number) {
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** Same wall-clock time in ET, N calendar days later. Does not drift across DST. */
export function addEtDays(slot: Date, days: number): Date {
  const parts = etParts(slot);
  const next = addCalendarDays(parts.year, parts.month, parts.day, days);
  return etLocalToUtc(next.year, next.month, next.day, parts.hour, parts.minute);
}

export function isEtWeekdayMorning(now: Date): boolean {
  const parts = etParts(now);
  return WEEKDAYS.has(parts.weekday) && MORNING_HOURS.has(parts.hour);
}

/** First 8:00 ET on a weekday strictly after `after`. */
export function firstWeekdayMorningEt(after: Date): Date {
  const start = etParts(after);
  let cursor = { year: start.year, month: start.month, day: start.day };
  for (let i = 0; i < 14; i += 1) {
    const slot = etLocalToUtc(cursor.year, cursor.month, cursor.day, NEWSLETTER_MORNING_HOUR_ET, 0);
    const slotParts = etParts(slot);
    if (WEEKDAYS.has(slotParts.weekday) && slot.getTime() > after.getTime()) return slot;
    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
  }
  throw new Error('No weekday morning within two weeks');
}

export function newsletterIssueSchedule(confirmedAt: Date): {
  issue001: Date;
  issue002: Date;
  issue003: Date;
  issue004: Date;
} {
  const issue001 = firstWeekdayMorningEt(confirmedAt);
  const issue002 = addEtDays(issue001, 7);
  const issue003 = addEtDays(issue002, 7);
  const issue004 = addEtDays(issue003, 7);
  return { issue001, issue002, issue003, issue004 };
}

/** Whole America/New_York calendar days from earlier to later. The same day is 0. */
export function etCalendarDaysBetween(earlier: Date, later: Date): number {
  const start = etParts(earlier);
  const end = etParts(later);
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export type NewsletterIssueNumber = '001' | '002' | '003' | '004';

export function normalizeNewsletterIssue(value: string | null | undefined): NewsletterIssueNumber {
  if (value === '002' || value === '003' || value === '004') return value;
  return '001';
}

/**
 * 001 on the first weekday morning after confirm. 002 one week after that
 * slot. If 001 has not gone out, 002 waits even when its date has passed.
 *
 * 003 is due on a weekday morning once 7 Eastern calendar days have passed
 * since that subscriber's own 002 send. 004 uses the same gap after their
 * 003 send. The confirm-date slots are not used for 003 or 004, so a deploy
 * cannot hand someone who is already past 002 both new issues at once.
 */
export function newsletterDueIssue(input: {
  now: Date;
  confirmedAt: Date;
  sent001: boolean;
  sent002: boolean;
  sent003?: boolean;
  sent004?: boolean;
  sent002At?: Date | null;
  sent003At?: Date | null;
}): NewsletterIssueNumber | null {
  if (!isEtWeekdayMorning(input.now)) return null;
  const { issue001, issue002 } = newsletterIssueSchedule(input.confirmedAt);
  if (!input.sent001 && input.now.getTime() >= issue001.getTime()) return '001';
  if (input.sent001 && !input.sent002 && input.now.getTime() >= issue002.getTime()) return '002';
  if (
    input.sent001 &&
    input.sent002 &&
    !input.sent003 &&
    input.sent002At &&
    etCalendarDaysBetween(input.sent002At, input.now) >= 7
  ) {
    return '003';
  }
  if (
    input.sent001 &&
    input.sent002 &&
    input.sent003 &&
    !input.sent004 &&
    input.sent003At &&
    etCalendarDaysBetween(input.sent003At, input.now) >= 7
  ) {
    return '004';
  }
  return null;
}

export function isNewsletterRecipient(row: {
  email: string;
  confirmedAt: Date | null;
  isTest: boolean;
  unsubscribed: boolean;
}): boolean {
  if (!row.confirmedAt || row.isTest || row.unsubscribed) return false;
  return !isChecklistTestAddress(row.email);
}

/** The series does not start until a real confirmed subscriber exists. */
export function newsletterMayStart(realConfirmedCount: number): boolean {
  return realConfirmedCount > 0;
}

export interface NewsletterSection {
  title: string;
  paragraphs: readonly string[];
  bulletLead?: string;
  bullets?: readonly string[];
  after?: string;
  /** Paragraphs after the bullets. Used when a section has a link under the list. */
  closing?: readonly string[];
}

export interface NewsletterIssueCopy {
  number: NewsletterIssueNumber;
  subject: string;
  preview: string;
  greeting: string;
  intro: string;
  sections: readonly NewsletterSection[];
  closerTitle: string;
  closerBody: string;
  cta: string;
  ctaPath: string;
  signoff: string;
  team: string;
  disclaimer: string;
  reason: string;
  unsubscribe: string;
  address: string;
}

const ISSUE_001_EN: NewsletterIssueCopy = {
  number: '001',
  subject: 'One small habit that keeps your new company clean',
  preview: 'Keep business and personal money apart, plus one deadline worth adding to your calendar.',
  greeting: 'Hi there,',
  intro:
    'Welcome to this week\'s note for new and soon-to-be founders. Two quick things, then you can get back to building.',
  sections: [
    {
      title: "This week's tip: keep business money separate",
      paragraphs: [
        'Open a business bank account as soon as your company is formed, and run every business dollar through it. Pay business bills from it, deposit customer payments into it, and avoid paying personal costs from it.',
      ],
      bulletLead: 'Why it helps:',
      bullets: [
        'Bookkeeping and tax time get much simpler.',
        'You get a clear picture of how the business is really doing.',
        'Mixing personal and business funds can weaken the separation an LLC or corporation is meant to give you.',
      ],
      after: 'Most banks will ask for your formation documents and your EIN, so keep those handy.',
    },
    {
      title: 'Deadline reminder: annual filings',
      paragraphs: [
        'Most states expect companies to file an annual (or biennial) report, pay an annual tax or fee, or both. Due dates vary by state and sometimes by the month you formed. For example, Delaware LLCs pay their annual tax on or before June 1 each year, and missing it can mean a penalty and losing good standing.',
        "Take two minutes this week to look up your state's due date and put it on your calendar with a reminder a few weeks ahead.",
      ],
    },
  ],
  closerTitle: 'Ready to start?',
  closerBody:
    'If you are still thinking about forming your company, we make it simple and fully online.',
  cta: 'Start your company at LaunchForma',
  ctaPath: '/',
  signoff: 'Talk soon,',
  team: 'The LaunchForma Team',
  disclaimer: 'This email is general information, not legal or tax advice.',
  reason: 'You are receiving this because you signed up for LaunchForma updates.',
  unsubscribe: 'Unsubscribe',
  address: `LaunchForma, ${DRIP_MAILING_ADDRESS}`,
};

const ISSUE_002_EN: NewsletterIssueCopy = {
  number: '002',
  subject: 'A simple folder that saves you headaches later',
  preview:
    'An easy way to track business expenses, plus the Florida annual report window to put on your calendar.',
  greeting: 'Hi there,',
  intro: 'Welcome back. Here are two quick things for this week, and then you can get back to building.',
  sections: [
    {
      title: "This week's tip: track expenses as you go",
      paragraphs: [
        'Pick one simple system for business expenses and use it from the start. A spreadsheet, a bookkeeping app, or a folder for receipts all work. What matters is that you keep using it.',
      ],
      bulletLead: 'A few easy habits:',
      bullets: [
        'Save every receipt the day you get it. A phone photo is fine.',
        'Write a short note on each one: what it was for and who it was with.',
        'Spend 15 minutes once a week matching receipts to your business bank account.',
      ],
    },
    {
      title: 'Why it helps:',
      paragraphs: [],
      bullets: [
        'Tax time is calmer because everything is already in one place.',
        'You can see where your money is really going.',
        'If an accountant helps you later, they will have clean records to work from.',
      ],
      after: 'Ask your accountant which records they want you to keep and for how long.',
    },
    {
      title: 'Deadline reminder: Florida annual report',
      paragraphs: [
        'If you have a Florida LLC or corporation, the annual report window runs from January 1 to May 1 each year. The state charges a $400 late fee if you file after May 1. If no report is filed by the third Friday in September, the state can administratively dissolve the company.',
        "Formed in another state? Look up your state's due date this week and add it to your calendar with a reminder a few weeks ahead.",
      ],
    },
  ],
  closerTitle: 'Need a hand?',
  closerBody:
    'Whether you are forming a new company or filing your Florida annual report, we keep it simple and fully online.',
  cta: 'Visit LaunchForma',
  ctaPath: '/',
  signoff: 'Talk soon,',
  team: 'The LaunchForma Team',
  disclaimer: 'This email is general information, not legal or tax advice.',
  reason: 'You are receiving this because you signed up for LaunchForma updates.',
  unsubscribe: 'Unsubscribe',
  address: `LaunchForma, ${DRIP_MAILING_ADDRESS}`,
};

const ISSUE_003_EN: NewsletterIssueCopy = {
  number: '003',
  subject: 'Get your EIN the right way',
  preview:
    'How to get the EIN issued by the IRS for your company, plus a federal tax date to put on your calendar.',
  greeting: 'Hi there,',
  intro: 'Here are two quick things for this week, and then you can get back to building.',
  sections: [
    {
      title: "This week's tip: get your EIN straight from the IRS",
      paragraphs: [
        'An EIN (Employer Identification Number) is like a tax ID for your company. Banks, payment apps, and payroll services usually ask for it, even if you have no employees.',
      ],
      bulletLead: 'A few easy habits:',
      bullets: [
        'Apply on the official IRS website, irs.gov. Your EIN is issued by the IRS.',
        "Have your company's legal name and formation date handy before you start.",
        'Save the confirmation letter as a PDF in the same folder as your formation documents.',
      ],
      after:
        'Watch out for look-alike sites that are not irs.gov. Always check the web address before you enter your details.',
    },
    {
      title: 'Deadline reminder: federal estimated taxes',
      paragraphs: [
        'If you pay quarterly estimated taxes, the last payment for 2026 is due January 15, 2027. Add it to your calendar with a reminder a week or two ahead.',
        'Ask your accountant whether you need to make estimated payments and how much.',
      ],
    },
  ],
  closerTitle: 'Need a hand?',
  closerBody: 'Still planning your company? We handle the state filing for you, fully online.',
  cta: 'Start your company with LaunchForma',
  ctaPath: '/',
  signoff: 'Talk soon,',
  team: 'The LaunchForma Team',
  disclaimer: 'This email is general information, not legal or tax advice.',
  reason: 'You are receiving this because you signed up for LaunchForma updates.',
  unsubscribe: 'Unsubscribe',
  address: `LaunchForma, ${DRIP_MAILING_ADDRESS}`,
};

const ISSUE_004_EN: NewsletterIssueCopy = {
  number: '004',
  subject: 'Keep your business money in its own lane',
  preview:
    'Why a separate business bank account helps, plus the 1099 form to know about if you pay contractors.',
  greeting: 'Hi there,',
  intro: 'Here are two quick things for this week, and then you can get back to building.',
  sections: [
    {
      title: "This week's tip: keep business and personal money apart",
      paragraphs: [
        "Once your company is formed, open a bank account in the company's name and run all business money through it. Many banks ask for your formation documents and your EIN, so have those ready.",
      ],
      bulletLead: 'A few easy habits:',
      bullets: [
        'Pay business bills from the business account or a business card only.',
        'When you pay yourself, move the money as a clear, labeled transfer.',
        'Skip using the business card for personal buys, even small ones.',
      ],
    },
    {
      title: 'Why it helps:',
      paragraphs: [],
      bullets: [
        'Your records stay clean, so tax time is simpler.',
        'You can see at a glance how the business is really doing.',
      ],
      after: 'Ask your accountant how they want you to pay yourself from the company.',
    },
    {
      title: 'Deadline reminder: 1099 forms for contractors',
      paragraphs: [
        'Did your company pay a freelancer or contractor this year? You may need to send them a Form 1099-NEC. For 2026 payments, it is due to both the contractor and the IRS by February 1, 2027 (January 31 falls on a Sunday). Check irs.gov for the rules, and start collecting each contractor\'s W-9 now so it is easy.',
      ],
    },
  ],
  closerTitle: 'Still planning your company?',
  closerBody: 'Grab our free LLC checklist. It walks you through the main steps of forming an LLC.',
  cta: 'Get the free checklist',
  ctaPath: '/checklist',
  signoff: 'Talk soon,',
  team: 'The LaunchForma Team',
  disclaimer: 'This email is general information, not legal or tax advice.',
  reason: 'You are receiving this because you signed up for LaunchForma updates.',
  unsubscribe: 'Unsubscribe',
  address: `LaunchForma, ${DRIP_MAILING_ADDRESS}`,
};

const ISSUE_001_ES: NewsletterIssueCopy = {
  number: '001',
  subject: 'Un hábito pequeño que mantiene limpia tu empresa nueva',
  preview: 'Separa el dinero del negocio y el personal, y anota una fecha que conviene guardar.',
  greeting: 'Hola,',
  intro:
    'Te damos la bienvenida a la nota de esta semana para quienes están por emprender o acaban de empezar. Dos cosas rápidas y sigues con tu negocio.',
  sections: [
    {
      title: 'El consejo de la semana: separa el dinero del negocio',
      paragraphs: [
        'Abre una cuenta bancaria del negocio en cuanto la empresa esté formada, y pasa por ahí cada dólar del negocio. Paga las cuentas del negocio desde esa cuenta, deposita ahí los pagos de los clientes y evita pagar gastos personales desde ella.',
      ],
      bulletLead: 'Por qué ayuda:',
      bullets: [
        'La contabilidad y la temporada de impuestos se vuelven mucho más simples.',
        'Ves con claridad cómo le va de verdad al negocio.',
        'Mezclar fondos personales y del negocio puede debilitar la separación que una LLC o una corporación busca darte.',
      ],
      after: 'La mayoría de los bancos te pedirá los documentos de formación y el EIN, así que tenlos a mano.',
    },
    {
      title: 'Recordatorio de fecha: presentaciones anuales',
      paragraphs: [
        'La mayoría de los estados espera que las empresas presenten un reporte anual (o bienal), paguen un impuesto o una cuota anual, o ambas cosas. Las fechas cambian según el estado y, a veces, según el mes en que formaste la empresa. Por ejemplo, las LLC de Delaware pagan su impuesto anual a más tardar el 1 de junio de cada año, y no pagarlo puede traer una multa y hacer que la empresa deje de estar al día.',
        'Tómate dos minutos esta semana para buscar la fecha de tu estado y anotarla en el calendario, con un recordatorio unas semanas antes.',
      ],
    },
  ],
  closerTitle: '¿Listo para empezar?',
  closerBody: 'Si todavía estás pensando en formar tu empresa, lo hacemos simple y todo en línea.',
  cta: 'Empieza tu empresa en LaunchForma',
  ctaPath: '/es',
  signoff: 'Hasta pronto,',
  team: 'El equipo de LaunchForma',
  disclaimer: 'Este correo es información general, no asesoría legal ni fiscal.',
  reason: 'Recibes este mensaje porque te registraste para recibir novedades de LaunchForma.',
  unsubscribe: 'Cancelar suscripción',
  address: `LaunchForma, ${DRIP_MAILING_ADDRESS}`,
};

const ISSUE_002_ES: NewsletterIssueCopy = {
  number: '002',
  subject: 'Una carpeta simple que te ahorra problemas más adelante',
  preview:
    'Una forma fácil de anotar los gastos del negocio, y el plazo del reporte anual de Florida para el calendario.',
  greeting: 'Hola,',
  intro: 'Qué bueno tenerte de vuelta. Aquí van dos cosas rápidas para esta semana, y luego sigues con tu negocio.',
  sections: [
    {
      title: 'El consejo de la semana: anota los gastos sobre la marcha',
      paragraphs: [
        'Elige un sistema simple para los gastos del negocio y úsalo desde el principio. Una hoja de cálculo, una app de contabilidad o una carpeta de recibos sirven. Lo que importa es que lo sigas usando.',
      ],
      bulletLead: 'Unos hábitos fáciles:',
      bullets: [
        'Guarda cada recibo el día que lo recibes. Una foto con el teléfono basta.',
        'Escribe una nota corta en cada uno: para qué fue y con quién.',
        'Dedica 15 minutos una vez por semana a cruzar los recibos con la cuenta bancaria del negocio.',
      ],
    },
    {
      title: 'Por qué ayuda:',
      paragraphs: [],
      bullets: [
        'La temporada de impuestos es más tranquila porque todo ya está en un solo lugar.',
        'Puedes ver a dónde se está yendo de verdad tu dinero.',
        'Si más adelante te ayuda un contador, tendrá registros limpios con los que trabajar.',
      ],
      after: 'Pregúntale a tu contador qué registros quiere que guardes y por cuánto tiempo.',
    },
    {
      title: 'Recordatorio de fecha: reporte anual de Florida',
      paragraphs: [
        'Si tienes una LLC o una corporación de Florida, el plazo del reporte anual va del 1 de enero al 1 de mayo de cada año. El estado cobra una multa de $400 si presentas después del 1 de mayo. Si no se presenta el reporte para el tercer viernes de septiembre, el estado puede disolver la empresa de forma administrativa.',
        '¿La formaste en otro estado? Busca esta semana la fecha de tu estado y agrégala al calendario, con un recordatorio unas semanas antes.',
      ],
    },
  ],
  closerTitle: '¿Necesitas una mano?',
  closerBody:
    'Ya sea que estés formando una empresa nueva o presentando el reporte anual de Florida, lo mantenemos simple y todo en línea.',
  cta: 'Visita LaunchForma',
  ctaPath: '/es',
  signoff: 'Hasta pronto,',
  team: 'El equipo de LaunchForma',
  disclaimer: 'Este correo es información general, no asesoría legal ni fiscal.',
  reason: 'Recibes este mensaje porque te registraste para recibir novedades de LaunchForma.',
  unsubscribe: 'Cancelar suscripción',
  address: `LaunchForma, ${DRIP_MAILING_ADDRESS}`,
};

const ISSUE_003_ES: NewsletterIssueCopy = {
  number: '003',
  subject: 'Obtén tu EIN de la forma correcta',
  preview:
    'Cómo obtener el EIN que emite el IRS para tu empresa, y una fecha de impuestos federales para anotar en tu calendario.',
  greeting: 'Hola,',
  intro: 'Aquí van dos cosas rápidas de esta semana, y luego puedes volver a construir tu negocio.',
  sections: [
    {
      title: 'El consejo de esta semana: obtén tu EIN directamente con el IRS',
      paragraphs: [
        'El EIN (Número de Identificación del Empleador) es como un número de identificación fiscal para tu empresa. Los bancos, las apps de pagos y los servicios de nómina suelen pedirlo, aunque no tengas empleados.',
      ],
      bulletLead: 'Algunos hábitos sencillos:',
      bullets: [
        'Haz la solicitud en el sitio oficial del IRS, irs.gov. El EIN lo emite el IRS.',
        'Ten a la mano el nombre legal de tu empresa y su fecha de formación antes de empezar.',
        'Guarda la carta de confirmación en PDF, en la misma carpeta que tus documentos de formación.',
      ],
      after:
        'Cuidado con los sitios que se parecen al del IRS pero no son irs.gov. Revisa siempre la dirección web antes de escribir tus datos.',
      closing: [
        'Más información en el IRS: [Obtener un número de identificación del empleador (EIN)](https://www.irs.gov/es/businesses/small-businesses-self-employed/get-an-employer-identification-number)',
      ],
    },
    {
      title: 'Recordatorio de fecha límite: impuestos estimados federales',
      paragraphs: [
        'Si pagas impuestos estimados cada trimestre, el último pago de 2026 vence el 15 de enero de 2027. Anótalo en tu calendario con un recordatorio una o dos semanas antes.',
        'Consulta con quien lleva tu contabilidad si necesitas hacer pagos estimados y de cuánto. Más detalles en el IRS: [Preguntas frecuentes sobre el impuesto estimado](https://www.irs.gov/es/faqs/estimated-tax)',
      ],
    },
  ],
  closerTitle: '¿Necesitas una mano?',
  closerBody: '¿Todavía estás planeando tu empresa? Nos encargamos del trámite estatal por ti, todo en línea.',
  cta: 'Forma tu empresa con LaunchForma',
  ctaPath: '/es',
  signoff: 'Hasta pronto,',
  team: 'El equipo de LaunchForma',
  disclaimer: 'Este correo es información general, no asesoría legal ni fiscal.',
  reason: 'Recibes este correo porque te suscribiste a las novedades de LaunchForma.',
  unsubscribe: 'Cancelar suscripción',
  address: `LaunchForma, ${DRIP_MAILING_ADDRESS}`,
};

const ISSUE_004_ES: NewsletterIssueCopy = {
  number: '004',
  subject: 'Dale al dinero de tu negocio su propio carril',
  preview:
    'Por qué ayuda tener una cuenta bancaria separada para tu negocio, y el formulario 1099 que debes conocer si le pagas a personas que contratas por servicios.',
  greeting: 'Hola,',
  intro: 'Aquí van dos cosas rápidas de esta semana, y luego puedes volver a construir tu negocio.',
  sections: [
    {
      title: 'El consejo de esta semana: separa el dinero del negocio y el personal',
      paragraphs: [
        'Cuando tu empresa esté formada, abre una cuenta bancaria a nombre de la empresa y pasa por ella todo el dinero del negocio. Muchos bancos piden tus documentos de formación y tu EIN, así que tenlos listos.',
      ],
      bulletLead: 'Algunos hábitos sencillos:',
      bullets: [
        'Paga las cuentas del negocio solo desde la cuenta o una tarjeta del negocio.',
        'Cuando te pagues a ti, hazlo con una transferencia clara y con su descripción.',
        'No uses la tarjeta del negocio para compras personales, aunque sean pequeñas.',
      ],
    },
    {
      title: 'Por qué ayuda:',
      paragraphs: [],
      bullets: [
        'Tus registros se mantienen en orden, y la temporada de impuestos es más sencilla.',
        'Ves de un vistazo cómo le está yendo de verdad al negocio.',
      ],
      after: 'Consulta con quien lleva tu contabilidad cómo prefiere que te pagues desde la empresa.',
    },
    {
      title: 'Recordatorio de fecha límite: formularios 1099 por pagos a quienes contratas',
      paragraphs: [
        '¿Tu empresa le pagó a alguien que trabaja por su cuenta o por contrato este año? Es posible que tengas que enviarle un Formulario 1099-NEC. Para los pagos de 2026, vence el 1 de febrero de 2027 tanto para entregarlo a quien contrataste como para presentarlo al IRS (el 31 de enero cae domingo). Revisa las reglas en el IRS: [Acerca del Formulario 1099-NEC](https://www.irs.gov/es/forms-pubs/about-form-1099-nec). Y empieza ya a pedirle el W-9 a cada persona que contrates para que todo sea más fácil.',
      ],
    },
  ],
  closerTitle: '¿Todavía estás planeando tu empresa?',
  closerBody:
    'Descarga nuestra lista de verificación para tu LLC, sin costo. Te guía por los pasos principales para formar una LLC.',
  cta: 'Obtén la lista de verificación',
  ctaPath: '/es/checklist',
  signoff: 'Hasta pronto,',
  team: 'El equipo de LaunchForma',
  disclaimer: 'Este correo es información general, no asesoría legal ni fiscal.',
  reason: 'Recibes este correo porque te suscribiste a las novedades de LaunchForma.',
  unsubscribe: 'Cancelar suscripción',
  address: `LaunchForma, ${DRIP_MAILING_ADDRESS}`,
};

const EN_ISSUES: Record<NewsletterIssueNumber, NewsletterIssueCopy> = {
  '001': ISSUE_001_EN,
  '002': ISSUE_002_EN,
  '003': ISSUE_003_EN,
  '004': ISSUE_004_EN,
};

const ES_ISSUES: Record<NewsletterIssueNumber, NewsletterIssueCopy> = {
  '001': ISSUE_001_ES,
  '002': ISSUE_002_ES,
  '003': ISSUE_003_ES,
  '004': ISSUE_004_ES,
};

/** es subscribers get the Spanish issue. Every other locale gets English. */
export function newsletterDeliveryLocale(
  number: NewsletterIssueNumber,
  locale: DripLocale,
): DripLocale {
  return locale === 'es' && ES_ISSUES[number] ? 'es' : 'en';
}

export function newsletterIssueCopy(number: NewsletterIssueNumber, locale: DripLocale): NewsletterIssueCopy {
  if (locale === 'es') return ES_ISSUES[number];
  return EN_ISSUES[number];
}

/** Chosen subjects stored with the issues. Option 1 from each file. */
export const STORED_NEWSLETTER_ISSUES = [
  {
    id: '001',
    subject: ISSUE_001_EN.subject,
    preview: ISSUE_001_EN.preview,
  },
  {
    id: '002',
    subject: ISSUE_002_EN.subject,
    preview: ISSUE_002_EN.preview,
  },
  {
    id: '003',
    subject: ISSUE_003_EN.subject,
    preview: ISSUE_003_EN.preview,
  },
  {
    id: '004',
    subject: ISSUE_004_EN.subject,
    preview: ISSUE_004_EN.preview,
  },
] as const;

export function allNewsletterCopyText(): string {
  const chunks: string[] = [];
  for (const number of ['001', '002', '003', '004'] as const) {
    for (const locale of ['en', 'es'] as const) {
      const copy = newsletterIssueCopy(number, locale);
      chunks.push(
        copy.subject,
        copy.preview,
        copy.greeting,
        copy.intro,
        copy.closerTitle,
        copy.closerBody,
        copy.cta,
        copy.signoff,
        copy.team,
        copy.disclaimer,
        copy.reason,
        copy.unsubscribe,
        copy.address,
      );
      for (const section of copy.sections) {
        chunks.push(section.title, ...section.paragraphs);
        if (section.bulletLead) chunks.push(section.bulletLead);
        if (section.bullets) chunks.push(...section.bullets);
        if (section.after) chunks.push(section.after);
        if (section.closing) chunks.push(...section.closing);
      }
    }
  }
  return chunks.join('\n');
}
