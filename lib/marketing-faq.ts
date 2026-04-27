// Marketing FAQ generator.
//
// Returns the FAQ list a visitor should see based on their resolved
// marketing state and locale. Florida visitors get the full operational
// FAQ; visitors targeting an unsupported state (Georgia, Texas, etc.) get
// a state-specific waitlist FAQ that does not promise filing dates or
// fees we cannot back up yet.
//
// Florida copy is locked here (rather than the i18n bundle) because the
// content is long, prose-heavy, and tightly coupled to Florida statutes.
// The coming-soon copy is short and templated, so we substitute the state
// name at render time.

import { localizedStateName, type MarketingState } from './marketing-states';

export interface MarketingFaqItem {
  q: string;
  a: string;
}

const FAQ_FLORIDA_EN: MarketingFaqItem[] = [
  {
    q: 'How long does it take to form a Florida LLC?',
    a: 'About 15 minutes to complete our wizard. We submit to the Florida Department of State the same business day. The state typically approves online filings in 1-2 business days.',
  },
  {
    q: 'What is included in the package price?',
    a: "Every package includes the required Florida Department of State filing fee ($125 for LLC, $70 for Corporation), our preparation and same-business-day submission, your Year-1 Registered Agent, and digital delivery of your filed documents. We forward the state fee to Florida on your behalf — there are no separate state fees added at checkout.",
  },
  {
    q: 'Do I really get a free Registered Agent for a year?',
    a: "Yes. Year-1 Registered Agent service is included in every package, including Basic Filing. Renewal is $119/year — well below LegalZoom's $249/year. You can cancel any time and switch to your own agent.",
  },
  {
    q: "What's a Registered Agent and do I need one?",
    a: "Florida law requires every LLC and Corporation to designate a Registered Agent — a person or company with a physical Florida address who can receive legal documents on the entity's behalf. P.O. Boxes don't qualify. Using our service keeps your home address off the public record.",
  },
  {
    q: 'When is the Florida annual report due?',
    a: "Between January 1 and May 1 each year. The fee is $138.75 for an LLC and $150 for a Corporation. Florida charges a non-waivable $400 late fee if you miss May 1, and your entity can be administratively dissolved by September. We'll remind you well in advance.",
  },
  {
    q: 'Can I form an LLC if I live outside Florida?',
    a: 'Yes — Florida does not require members or managers to reside in Florida. You only need a Florida Registered Agent (we provide one for free Year 1) and a Florida physical address for that agent.',
  },
  {
    q: 'What about the EIN — do I need one?',
    a: "An EIN (Employer Identification Number) is your business's federal tax ID. You'll need one to open a business bank account, hire employees, or file taxes as an LLC or Corporation. Our Bank-Ready Filing and Launch Concierge packages include EIN acquisition; you can add it as a $79 upgrade on Basic Filing.",
  },
  {
    q: 'What if my name is taken?',
    a: "We check availability against the Sunbiz database in real time. If your first choice isn't distinguishable on the record, we'll suggest alternatives — and you can keep iterating until you find one that works.",
  },
  {
    q: 'Are you a law firm?',
    a: "No. IncServices is a self-help service for forming Florida business entities. We don't provide legal advice or represent you in legal proceedings. For complex situations (multi-state operations, professional licensing, securities, etc.), we recommend consulting an attorney or CPA.",
  },
  {
    q: "What's your refund policy?",
    a: "The IncServices portion of your package is refundable for 14 days if we haven't yet submitted your filing to the state. Once Florida has accepted the filing, the state filing fee portion is non-refundable per Florida statute. Recurring services (Registered Agent, Compliance Alerts) can be cancelled at any time and won't auto-renew.",
  },
];

const FAQ_FLORIDA_ES: MarketingFaqItem[] = [
  {
    q: '¿Cuánto tarda formar una LLC en Florida?',
    a: 'Unos 15 minutos completar nuestro asistente. Enviamos al Departamento de Estado de Florida el mismo día hábil. El estado normalmente aprueba trámites en línea en 1-2 días hábiles.',
  },
  {
    q: '¿Qué incluye el precio del plan?',
    a: 'Cada plan incluye la tarifa de presentación requerida del Departamento de Estado de Florida ($125 para LLC, $70 para Corporación), nuestra preparación y envío el mismo día hábil, tu Agente Registrado del primer año, y la entrega digital de tus documentos presentados. Pagamos la tarifa estatal a Florida en tu nombre — no se agregan tarifas estatales aparte al pagar.',
  },
  {
    q: '¿De verdad obtengo Agente Registrado gratis por un año?',
    a: 'Sí. El servicio de Agente Registrado del primer año está incluido en cada plan, incluyendo el Plan Básico. La renovación es $119/año — muy por debajo de los $249/año de LegalZoom. Puedes cancelar cuando quieras y cambiarte a tu propio agente.',
  },
  {
    q: '¿Qué es un Agente Registrado y lo necesito?',
    a: 'La ley de Florida requiere que cada LLC y Corporación designe un Agente Registrado — una persona o empresa con dirección física en Florida que pueda recibir documentos legales en nombre de la entidad. Los Apartados Postales no califican. Usar nuestro servicio mantiene tu dirección personal fuera del registro público.',
  },
  {
    q: '¿Cuándo se debe presentar el reporte anual de Florida?',
    a: 'Entre el 1 de enero y el 1 de mayo de cada año. La tarifa es $138.75 para LLC y $150 para Corporación. Florida cobra una multa no negociable de $400 si pierdes el 1 de mayo, y tu entidad puede ser disuelta administrativamente para septiembre. Te recordaremos con tiempo.',
  },
  {
    q: '¿Puedo formar una LLC si vivo fuera de Florida?',
    a: 'Sí — Florida no requiere que los miembros o gerentes residan en Florida. Solo necesitas un Agente Registrado en Florida (te damos uno gratis el primer año) y una dirección física en Florida para ese agente.',
  },
  {
    q: '¿Qué pasa con el EIN — lo necesito?',
    a: 'Un EIN (Employer Identification Number) es la identificación fiscal federal de tu empresa. Lo necesitarás para abrir una cuenta bancaria empresarial, contratar empleados o declarar impuestos como LLC o Corporación. Nuestros planes Listo-para-el-Banco y Concierge de Lanzamiento incluyen la obtención del EIN; puedes agregarlo por $79 en el Plan Básico.',
  },
  {
    q: '¿Y si mi nombre está tomado?',
    a: 'Verificamos la disponibilidad contra la base de datos de Sunbiz en tiempo real. Si tu primera elección no es distinguible en el registro, sugerimos alternativas — y puedes seguir iterando hasta encontrar uno que funcione.',
  },
  {
    q: '¿Son ustedes un bufete de abogados?',
    a: 'No. IncServices es un servicio de auto-ayuda para formar entidades empresariales en Florida. No proporcionamos asesoramiento legal ni te representamos en procedimientos legales. Para situaciones complejas (operaciones multi-estado, licencias profesionales, valores, etc.), recomendamos consultar a un abogado o CPA.',
  },
  {
    q: '¿Cuál es su política de reembolso?',
    a: 'La parte de IncServices de tu plan es reembolsable por 14 días si aún no hemos enviado tu trámite al estado. Una vez que Florida acepta el trámite, la porción de la tarifa estatal no es reembolsable por estatuto de Florida. Los servicios recurrentes (Agente Registrado, Alertas de Cumplimiento) pueden cancelarse en cualquier momento y no se auto-renovarán.',
  },
];

function buildComingSoonFaqEn(state: MarketingState): MarketingFaqItem[] {
  const name = state.name;
  return [
    {
      q: `Is IncServices available in ${name} yet?`,
      a: `Not yet. We launched in Florida and we're rolling out new states based on demand. Joining the ${name} early-access list is the fastest way to see it sooner — every signup helps us prioritize.`,
    },
    {
      q: `When will ${name} formations open?`,
      a: `We don't have a confirmed date and we won't pretend to. As soon as we have a launch window for ${name} we'll email everyone on the early-access list with pricing, timelines, and a personal early-bird offer.`,
    },
    {
      q: `Can I form a Florida company even if I live in ${name}?`,
      a: 'Yes. Florida does not require members or managers to live in the state — you only need a Florida registered agent, which we provide free for the first year. A Florida LLC can be a strong choice for asset protection or for owners who already do business there.',
    },
    {
      q: `Will ${name} pricing match Florida pricing?`,
      a: `It will be in the same range, but state filing fees vary, so the all-in package price for ${name} may differ. We'll publish the exact ${name} pricing before opening early access — no surprises at checkout.`,
    },
    {
      q: 'How do you protect my email?',
      a: `We only use your email for ${name} availability updates and a single launch invite. We don't sell or share lead data, and you can unsubscribe with one click.`,
    },
  ];
}

function buildComingSoonFaqEs(state: MarketingState): MarketingFaqItem[] {
  const name = state.nameEs;
  return [
    {
      q: `¿IncServices ya está disponible en ${name}?`,
      a: `Aún no. Lanzamos en Florida y vamos abriendo nuevos estados según la demanda. Unirte a la lista de acceso anticipado de ${name} es la forma más rápida de ayudarnos a priorizarlo.`,
    },
    {
      q: `¿Cuándo abre ${name}?`,
      a: `Todavía no tenemos fecha confirmada y no vamos a inventarla. En cuanto tengamos una ventana de lanzamiento para ${name}, escribiremos a todos los de la lista con precios, fechas y una oferta de bienvenida.`,
    },
    {
      q: `¿Puedo formar una empresa en Florida aunque viva en ${name}?`,
      a: 'Sí. Florida no exige que los miembros o gerentes residan en el estado — solo necesitas un Agente Registrado en Florida, que nosotros te damos gratis el primer año. Una LLC de Florida puede ser una buena opción si buscas protección de activos o ya operas allí.',
    },
    {
      q: `¿Los precios de ${name} serán iguales a los de Florida?`,
      a: `Estarán en el mismo rango, pero las tarifas estatales varían, así que el precio todo-incluido para ${name} puede ser distinto. Publicaremos el precio exacto de ${name} antes de abrir el acceso anticipado — sin sorpresas al pagar.`,
    },
    {
      q: '¿Cómo protegen mi correo?',
      a: `Solo usamos tu correo para avisarte sobre la disponibilidad de ${name} y enviarte una invitación al lanzamiento. No vendemos ni compartimos los datos, y puedes darte de baja con un clic.`,
    },
  ];
}

/** Resolve the FAQ list for the given state and locale. */
export function getMarketingFaq(
  state: MarketingState,
  locale: string,
): MarketingFaqItem[] {
  if (state.availability === 'active') {
    return locale === 'es' ? FAQ_FLORIDA_ES : FAQ_FLORIDA_EN;
  }
  return locale === 'es'
    ? buildComingSoonFaqEs(state)
    : buildComingSoonFaqEn(state);
}

/** Convenience export so callers can render a localized state name. */
export function faqStateName(state: MarketingState, locale: string): string {
  return localizedStateName(state, locale);
}
