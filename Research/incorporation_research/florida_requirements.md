# Research Report on Florida Business Incorporation Requirements

**DATE:** 2026-04-25

### **Executive Summary**

This report provides a comprehensive analysis of the legal and administrative requirements for forming Limited Liability Companies (LLCs) and Profit Corporations in the state of Florida. Prepared for the design and development team of a business incorporation web application, this document emphasizes actionable data fields, mandatory fees, processing timelines, and ongoing compliance obligations. The information herein is synthesized from official documentation provided by the Florida Department of State, Division of Corporations (Sunbiz), and is intended to serve as a foundational guide for constructing an intuitive and compliant user experience.

For Limited Liability Companies, the formation process centers on the submission of the Articles of Organization. Key data points that the application must capture include the precise LLC name with a required suffix, a principal street address and separate mailing address, and the designation of a registered agent with a physical Florida address. While listing managers or authorized representatives is optional, it is often a practical necessity for banking and regulatory purposes, a detail the application should communicate to the user. The standard filing fee is $125.00.

For Profit Corporations, the foundational document is the Articles of Incorporation. The application must collect data on the corporate name with a valid suffix, principal and mailing addresses, and registered agent details, similar to an LLC. A critical distinction is the requirement to specify the number of authorized stock shares, with a minimum of one. The incorporator's signature is also mandatory. The standard filing fee is $70.00.

A critical shared requirement for both entities is the appointment of a registered agent. This agent must be an individual or entity with a physical street address in Florida, available during business hours to accept legal and official correspondence. The application must ensure users understand this requirement and must capture the agent's explicit consent via a signature, which can be provided electronically.

Processing times in Florida are contingent on the method of submission. Online filings are significantly faster, typically processed within a few business days, whereas mail-in filings can take several weeks. The state does not offer a formal paid expedited service; speed is primarily achieved by leveraging the efficiency of the online Sunbiz portal. The application should guide users toward online filing while setting realistic expectations based on current state processing volumes.

Post-formation compliance is dominated by the mandatory Annual Report, which must be filed online between January 1st and May 1st of each year following the year of formation. This report updates entity information and carries a substantial fee ($138.75 for LLCs, $150.00 for Corporations). Failure to file by the May 1st deadline incurs a steep, non-waivable $400 late fee. Continued non-compliance leads to administrative dissolution. The application must incorporate a robust system for tracking these deadlines and sending timely reminders to users to ensure their businesses remain in good standing.

### **Introduction**

The objective of this research document is to furnish a detailed and actionable framework for the development of a web application designed to simplify the process of business incorporation in Florida. Initially focusing on the formation of Limited Liability Companies (LLCs) and Profit Corporations, the application aims to provide a seamless, guided experience for entrepreneurs. This report breaks down the complex landscape of state regulations into discrete components—data fields, procedural steps, financial outlays, and compliance checkpoints—to inform the application's user interface, database structure, and core logic. By translating the requirements set forth by the Florida Department of State's Division of Corporations into a structured format, this document will empower designers and developers to create a tool that is not only user-friendly but also rigorously compliant with state law. The analysis covers the entire lifecycle of a new entity, from pre-filing considerations through initial formation and onto the critical ongoing compliance tasks necessary to maintain active status in Florida.

### **Florida Limited Liability Company (LLC) Formation**

The creation of a Florida Limited Liability Company is formally achieved through the filing of a document known as the Articles of Organization with the Florida Department of State, Division of Corporations. This document serves as the legal charter for the LLC, establishing its existence and outlining its fundamental structure. The information provided in the Articles of Organization becomes part of the public record. Application designers must create a user-friendly workflow that accurately captures all statutorily required information while also providing context and guidance on optional but strategically important data fields.

#### **Mandatory Data Fields for LLC Articles of Organization**

The application must be designed to collect several specific pieces of information to ensure a successful filing of the Articles of Organization, as mandated by s.605.0201 of the Florida Statutes.

A primary and essential data field is the **Limited Liability Company Name**. The name chosen must be unique and distinguishable on the records of the Department of State. To assist users, the application should recommend or link to the Sunbiz records database for a preliminary name availability search. Furthermore, the name must legally signify its entity type by including one of the following suffixes: "Limited Liability Company," "L.L.C.," or "LLC." For professional service providers forming a Professional Limited Liability Company (P.L.L.C.), the name must contain "Chartered," "Professional Limited Liability Company," "P.L.L.C.," or "PLLC," and the application should prompt for the single professional purpose of the entity.

The application must capture two distinct addresses: the **Principal Place of Business Address** and the **Mailing Address**. The principal place of business must be a physical street address where the company's main office is located. In contrast, the mailing address can be a Post Office Box or a different address from the principal office. The interface should clearly differentiate between these two fields, explaining the distinction to the user.

Perhaps one of the most critical elements is the **Registered Agent Name and Address**. Every LLC in Florida must continuously maintain a registered agent. The application's interface must collect the full name of the individual or business entity serving as the agent and their physical Florida street address. It is imperative to programmatically reject Post Office Box addresses for the registered office, as they are statutorily unacceptable. The user interface should clearly state that an entity cannot serve as its own registered agent, although a principal or member of the LLC is permitted to do so. A crucial compliance checkpoint is securing the **Registered Agent's Signature**. The agent must explicitly consent to their appointment, acknowledging their responsibilities under Florida law. For online filings, typing the agent's name into the designated signature field is legally equivalent to a physical signature. The application must feature a distinct input for this electronic signature, along with a disclaimer that typing a name without permission constitutes forgery, a third-degree felony.

Finally, the Articles of Organization must be executed by an authorized individual. The application needs a field for the **Signature of an Authorized Representative**. Similar to the registered agent's consent, an electronic signature—the typed name of the person filing—is legally binding. This act of signing affirms, under penalty of perjury, that the information contained in the document is true.

#### **Optional Data Fields and Strategic Considerations**

Beyond the mandatory requirements, the Articles of Organization allow for the inclusion of optional information that can have significant practical implications. The application should present these as optional but provide clear explanations of their purpose to help users make informed decisions.

One of the most important optional sections pertains to the listing of **Managers or Authorized Representatives**. The application should provide fields for the names and street addresses of these individuals or entities. It is essential to explain the terminology: "MGR" is used to designate a manager in a manager-managed LLC, while "AMBR" (Authorized Member) or "AR" (Authorized Representative) denotes a person authorized to manage the company or execute documents on its behalf. While optional on the state form, the application should advise users that financial institutions and other state agencies, like the Division of Workers’ Compensation, often require this information to be officially on record with the state before opening a bank account or granting a workers' compensation exemption. Failing to list anyone can create significant administrative hurdles for the new business.

Another strategic option is the **Effective Date**. By default, an LLC's existence begins on the date the Articles are filed. However, the application can allow a user to specify a different effective date. This date can be up to five business days prior to the filing date or up to 90 days after. The most common strategic use, which the application should highlight, is for year-end filings. If an LLC is formed between October 1st and December 31st and does not plan to conduct business until the following year, specifying an effective date of January 1st will postpone the company's first Annual Report filing obligation by a full calendar year. This feature can save the user the cost and effort of an immediate annual report filing.

The form also allows for a **Limited Liability Company Purpose** clause. While this is mandatory for Professional LLCs, which must state a single, specific professional purpose, it is optional for standard LLCs. The application can provide a text field for this but should inform users that for non-professional entities, it is generally not required, as a Florida LLC automatically has the power to engage in any lawful business.

Finally, the application must collect a **Correspondence Name and Email Address**. While part of the cover letter or online submission process rather than the Articles themselves, this information is critical for the user. The application must stress that this email address will be the primary method by which the state sends official notifications, including the filing acknowledgment and, most importantly, future Annual Report reminders. Providing a valid, frequently monitored email address is essential for maintaining compliance.

### **Florida Profit Corporation Formation**

Establishing a Florida Profit Corporation requires the filing of Articles of Incorporation with the Florida Department of State, Division of Corporations, in accordance with Chapter 607 of the Florida Statutes. This document is the corporation's constitution, defining its name, structure, and purpose. The design of the web application must meticulously guide the user through the creation of this document, ensuring every statutory requirement is met to prevent rejection and delays. The process shares some similarities with LLC formation but has distinct requirements, particularly concerning stock and governance structure.

#### **Mandatory Data Fields for Corporation Articles of Incorporation**

The successful incorporation of a business hinges on the accurate completion of several mandatory fields within the Articles of Incorporation. The application must be structured to capture this information flawlessly.

The **Corporation Name** is the first critical piece of data. As with LLCs, the name must be distinguishable on state records. The application should feature a prominent name availability check tool. Crucially, the name must include an appropriate corporate suffix, such as "Corporation," "Company," "Incorporated," or their abbreviations ("Corp.," "Co.," "Inc."). For professional service firms organizing as a corporation, the name must use suffixes like "Chartered," "Professional Association," or "P.A."

The application must also request the **Principal Place of Business Address** and the **Mailing Address**. The principal address must be a physical street location, while the mailing address can be a P.O. Box. These fields should be clearly labeled and validated to ensure the correct format of information is collected.

Similar to an LLC, a corporation must appoint and maintain a **Registered Agent and Office**. The application must collect the agent's name and their physical Florida street address, explicitly prohibiting P.O. boxes for this purpose. The designated agent must formally accept the appointment by providing a signature. In the online filing context, this is accomplished via an electronic signature—the typing of their name—which holds the same legal weight as a wet-ink signature. The application must have a dedicated field for this and explain its legal significance.

A key differentiator for corporations is the requirement to specify the number of **Authorized Stock Shares**. The Articles of Incorporation must state the total number of shares the corporation is authorized to issue. The application must include a numerical input field for this purpose, with validation to ensure a minimum of one share is specified. While the state form is simple, the application could offer an informational note explaining that this number represents the maximum shares that *can* be issued, not what *must* be issued immediately.

The document must be signed by an **Incorporator**. The incorporator is the individual or entity that prepares and submits the Articles of Incorporation. The application needs a signature field for at least one incorporator. As with other signatures, a typed name in the online form serves as a valid electronic signature and an affirmation that the facts presented are true.

Finally, the state requires a **Correspondence Name and Email Address** to be provided with the filing. This is the contact point for receiving the official filing acknowledgment from the state, as well as crucial future communications, such as Annual Report reminders. The application should emphasize the importance of providing a durable and frequently-checked email address.

#### **Optional Data Fields and Strategic Considerations**

The web application should also handle several optional but important fields that can be included in the Articles of Incorporation, providing users with flexibility and control over their corporate structure.

Users may choose to list the initial **Officers and/or Directors**. The application can provide a section to input the names and street addresses of individuals serving in roles such as President, Secretary, Treasurer, and Director. While optional at the state filing level, the application should inform users that this information may be required by financial institutions for opening bank accounts or by other agencies like Florida's Division of Workers' Compensation for exemptions. This practical consideration often makes it advisable to include this information from the outset.

While a general-purpose clause like "Any and all lawful business" is sufficient for most corporations, the application should provide a field for a specific **Corporate Purpose**. This is particularly relevant for Professional Associations, which are required to state a single, specific professional purpose (e.g., "the practice of law"). The application should use conditional logic to make this field mandatory if the user has selected a professional entity type.

The option for an **Effective Date** is also available for corporations, with the same rules that apply to LLCs. The application should allow users to specify a date that is up to five business days before or up to 90 days after the filing date. It must also highlight the strategic advantage of setting a January 1st effective date for entities formed late in the previous year (October 1st to December 31st) to defer the first Annual Report filing requirement by a year.

By carefully structuring the data collection process for both mandatory and optional fields, and by providing clear, context-sensitive guidance, the web application can demystify the incorporation process and empower entrepreneurs to create a corporate entity that is both legally sound and practically structured for success.

### **Registered Agent Requirements in Detail**

The designation of a registered agent is a non-negotiable legal requirement for any LLC or corporation seeking to operate in Florida. The registered agent serves as the official point of contact between the business and the state, as well as the public, for formal communications and service of process. Given its universal importance across entity types, the application should dedicate a clear and comprehensive section to explaining and capturing this information, ensuring users understand their obligations and the consequences of non-compliance.

The primary **Role and Responsibilities** of a registered agent are to be consistently available at a physical address within Florida during normal business hours to receive official and legal documents on behalf of the business. This includes critical, time-sensitive correspondence such as service of process (lawsuit notifications), subpoenas, annual report reminders from the Secretary of State, and tax notices from the Florida Department of Revenue. The agent is then responsible for promptly forwarding these documents to the business owners or managers. The application should emphasize that the registered agent's role is crucial for keeping the business informed of legal and compliance matters, and failure in this function can have severe repercussions, such as a default judgment in a lawsuit if the company fails to respond.

Regarding **Eligibility and Qualifications**, the application must inform users that a Florida registered agent can be either an individual or another business entity. If an individual, they must be a resident of Florida and at least 18 years old. If a business entity, it must have an active filing or registration with the Florida Division of Corporations and be authorized to transact business in the state. An important rule to highlight is that a company cannot serve as its own registered agent. However, an individual associated with the business, such as a member, manager, officer, director, or employee, is permitted to serve as the registered agent, provided they meet the residency and availability requirements.

The **Address Requirements** for a registered agent are strict and must be enforced by the application's validation logic. The registered agent must maintain a physical street address in Florida, known as the registered office. Post Office boxes, private mailboxes, or virtual office services that only provide mail forwarding are explicitly not acceptable. The underlying principle is that there must be a physical location where a process server can hand-deliver legal documents. The application must make this distinction clear and reject any address that is not a valid Florida street address.

A fundamental part of the appointment process is the registered agent's **Designation and Consent**. The agent cannot be appointed without their knowledge and agreement. Florida law requires the designated registered agent to sign the formation documents, confirming their familiarity with and acceptance of the duties and obligations of the position. For filings made through the web application, this consent is captured via an electronic signature where the agent's name is typed into a specific signature block. The application must include this field and a corresponding affirmation statement, making it clear that this electronic signature is legally binding.

The application must also educate users on the **Consequences of Non-Compliance** with registered agent requirements. Failure to appoint and continuously maintain a registered agent can prevent the initial formation of the company. For an existing company, it can lead to administrative dissolution or revocation of its authority to do business in the state. This would cause the company to lose its "good standing," which can prevent it from entering into legal contracts, securing financing, or defending itself in court.

Finally, the application should provide a pathway for existing businesses to manage this requirement. This includes information on the process for **Changing the Registered Agent**, which involves filing a "Statement of Change of Registered Agent/Office" with the Division of Corporations and paying the associated fee, which is $25 for LLCs and $35 for corporations. This functionality could be a future module for the application, supporting the full lifecycle of the business.

### **Florida Filing Fees, Processing Times, and Optional Services**

An essential function of the business incorporation application is to provide users with transparent and accurate information regarding all costs and expected timelines associated with forming their entity. This section must be designed to dynamically calculate fees based on user selections and set realistic expectations for the processing of their documents by the Florida Department of State.

#### **Comprehensive Fee Schedule**

The application's fee calculation module must be built upon the official fee schedule provided by the Division of Corporations. For the initial formation of a **Limited Liability Company (LLC)**, the mandatory state fees total $125.00. This amount is composed of a $100.00 Filing Fee for the Articles of Organization and a separate $25.00 fee for the Designation of Registered Agent. The application should display these as line items to provide clarity to the user.

For the initial formation of a **Profit Corporation**, the total mandatory state fee is $70.00. This is broken down into a $35.00 Filing Fee for the Articles of Incorporation and a $35.00 fee for the Designation of Registered Agent. Again, presenting this breakdown helps the user understand the costs.

The application should also present users with the option to purchase ancillary services from the state at the time of filing. For LLCs, a **Certified Copy** of the Articles of Organization can be obtained for a fee of $30.00, and a **Certificate of Status**, which certifies the company's existence and active status, is available for $5.00. For Corporations, these optional services are priced differently: a Certified Copy costs $8.75 and a Certificate of Status also costs $8.75. The user interface should allow users to add these to their order, and the application must update the total fee calculation accordingly.

Beyond formation, the application's informational resources should also detail ongoing costs, most notably the fees for the mandatory **Annual Report**. For an LLC, the annual report fee is $138.75. For a Profit Corporation, the fee is $150.00. A critical detail to program into the application's reminder system is the steep **$400.00 late fee** that is automatically assessed if the annual report is filed after the May 1st deadline. The application should also be aware of other potential fees, such as those for filing amendments ($25 for LLCs, $35 for corporations) or for reinstatement following administrative dissolution ($100 for an LLC plus past due annual report fees; $600 for a corporation plus past due annual report fees).

#### **Payment Methods and Processing Timelines**

The application must clearly communicate the available **Payment Methods**. For online filings, the state accepts major credit cards (Visa, MasterCard, Discover, American Express) and payments from a prepaid Sunbiz E-File Account. Mail-in filings must be accompanied by a check or money order made payable to the "Florida Department of State."

The **Processing Timelines** are a function of the filing method. The application should strongly recommend online filing for the fastest service. According to state-provided data for April 2026, new entity filings submitted online are typically processed within 1-2 business days, while mail-in filings can take significantly longer, often 10-15 business days plus mail transit time. The Division of Corporations processes all filings, whether online or by mail, in the order they are received.

It is crucial to clarify the notion of **Expedited Service**. The Florida Division of Corporations does not offer an official, state-sanctioned expedited filing service for an additional fee. While some third-party services may advertise "rush" filing, they cannot change the state's internal processing queue. The fastest possible filing is achieved by submitting an accurate, error-free application online. The application should manage user expectations by stating that while it ensures immediate submission, the ultimate processing time is controlled by the state's current workload. Several factors can influence timelines, including seasonal peaks in filing volume (especially around the beginning of the year and the annual report deadline) and errors or omissions in the application, which will lead to rejection and require the user to restart the process.

### **Post-Formation and Ongoing Compliance**

The value of a business incorporation application extends far beyond the initial filing. A truly effective platform will support entrepreneurs throughout the life of their business by helping them navigate ongoing compliance requirements. The most significant of these in Florida is the mandatory Annual Report. The application must be designed to track, remind, and facilitate this critical yearly task to prevent penalties and maintain the business's good standing with the state.

#### **The Annual Report Requirement**

The application must educate users on the purpose and process of the **Annual Report**. It is not a financial statement but rather a required yearly filing that updates or confirms the business's information on the public record. This includes the entity's principal and mailing addresses, registered agent information, and the names and addresses of its principals (such as officers, directors, managers, or authorized members). Every Florida LLC and corporation must file an annual report each year to remain active.

The official **Filing Period** is a critical piece of data for the application's compliance module. The window for filing the Annual Report opens on January 1st and closes at 11:59 PM Eastern Time on May 1st. The application should be programmed to send a series of escalating reminders to users as this deadline approaches. The **Filing Process** is predominantly online via the Sunbiz portal. The application should provide a direct link and a guided walkthrough for this process. While a mail-in option exists, it is slower and less efficient.

During the annual report filing, users can make certain changes to their company's record. The application should inform users that they can update officer/director/manager addresses, change their registered agent or office address, and update their principal office and mailing addresses directly on the report. However, a business name change cannot be done through the annual report; it requires a separate amendment filing.

#### **Annual Report Fees and Penalties**

The cost associated with the Annual Report is substantial and must be clearly communicated. For the 2026 filing year, the fee for a Profit Corporation is $150.00, and for a Limited Liability Company, it is $138.75. The application should remind users of these upcoming costs.

The most critical compliance point for the application to emphasize is the severe penalty for late filing. A **$400.00 late fee** is automatically and inflexibly applied to all LLC and profit corporation annual reports submitted after the May 1st deadline. There is no provision for waiving this fee. This penalty is a significant financial burden, and the application's reminder system is the user's best defense against it.

#### **Consequences of Non-Filing and Other Compliance**

The consequences of failing to file the Annual Report are draconian. If an entity fails to file its report by the third Friday in September, the state will initiate **Administrative Dissolution** or revocation. This means the company legally ceases to exist and loses its liability protection and authority to conduct business. The only way to rectify this is through a costly and cumbersome reinstatement process, which involves paying not only the reinstatement fee but also all past-due annual report fees.

The application should also serve as a repository for information on other compliance matters. This includes providing guidance on how to file **Amendments** to the Articles of Organization or Incorporation when substantive changes are needed (like a name change). It should also include a prominent notice regarding the federal **Beneficial Ownership Information (BOI) Reporting** requirement, which took effect in 2024. While this is a federal, not a state, requirement reported to the Financial Crimes Enforcement Network (FinCEN), the Florida Division of Corporations alerts filers to this obligation, and the application should do the same to provide comprehensive support. Finally, if a user decides to close their business, the application can guide them on the proper procedure for filing Articles of Dissolution to formally wind down the entity, which is a necessary step to avoid future annual report obligations.

### **Conclusion**

This research establishes a detailed blueprint for the development of a business incorporation web application tailored to the specific legal framework of Florida. By meticulously structuring the user experience around the official requirements for LLC and Corporation formation, the application can offer a significant value proposition to entrepreneurs, transforming a potentially confusing bureaucratic process into a straightforward, guided workflow.

For the application's designers and developers, the key takeaways are threefold. First, accuracy in data collection is paramount. The application must capture every mandatory field—from precise name syntax to the physical address of the registered agent—without error to ensure successful first-pass filing. Second, transparency regarding fees and timelines is essential for building user trust. The system must clearly itemize all state fees, explain optional services, and set realistic expectations for processing times, guiding users toward the most efficient online filing path. Third, and perhaps most critically for long-term user retention, the application must function as a proactive compliance partner. By integrating a robust reminder system for the Annual Report deadline and the associated penalties, the application can safeguard businesses from costly fines and the severe consequence of administrative dissolution.

By adhering to the data points, processes, and compliance checkpoints outlined in this report, the development team can create a platform that not only simplifies the act of incorporation but also empowers Florida's entrepreneurs to maintain their businesses in good standing with the state, fostering a long-term relationship built on reliability and indispensable support.

# References
1. [Articles of Incorporation (FL) | Practical Law - content.next.westlaw.com](https://content.next.westlaw.com/practical-law/document/Ifcea49107d6811e38578f7ccc38dcbee/Articles-of-Incorporation-FL?viewType=FullText&transitionType=Default&contextData=(sc.Default))
2. [Document Processing Dates - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/document-processing-dates/)
3. [Florida LLC Formation Timeline 2025 - Kew Legal](https://kewlegal.com/florida-llc-formation-timeline_2025/)
4. [Forms & Fees - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/forms/)
5. [Limited Liability Company - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/forms/limited-liability-company/)
6. [LLC Formation Processing Time By State (2026) - Business Rocket](https://www.businessrocket.com/business-corner/start/llc/formation-time/)
7. [Florida Limited Liability Company - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/start-business/efile/fl-llc/)
8. [File Annual Report - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/)
9. [Florida Registered Agent LLC | Convenient, Professional, Trustworthy - floridaregisteredagent.net](https://www.floridaregisteredagent.net/)
10. [Instructions for Articles of Organization (FL LLC) - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/start-business/efile/fl-llc/instructions/)
11. [How Long Does it Take to Form an LLC in Florida? - Venturesmarter](https://venturesmarter.com/how-long-does-it-take-to-form-an-llc/florida/)
12. [Florida Registered Agent Requirements (2026): What Every Business Owner Must Know - floridaagents.net](https://floridaagents.net/business/florida-registered-agent-requirements/)
13. [Florida Profit Corporation - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/start-business/efile/fl-profit-corporation/)
14. [Fees - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/forms/fees/)
15. [Division FAQs - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/about-us/faqs/)
16. [Florida Registered Agent: A Complete Guide - legalzoom.com](https://www.legalzoom.com/articles/registered-agent-in-florida)
17. [Corporations - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/forms/corporations/)
18. [search-results - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/search-results/?q=annual+report)
19. [Instructions for Profit Corporation - form.sunbiz.org](http://form.sunbiz.org/pdf/cr2e010.pdf)
20. [Instructions for Profit Corporation & Articles of Incorporation Cover Letter & Form - files.floridados.gov](https://files.floridados.gov/media/702398/cr2e047.pdf)
21. [Florida Limited Liability Company - efile.sunbiz.org](https://efile.sunbiz.org/llc_file.html)
22. [e-File - Profit Corporation - efile.sunbiz.org](https://efile.sunbiz.org/profit_file.html)
23. [INSTRUCTIONS FOR A FLORIDA LIMITED LIABILITY COMPANY - form.sunbiz.org](http://form.sunbiz.org/pdf/cr2e047.pdf)
24. [Instructions for a Florida Non-Profit Corporation - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/start-business/efile/fl-nonprofit-corporation/instructions/)
25. [e-File - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/manage-business/efile/)
26. [State by State LLC and Corporation formation Turnaround Times - activefilings.com](https://www.activefilings.com/information/turnaround/)
27. [Update Information - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/manage-business/update-information/)
28. [Instructions for Annual Report - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/instructions)
29. [Instructions for a Profit Corporation - Division of Corporations - Florida Department of State](https://dos.fl.gov/sunbiz/start-business/efile/fl-profit-corporation/instructions/)