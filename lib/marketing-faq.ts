// Marketing FAQ generator.
//
// Returns the FAQ list a visitor should see based on their resolved
// marketing state and locale. Active states (FL/WY/DE) each get their own
// long-form, statute-specific FAQ; visitors targeting an unsupported state
// (Georgia, Texas, etc.) get a state-specific waitlist FAQ that does not
// promise filing dates or fees we cannot back up yet.

import { localizedStateName, type MarketingState } from './marketing-states';

export interface MarketingFaqItem {
  /**
   * Optional stable identifier rendered as `id` on the accordion item so
   * the FAQ can be deep-linked via `#anchor`. Only set for items that
   * receive inbound links from the footer / dashboards.
   */
  id?: string;
  q: string;
  a: string;
}

const FAQ_FLORIDA_EN: MarketingFaqItem[] = [
  {
    id: 'florida-llc',
    q: 'How long does it take to form a Florida LLC?',
    a: 'About 15 minutes to complete our wizard. We submit to the Florida Department of State the same business day. The state typically approves online filings in 1-2 business days.',
  },
  {
    q: 'What is included in the package price?',
    a: "Every package includes the required Florida Department of State filing fee ($125 for LLC, $70 for Corporation), our preparation and same-business-day submission, your Year-1 Registered Agent, and digital delivery of your filed documents. We forward the state fee to Florida on your behalf — there are no separate state fees added at checkout.",
  },
  {
    q: 'Do I really get a free Registered Agent for a year?',
    a: "Yes. Year-1 Registered Agent service is included in every package, including Essential. Renewal is $119/year — well below LegalZoom's $249/year. You can cancel any time and switch to your own agent.",
  },
  {
    q: "What's a Registered Agent and do I need one?",
    a: "Florida law requires every LLC and Corporation to designate a Registered Agent — a person or company with a physical Florida address who can receive legal documents on the entity's behalf. P.O. Boxes don't qualify. Using our service keeps your home address off the public record.",
  },
  {
    id: 'annual-report',
    q: 'When is the Florida annual report due?',
    a: "Between January 1 and May 1 each year. The fee is $138.75 for an LLC and $150 for a Corporation. Florida charges a non-waivable $400 late fee if you miss May 1, and your entity can be administratively dissolved by September. We'll remind you well in advance.",
  },
  {
    q: 'Can I form an LLC if I live outside Florida?',
    a: 'Yes — Florida does not require members or managers to reside in Florida. You only need a Florida Registered Agent (we provide one for free Year 1) and a Florida physical address for that agent.',
  },
  {
    id: 'ein',
    q: 'What about the EIN — do I need one?',
    a: "An EIN (Employer Identification Number) is your business's federal tax ID. You'll need one to open a business bank account, hire employees, or file taxes as an LLC or Corporation. Our Popular and Premium packages include EIN acquisition; you can add it as a $79 upgrade on Essential.",
  },
  {
    id: 'boi',
    q: 'Do I need to file a BOI (Beneficial Ownership Information) report?',
    a: "Most LLCs and Corporations formed in the U.S. must file a Beneficial Ownership Information (BOI) report with FinCEN under the Corporate Transparency Act. Entities formed in 2025 or later have 30 days from formation to file; entities formed earlier had a one-time deadline that has now passed for most. There are exemptions (large operating companies, regulated entities, certain nonprofits). LaunchForma offers a managed BOI filing for $49 — see our /boi-reporting page for details and current FinCEN enforcement status.",
  },
  {
    q: 'What if my name is taken?',
    a: "We check availability against the Sunbiz database in real time. If your first choice isn't distinguishable on the record, we'll suggest alternatives — and you can keep iterating until you find one that works.",
  },
  {
    q: 'Are you a law firm?',
    a: "No. LaunchForma is a self-help service for forming Florida business entities. We don't provide legal advice or represent you in legal proceedings. For complex situations (multi-state operations, professional licensing, securities, etc.), we recommend consulting an attorney or CPA.",
  },
  {
    q: "What's your refund policy?",
    a: "The LaunchForma portion of your package is refundable for 14 days if we haven't yet submitted your filing to the state. Once Florida has accepted the filing, the state filing fee portion is non-refundable per Florida statute. Recurring services (Registered Agent, Compliance Alerts) can be cancelled at any time and won't auto-renew.",
  },
];

const FAQ_FLORIDA_ES: MarketingFaqItem[] = [
  {
    id: 'florida-llc',
    q: '¿Cuánto tarda formar una LLC en Florida?',
    a: 'Unos 15 minutos completar nuestro asistente. Enviamos al Departamento de Estado de Florida el mismo día hábil. El estado normalmente aprueba trámites en línea en 1-2 días hábiles.',
  },
  {
    q: '¿Qué incluye el precio del plan?',
    a: 'Cada plan incluye la tarifa de presentación requerida del Departamento de Estado de Florida ($125 para LLC, $70 para Corporación), nuestra preparación y envío el mismo día hábil, tu Agente Registrado del primer año, y la entrega digital de tus documentos presentados. Pagamos la tarifa estatal a Florida en tu nombre — no se agregan tarifas estatales aparte al pagar.',
  },
  {
    q: '¿De verdad obtengo Agente Registrado gratis por un año?',
    a: 'Sí. El servicio de Agente Registrado del primer año está incluido en cada plan, incluyendo el plan Esencial. La renovación es $119/año — muy por debajo de los $249/año de LegalZoom. Puedes cancelar cuando quieras y cambiarte a tu propio agente.',
  },
  {
    q: '¿Qué es un Agente Registrado y lo necesito?',
    a: 'La ley de Florida requiere que cada LLC y Corporación designe un Agente Registrado — una persona o empresa con dirección física en Florida que pueda recibir documentos legales en nombre de la entidad. Los Apartados Postales no califican. Usar nuestro servicio mantiene tu dirección personal fuera del registro público.',
  },
  {
    id: 'annual-report',
    q: '¿Cuándo se debe presentar el reporte anual de Florida?',
    a: 'Entre el 1 de enero y el 1 de mayo de cada año. La tarifa es $138.75 para LLC y $150 para Corporación. Florida cobra una multa no negociable de $400 si pierdes el 1 de mayo, y tu entidad puede ser disuelta administrativamente para septiembre. Te recordaremos con tiempo.',
  },
  {
    q: '¿Puedo formar una LLC si vivo fuera de Florida?',
    a: 'Sí — Florida no requiere que los miembros o gerentes residan en Florida. Solo necesitas un Agente Registrado en Florida (te damos uno gratis el primer año) y una dirección física en Florida para ese agente.',
  },
  {
    id: 'ein',
    q: '¿Qué pasa con el EIN — lo necesito?',
    a: 'Un EIN (Employer Identification Number) es la identificación fiscal federal de tu empresa. Lo necesitarás para abrir una cuenta bancaria empresarial, contratar empleados o declarar impuestos como LLC o Corporación. Nuestros planes Popular y Premium incluyen la obtención del EIN; puedes agregarlo por $79 en el plan Esencial.',
  },
  {
    id: 'boi',
    q: '¿Necesito presentar un reporte BOI (Beneficial Ownership Information)?',
    a: 'La mayoría de LLCs y Corporaciones formadas en EE.UU. deben presentar un reporte BOI ante FinCEN bajo la Corporate Transparency Act. Las entidades formadas desde 2025 tienen 30 días desde la formación para presentarlo. Existen exenciones (grandes empresas operativas, entidades reguladas, ciertas organizaciones sin fines de lucro). LaunchForma ofrece presentación gestionada del BOI por $49 — visita /boi-reporting para detalles y el estado actual de cumplimiento de FinCEN.',
  },
  {
    q: '¿Y si mi nombre está tomado?',
    a: 'Verificamos la disponibilidad contra la base de datos de Sunbiz en tiempo real. Si tu primera elección no es distinguible en el registro, sugerimos alternativas — y puedes seguir iterando hasta encontrar uno que funcione.',
  },
  {
    q: '¿Son ustedes un bufete de abogados?',
    a: 'No. LaunchForma es un servicio de auto-ayuda para formar entidades empresariales en Florida. No proporcionamos asesoramiento legal ni te representamos en procedimientos legales. Para situaciones complejas (operaciones multi-estado, licencias profesionales, valores, etc.), recomendamos consultar a un abogado o CPA.',
  },
  {
    q: '¿Cuál es su política de reembolso?',
    a: 'La parte de LaunchForma de tu plan es reembolsable por 14 días si aún no hemos enviado tu trámite al estado. Una vez que Florida acepta el trámite, la porción de la tarifa estatal no es reembolsable por estatuto de Florida. Los servicios recurrentes (Agente Registrado, Alertas de Cumplimiento) pueden cancelarse en cualquier momento y no se auto-renovarán.',
  },
];

// ─── Wyoming ─────────────────────────────────────────────────────────────

const FAQ_WYOMING_EN: MarketingFaqItem[] = [
  {
    q: 'How long does it take to form a Wyoming LLC or Corporation?',
    a: 'About 15 minutes inside our wizard. We submit to the Wyoming Secretary of State the same business day. Standard Wyoming processing currently runs about 3 weeks. We offer an expedited option at checkout for an additional Wyoming state fee — final amount is confirmed at submission.',
  },
  {
    q: 'Are there any name restrictions in Wyoming I should know about?',
    a: "Yes. Wyoming requires names beginning with the letter \"A\" (or \"A.\", \"A &\", \"A J\" patterns) to be paper-filed for manual review by the Secretary of State. Names containing special characters also require manual filing. Restricted words like \"bank\", \"trust\", \"university\", and \"academy\" require approval from the relevant state agency. We surface these warnings inside the wizard and route the filing through manual review when needed.",
  },
  {
    q: 'What is the Wyoming filing fee?',
    a: 'Wyoming charges a flat $100 filing fee for both LLC Articles of Organization and Corporation Articles of Incorporation. That fee is included in every LaunchForma package — no surprise charges at checkout.',
  },
  {
    q: 'Why do people choose Wyoming for an LLC?',
    a: 'Wyoming has no state income tax on businesses, very strong asset-protection statutes (including charging-order protection for single-member LLCs), low ongoing fees, and a $60 minimum annual report. It is a popular choice for owners who want privacy and simple compliance.',
  },
  {
    q: 'Do I need a Wyoming registered agent?',
    a: 'Yes. Wyoming law requires every LLC and Corporation to designate a registered agent with a Wyoming physical street address (no P.O. Boxes). LaunchForma includes a Year-1 Wyoming registered agent free in every package; renewal is $119/year.',
  },
  {
    q: 'When is the Wyoming annual report due?',
    a: 'Annual reports are due on the first day of your anniversary month every year. The minimum License Tax is $60, or $0.0002 per dollar of in-state assets if higher. We track the deadline and remind you in advance.',
  },
  {
    q: 'Do I have to live in Wyoming to form a Wyoming LLC?',
    a: 'No. Wyoming does not require members or managers to live in the state — only your registered agent must have a Wyoming physical address (we supply one).',
  },
  {
    q: 'What about the EIN — do I need one?',
    a: 'You will need an EIN to open a business bank account, hire employees, or file federal taxes. Standard and Concierge packages include EIN handling. If you have a U.S. SSN or ITIN we can complete the IRS EIN online application within one business day. Foreign owners without an SSN/ITIN cannot use the IRS online tool — we file Form SS-4 by phone or fax on your behalf, which takes longer (and may require an identity verification step).',
  },
  {
    q: 'Does Wyoming require an Operating Agreement?',
    a: 'Wyoming does not require an Operating Agreement to be filed with the state, but banks and lenders typically demand one to open accounts or extend credit. Bank-Ready and Concierge packages include a custom Wyoming-tailored Operating Agreement.',
  },
  {
    id: 'boi',
    q: 'Do I need to file a BOI report with FinCEN for my Wyoming entity?',
    a: 'Yes — Wyoming entities are still subject to the federal Corporate Transparency Act. Most newly formed LLCs and Corporations must report Beneficial Ownership Information to FinCEN within 30 days of formation. LaunchForma offers managed BOI filing for $49 — see /boi-reporting for details.',
  },
  {
    q: 'Can a business or trust own my Wyoming LLC?',
    a: 'Yes. Wyoming permits another business entity (LLC, Corporation, trust) to be a member, manager, organizer, or owner. Inside our wizard you can mark each owner as either an Individual or a Business / Entity and provide the legal entity name plus state of formation. The owner entity will be printed on the Articles when applicable.',
  },
  {
    q: 'I formed in Wyoming but plan to operate in another state — what do I need to do?',
    a: "Forming in Wyoming doesn't authorize you to do business in another state. If you'll have an office, employees, or significant operations elsewhere, that state will usually require a separate \"foreign qualification\" (sometimes called \"Certificate of Authority\" or \"Statement of Foreign Registration\"). Each state has its own form, fee, and ongoing registered-agent requirement. We're rolling out foreign-qualification help as a separate product — flag your interest inside the wizard and we'll follow up.",
  },
  {
    q: 'Are you a law firm?',
    a: 'No. LaunchForma is a self-help service for forming Wyoming business entities. We do not provide legal advice or represent you in legal proceedings. For complex situations (multi-state operations, securities, professional licensing) we recommend consulting an attorney.',
  },
  {
    q: "What's your refund policy?",
    a: "The LaunchForma portion of your package is refundable for 14 days if we have not yet submitted your filing to Wyoming. Once Wyoming has accepted the filing, the state filing fee portion is non-refundable. Recurring services (Registered Agent, Compliance Alerts) can be cancelled at any time and will not auto-renew.",
  },
];

const FAQ_WYOMING_ES: MarketingFaqItem[] = [
  {
    q: '¿Cuánto tarda formar una LLC o Corporación en Wyoming?',
    a: 'Aproximadamente 15 minutos en nuestro asistente. Enviamos al Secretario de Estado de Wyoming el mismo día hábil. El procesamiento estándar de Wyoming tarda alrededor de 3 semanas. Ofrecemos una opción acelerada al pagar por una tarifa adicional del estado — el monto final se confirma al enviarlo.',
  },
  {
    q: '¿Hay restricciones de nombre que deba conocer en Wyoming?',
    a: 'Sí. Wyoming requiere que los nombres que comienzan con la letra "A" (o "A.", "A &", "A J") se presenten en papel para revisión manual del Secretario de Estado. Los nombres con caracteres especiales también requieren presentación manual. Palabras restringidas como "bank", "trust", "university" o "academy" requieren aprobación de la agencia estatal correspondiente. Mostramos estas advertencias dentro del asistente y enviamos el trámite a revisión manual cuando es necesario.',
  },
  {
    q: '¿Cuál es la tarifa de presentación en Wyoming?',
    a: 'Wyoming cobra una tarifa fija de $100 tanto para Articles of Organization de LLC como Articles of Incorporation de Corporación. Esa tarifa está incluida en cada plan de LaunchForma — sin cargos sorpresa al pagar.',
  },
  {
    q: '¿Por qué elegir Wyoming para una LLC?',
    a: 'Wyoming no tiene impuesto estatal sobre la renta para empresas, ofrece protección de activos muy fuerte (incluyendo charging-order protection para LLCs de un solo miembro), tarifas anuales bajas y un reporte anual mínimo de $60. Es una opción popular para propietarios que buscan privacidad y cumplimiento simple.',
  },
  {
    q: '¿Necesito un Agente Registrado en Wyoming?',
    a: 'Sí. La ley de Wyoming requiere que cada LLC y Corporación designe un Agente Registrado con dirección física en Wyoming (no Apartados Postales). LaunchForma incluye Agente Registrado del primer año gratis en cada plan; la renovación es $119/año.',
  },
  {
    q: '¿Cuándo se debe presentar el reporte anual de Wyoming?',
    a: 'Los reportes anuales se deben el primer día de tu mes de aniversario cada año. La License Tax mínima es $60, o $0.0002 por dólar de activos en el estado si es mayor. Rastreamos la fecha y te recordamos con tiempo.',
  },
  {
    q: '¿Tengo que vivir en Wyoming para formar una LLC de Wyoming?',
    a: 'No. Wyoming no requiere que los miembros o gerentes vivan en el estado — solo tu Agente Registrado debe tener dirección física en Wyoming (te damos uno).',
  },
  {
    q: '¿Y el EIN — lo necesito?',
    a: 'Necesitarás un EIN para abrir cuenta bancaria empresarial, contratar empleados o declarar impuestos federales. Los planes Bank-Ready y Concierge incluyen el EIN. Si tienes SSN o ITIN podemos completar la solicitud en línea del IRS en un día hábil. Propietarios extranjeros sin SSN/ITIN no pueden usar la herramienta en línea del IRS — presentamos el Formulario SS-4 por teléfono o fax en tu nombre, lo que tarda más (y puede requerir un paso de verificación de identidad).',
  },
  {
    q: '¿Wyoming requiere un Operating Agreement?',
    a: 'Wyoming no requiere presentar un Operating Agreement ante el estado, pero los bancos y prestamistas normalmente lo exigen. Los planes Bank-Ready y Concierge incluyen un Operating Agreement personalizado adaptado a Wyoming.',
  },
  {
    id: 'boi',
    q: '¿Necesito presentar un reporte BOI ante FinCEN para mi entidad de Wyoming?',
    a: 'Sí — las entidades de Wyoming siguen sujetas a la Corporate Transparency Act federal. La mayoría de LLCs y Corporaciones recién formadas deben reportar Beneficial Ownership Information a FinCEN dentro de 30 días desde la formación. LaunchForma ofrece presentación gestionada del BOI por $49 — visita /boi-reporting.',
  },
  {
    q: '¿Una empresa o fideicomiso puede ser dueño de mi LLC de Wyoming?',
    a: 'Sí. Wyoming permite que otra entidad (LLC, Corporación, fideicomiso) sea miembro, gerente, organizador o propietario. Dentro del asistente puedes marcar cada propietario como Individual o Empresa / Entidad y proporcionar el nombre legal y el estado de formación. La entidad propietaria se imprimirá en los Articles cuando corresponda.',
  },
  {
    q: 'Formé en Wyoming pero planeo operar en otro estado — ¿qué necesito hacer?',
    a: 'Formar en Wyoming no te autoriza a hacer negocios en otro estado. Si tendrás oficina, empleados u operaciones significativas en otro estado, ese estado normalmente exige un trámite de "foreign qualification" (también llamado "Certificate of Authority" o registro como entidad extranjera). Cada estado tiene su propio formulario, tarifa y agente registrado. Estamos lanzando ayuda con foreign qualification como producto separado — marca tu interés en el asistente y te contactaremos.',
  },
  {
    q: '¿Son ustedes un bufete de abogados?',
    a: 'No. LaunchForma es un servicio de auto-ayuda. No proporcionamos asesoría legal. Para situaciones complejas recomendamos consultar a un abogado.',
  },
  {
    q: '¿Cuál es la política de reembolso?',
    a: 'La parte de LaunchForma es reembolsable por 14 días si aún no enviamos el trámite a Wyoming. Una vez aceptado por el estado, la parte de la tarifa estatal no es reembolsable.',
  },
];

// ─── Delaware ────────────────────────────────────────────────────────────

const FAQ_DELAWARE_EN: MarketingFaqItem[] = [
  {
    q: 'How long does it take to form a Delaware LLC or Corporation?',
    a: 'About 15 minutes inside our wizard. Standard Delaware processing currently takes about 6 weeks (the Division of Corporations is backlogged). Delaware also offers an 8-business-day expedited service for an additional $50 state fee — you can choose either at checkout.',
  },
  {
    q: 'Can I keep my LLC member info off the public Certificate of Formation?',
    a: 'Yes — Delaware does NOT require initial LLC member names or addresses on the Certificate of Formation. We default to keeping members private and let you opt in to public disclosure inside the wizard. Most founders pick Delaware specifically for this privacy.',
  },
  {
    q: 'What are the Delaware filing fees?',
    a: 'Delaware charges $110 for an LLC Certificate of Formation and a $109 minimum for a Corporation Certificate of Incorporation (assuming up to 1,500 authorized shares with no par value). Higher share counts can change the corporate fee — we will flag any structure that triggers an upcharge.',
  },
  {
    q: 'Why do people choose Delaware?',
    a: "Delaware corporate law is widely considered the most predictable in the U.S., the Delaware Court of Chancery is the country's premier business court, and most venture-backed startups incorporate there because investors expect it. Delaware LLCs are also a strong choice for asset protection.",
  },
  {
    q: 'Do I need a Delaware registered agent?',
    a: 'Yes. Delaware law requires every LLC and Corporation to designate a registered agent with a Delaware physical street address. LaunchForma includes a Year-1 Delaware registered agent free in every package; renewal is $149/year (Delaware RA market is more expensive than other states).',
  },
  {
    q: 'When are Delaware annual taxes due?',
    a: 'Delaware LLCs do not file an annual report — they pay a flat $300 Annual Tax due June 1 each year. Delaware corporations file an Annual Report and pay Franchise Tax due March 1 each year (minimum tax + report is $225 for small companies, but it can rise sharply with authorized shares). We will alert you to the optimal calculation method as your business grows.',
  },
  {
    q: 'Do I have to live in Delaware to form a Delaware company?',
    a: 'No. Delaware does not require members, managers, officers, or directors to live in the state — only your registered agent needs a Delaware physical address (we provide one).',
  },
  {
    q: 'What about the EIN — do I need one?',
    a: 'Yes — for a business bank account, hiring, or federal taxes. Standard and Concierge packages include EIN handling. If you have a U.S. SSN or ITIN we file the IRS online EIN application within one business day. If you are a foreign founder without an SSN/ITIN, you cannot use the IRS online tool — we will file Form SS-4 by phone or fax for you (this takes longer and may require identity verification).',
  },
  {
    q: 'Does Delaware require an Operating Agreement (LLC) or Bylaws (Corp)?',
    a: 'Delaware law expects an Operating Agreement for LLCs and Bylaws for Corporations, but they are NOT filed with the state. Banks, investors, and tax advisors will all want copies. Bank-Ready and Concierge packages include a Delaware-tailored Operating Agreement; corporate bylaws are available as an add-on.',
  },
  {
    id: 'boi',
    q: 'Do I need to file a BOI report with FinCEN for my Delaware entity?',
    a: 'Yes — Delaware LLCs and Corporations are subject to the federal Corporate Transparency Act. Most entities formed in 2025 or later must file Beneficial Ownership Information with FinCEN within 30 days of formation. LaunchForma offers managed BOI filing for $49 — see /boi-reporting for details and current FinCEN enforcement status.',
  },
  {
    q: 'Can a business or holding company own my Delaware LLC?',
    a: "Yes. Delaware permits another business entity (LLC, Corporation, trust) to be a member, manager, organizer, or owner. Inside our wizard you can mark each owner as either an Individual or a Business / Entity and provide the legal entity name plus state of formation. The owner entity will be reflected on the appropriate filing record.",
  },
  {
    q: 'I formed in Delaware but plan to operate in another state — what do I need to do?',
    a: "Forming in Delaware doesn't authorize you to do business in another state. If you'll have an office, employees, or significant operations elsewhere, that state will usually require a separate \"foreign qualification\" filing (sometimes called \"Certificate of Authority\" or \"Statement of Foreign Registration\"). Each state has its own form, fee, and ongoing registered-agent requirement. We're rolling out foreign-qualification help as a separate product — flag your interest inside the wizard and we'll follow up.",
  },
  {
    q: "Can the Delaware Division of Corporations refuse my entity name?",
    a: "Yes. Delaware can refuse names for subjective reasons that we cannot fully pre-clear from outside the agency — for example names suggesting deception, public-safety issues, abusive patterns, or excessive length. We will surface a notice in the wizard reminding you that final name approval rests with the Division. If your name is refused we will work with you to pick a near-equivalent.",
  },
  {
    q: 'Are you a law firm?',
    a: 'No. LaunchForma is a self-help service for forming Delaware business entities. We do not provide legal advice or represent you in legal proceedings. For VC-track corporations, multi-state operations, or complex stock structures we recommend a Delaware attorney.',
  },
  {
    q: "What's your refund policy?",
    a: 'The LaunchForma portion of your package is refundable for 14 days if we have not yet submitted your filing to Delaware. Once Delaware has accepted the filing, the state filing fee portion is non-refundable. Recurring services (Registered Agent, Compliance Alerts) can be cancelled at any time and will not auto-renew.',
  },
];

const FAQ_DELAWARE_ES: MarketingFaqItem[] = [
  {
    q: '¿Cuánto tarda formar una LLC o Corporación en Delaware?',
    a: 'Aproximadamente 15 minutos en nuestro asistente. El procesamiento estándar de Delaware actualmente tarda alrededor de 6 semanas (la División de Corporaciones tiene retrasos). Delaware también ofrece servicio acelerado de 8 días hábiles por una tarifa adicional de $50 — puedes elegir cualquiera de los dos al pagar.',
  },
  {
    q: '¿Puedo mantener la información de los miembros de mi LLC fuera del Certificate of Formation público?',
    a: 'Sí — Delaware NO requiere los nombres ni direcciones de los miembros iniciales en el Certificate of Formation. Por defecto mantenemos la información privada y te permitimos optar por divulgarla en el asistente. Muchos fundadores eligen Delaware específicamente por esta privacidad.',
  },
  {
    q: '¿Cuáles son las tarifas de presentación en Delaware?',
    a: 'Delaware cobra $110 por un Certificate of Formation de LLC y un mínimo de $109 por un Certificate of Incorporation de Corporación (asumiendo hasta 1,500 acciones autorizadas sin valor nominal). Un mayor número de acciones puede cambiar la tarifa — te avisaremos.',
  },
  {
    q: '¿Por qué elegir Delaware?',
    a: 'La ley corporativa de Delaware es considerada la más predecible de EE.UU., la Court of Chancery es el principal tribunal de negocios del país, y la mayoría de startups con capital de riesgo se incorporan ahí porque los inversores lo esperan.',
  },
  {
    q: '¿Necesito un Agente Registrado en Delaware?',
    a: 'Sí. Cada LLC y Corporación de Delaware debe designar un Agente Registrado con dirección física en Delaware. LaunchForma incluye Agente Registrado del primer año gratis; la renovación es $149/año.',
  },
  {
    q: '¿Cuándo se deben pagar los impuestos anuales de Delaware?',
    a: 'Las LLCs de Delaware no presentan reporte anual — pagan un Annual Tax fijo de $300 con vencimiento el 1 de junio cada año. Las Corporaciones presentan Annual Report y pagan Franchise Tax con vencimiento el 1 de marzo (mínimo $225 para empresas pequeñas).',
  },
  {
    q: '¿Tengo que vivir en Delaware?',
    a: 'No. Delaware no requiere que miembros, gerentes, oficiales o directores vivan en el estado — solo el Agente Registrado debe tener dirección física en Delaware (te damos uno).',
  },
  {
    q: '¿Y el EIN — lo necesito?',
    a: 'Sí — para cuenta bancaria, contratación o impuestos federales. Los planes Bank-Ready y Concierge incluyen el EIN. Con SSN o ITIN podemos hacer la solicitud en línea del IRS en un día hábil. Sin SSN/ITIN no puedes usar la herramienta en línea del IRS — presentamos el Formulario SS-4 por teléfono o fax (toma más tiempo y puede requerir verificación de identidad).',
  },
  {
    q: '¿Delaware requiere Operating Agreement o Bylaws?',
    a: 'La ley de Delaware espera un Operating Agreement para LLCs y Bylaws para Corporaciones, pero NO se presentan ante el estado. Los bancos e inversores los exigirán. Los planes Bank-Ready y Concierge incluyen un Operating Agreement adaptado a Delaware.',
  },
  {
    id: 'boi',
    q: '¿Necesito presentar un reporte BOI ante FinCEN para mi entidad de Delaware?',
    a: 'Sí — las LLCs y Corporaciones de Delaware están sujetas a la Corporate Transparency Act federal. La mayoría de entidades formadas desde 2025 deben reportar Beneficial Ownership Information a FinCEN dentro de 30 días desde la formación. LaunchForma ofrece presentación gestionada del BOI por $49 — visita /boi-reporting.',
  },
  {
    q: '¿Una empresa o holding puede ser dueño de mi LLC de Delaware?',
    a: 'Sí. Delaware permite que otra entidad (LLC, Corporación, fideicomiso) sea miembro, gerente, organizador o propietario. Dentro del asistente puedes marcar cada propietario como Individual o Empresa / Entidad y proporcionar el nombre legal y el estado de formación. La entidad propietaria se reflejará en el registro correspondiente.',
  },
  {
    q: 'Formé en Delaware pero planeo operar en otro estado — ¿qué necesito hacer?',
    a: 'Formar en Delaware no te autoriza a hacer negocios en otro estado. Si tendrás oficina, empleados u operaciones significativas en otro estado, ese estado normalmente exige un trámite de "foreign qualification" (también llamado "Certificate of Authority" o registro como entidad extranjera). Cada estado tiene su propio formulario, tarifa y agente registrado. Estamos lanzando ayuda con foreign qualification como producto separado — marca tu interés en el asistente y te contactaremos.',
  },
  {
    q: '¿Puede la División de Corporaciones de Delaware rechazar mi nombre?',
    a: 'Sí. Delaware puede rechazar nombres por razones subjetivas que no podemos pre-aprobar desde fuera de la agencia — por ejemplo nombres que sugieran engaño, problemas de seguridad pública, patrones abusivos o excesiva longitud. Mostraremos un aviso en el asistente recordándote que la aprobación final del nombre la decide la División. Si rechazan tu nombre te ayudamos a elegir uno equivalente.',
  },
  {
    q: '¿Son ustedes un bufete de abogados?',
    a: 'No. LaunchForma es un servicio de auto-ayuda. No damos asesoría legal. Para corporaciones con capital de riesgo o estructuras complejas recomendamos un abogado de Delaware.',
  },
  {
    q: '¿Cuál es la política de reembolso?',
    a: 'La parte de LaunchForma es reembolsable por 14 días si aún no enviamos el trámite a Delaware. Una vez aceptado por el estado, la parte de la tarifa estatal no es reembolsable.',
  },
];

function buildComingSoonFaqEn(state: MarketingState): MarketingFaqItem[] {
  const name = state.name;
  return [
    {
      q: `Is LaunchForma available in ${name} yet?`,
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
      q: `¿LaunchForma ya está disponible en ${name}?`,
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
    if (state.code === 'WY') return locale === 'es' ? FAQ_WYOMING_ES : FAQ_WYOMING_EN;
    if (state.code === 'DE') return locale === 'es' ? FAQ_DELAWARE_ES : FAQ_DELAWARE_EN;
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
