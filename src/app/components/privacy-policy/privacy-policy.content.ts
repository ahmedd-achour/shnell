/**
 * Shnell privacy policy — the exact content shipped in the Shnell user (client)
 * mobile app, kept in English and French. Section order matches
 * `shnell_android_ios_client/lib/Account/privacyPolicy.dart`.
 *
 * Bodies use a tiny markdown subset rendered by the component:
 *   **bold**, "- " bullet lists, "1." numbered lists, blank-line paragraphs,
 *   bare URLs and e-mails become links.
 */
export interface PolicySection { h: string; b: string; }
export interface PolicyLang { title: string; updated: string; sections: PolicySection[]; }

const EN: PolicyLang = {
  title: 'Privacy Policy',
  updated: 'This policy was last updated on 22 August 2025.',
  sections: [
    {
      h: '1. Introduction',
      b: `SHNELL Logistics (“we”) is committed to protecting your privacy and ensuring transparency in how we handle your personal data. This Privacy Policy describes SHNELL Logistics practices, a platform connecting customers, professional drivers, and businesses requiring truck-based logistics services, including freight transport, B2B logistics, heavy cargo transport, intercity deliveries, and on-demand transport solutions.

SHNELL aims to simplify access to transport services, reduce logistics fragmentation, create more earning opportunities for driver partners, and provide more competitive pricing for customers while ensuring reliable service.

The platform includes a driver verification system to enhance safety and trust. We collect and process operational data to optimize routes, reduce empty returns, and improve overall logistics efficiency.

By using the application, you agree to this policy. Last updated: **August 22, 2025**.`,
    },
    {
      h: '2. Information We Collect',
      b: `We collect various types of information to provide, improve, and personalize our services. The information we collect falls into the following categories:

**2.1 Information You Provide Directly**

When you interact with the App, you may provide the following types of personal information:

- **Account Creation**: When registering as a Customer or Driver, you provide details such as your full name, email address, phone number, and, for Drivers, a valid national ID (e.g., CIN for Tunisian residents) or driver’s license number. Business Partners provide company details, including business name, registration number, and contact information.
- **Profile Information**: Customers may provide delivery preferences and addresses. Drivers provide vehicle details (e.g., type, capacity, license plate), professional certifications, and banking information for payments.
- **Service Requests**: Customers submit details about their logistics needs, such as package size, weight, pickup and delivery locations, and special instructions (e.g., fragile items or time-sensitive deliveries).
- **Communication Data**: Information provided when you contact our support team via email, in-app chat, or phone, including your messages, inquiries, and feedback.
- **Business Partner Data**: For B2B clients, we collect additional details such as tax identification numbers, contract details, and logistics requirements (e.g., fleet size, delivery schedules).

**2.2 Information Collected Automatically**

We automatically collect certain information when you use the App to enhance functionality and improve user experience:

- **Device Information**: We collect data about your device, including device type (e.g., iOS or Android), operating system version, unique device identifiers (e.g., UDID or IMEI), IP address, and browser type.
- **Location Data**: With your consent, we collect real-time geolocation data to enable features such as tracking shipments, matching Drivers with Customers, and optimizing delivery routes. Customers’ pickup and delivery locations are stored for service fulfillment.
- **Usage Data**: We track how you interact with the App, including pages visited, features used (e.g., tracking, quote requests), time spent, and click patterns.
- **Log Data**: Server logs capture technical details such as API calls, error reports, and timestamps to monitor App performance and troubleshoot issues.
- **Cookies and Tracking Technologies**: Our website uses cookies, web beacons, and similar technologies to track user behavior, personalize content, and analyze traffic. You can manage cookie preferences via your browser settings.

**2.3 Information from Third Parties**

We may receive information from third-party sources to enhance our services or comply with legal obligations:

- **Mapping Services**: Mapbox provides location-based data to optimize routing and display maps within the App.
- **Analytics Providers**: Tools like Firebase Analytics provide aggregated data on user behavior and App performance.
- **Verification Services**: For Drivers, we use third-party services to verify identity, driving records, and vehicle compliance with safety regulations.
- **Business Partners**: B2B clients may share employee or contractor data (e.g., contact details) to facilitate logistics coordination.

**2.4 Sensitive Information**

We may collect sensitive information, such as national ID numbers, only with your explicit consent or as required by law. We take additional measures to protect this data, as outlined in Section 5 (Data Security).`,
    },
    {
      h: '3. How We Use Your Information',
      b: `We use the information we collect to operate, improve, and personalize the App’s services. The primary purposes include:

**3.1 Service Delivery**

- **Matching Customers and Drivers**: We use Customer location and service request data to match them with suitable Drivers based on proximity, vehicle capacity, and availability.
- **Order Fulfillment**: Information such as package details, pickup and delivery locations, and special instructions is used to ensure accurate and timely deliveries.
- **Tracking and Updates**: Real-time location data enables shipment tracking for Customers and route optimization for Drivers.

**3.2 Improving User Experience**

- **Personalization**: We analyze usage data to tailor the App experience, such as suggesting preferred services or displaying relevant promotions.
- **Performance Monitoring**: Device and log data help us identify and fix technical issues, ensuring a smooth user experience.
- **Analytics**: Aggregated data from Firebase Analytics and similar tools informs feature enhancements and service improvements.

**3.3 Communication**

- **Notifications**: We send in-app, email, or SMS notifications about order statuses, account updates, promotions, or policy changes. You can manage notification preferences in the App settings.
- **Customer Support**: Your contact details and communication history are used to respond to inquiries, resolve issues, and provide assistance.

**3.4 Driver Management**

- **Performance Display**: Before accepting a delivery request, Drivers can view Customer performance metrics, such as average rating (based on punctuality, communication, and payment history) and order frequency. This helps Drivers make informed decisions.
- **Deal Acceptance**: Drivers have the autonomy to accept or reject delivery requests based on the displayed information, with no penalty for rejections unless they violate our Terms of Use.
- **Account Management**: Driver information, including vehicle details and certifications, is used to verify eligibility and manage account status.
- **Driver Responsibility**: Drivers are responsible for the goods from the moment they confirm pickup until delivery confirmation.

**3.5 Legal and Regulatory Compliance**

- **Tax Reporting**: Transaction data may be used to comply with tax obligations, such as reporting Driver earnings to relevant authorities.
- **Fraud Prevention**: We analyze usage patterns and third-party data to detect and prevent fraudulent activities, such as unauthorized account access or payment fraud.
- **Legal Obligations**: We may use your data to respond to legal requests, such as court orders or regulatory investigations.

**3.6 Marketing and Promotions**

- With your consent, we use your contact information to send promotional offers, newsletters, or updates about new services. You can opt out at any time via the App or by contacting us.
- We may use aggregated, anonymized data to create marketing insights or case studies without identifying individual users.

**3.7 Research and Development**

- We use anonymized data to conduct research, develop new features, and improve our algorithms for matching, routing, and pricing.
- Feedback provided through surveys or support interactions helps us enhance the App’s functionality and user satisfaction.`,
    },
    {
      h: '4. How We Share Your Information',
      b: `We may share your information with specific parties to deliver our services, comply with legal obligations, or improve the App. We ensure that any sharing is conducted responsibly and in accordance with applicable laws.

**4.1 Sharing with Other Users**

- **Customer-Driver Interactions**: When a Customer submits a service request, their name, contact details (e.g., phone number), pickup/delivery locations, and package details are shared with the assigned Driver to facilitate the delivery.
- **Driver Performance Display**: Customers can view Driver performance metrics, such as ratings (based on reliability, communication, and delivery success) and years of experience, before confirming a booking.
- **B2B Coordination**: For Business Partners, we may share logistics-related data (e.g., delivery schedules, employee contact details) with Drivers or third-party providers to fulfill contracts.

**4.2 Sharing with Service Providers**

We engage trusted third-party service providers to support our operations. These providers are contractually obligated to protect your data and use it only for the purposes we specify:

- **Mapping and Navigation**: Mapbox receives location data to provide mapping, routing, and geolocation services within the App.
- **Analytics Providers**: Firebase Analytics and other tools receive anonymized usage data to generate insights on App performance and user behavior.
- **Cloud Storage**: We use secure cloud providers (e.g., AWS, Google Cloud) to store user data, with encryption and access controls in place.
- **Verification Services**: Third-party services verify Driver identities, driving records, and vehicle compliance to ensure safety and regulatory compliance.
- **Customer Support Tools**: Platforms like Zendesk manage support tickets and store communication data to assist users effectively.

**4.3 Legal and Regulatory Sharing**

- We may share your information with government authorities, law enforcement, or regulatory bodies when required by law, such as in response to subpoenas, court orders, or tax audits.
- In cases of suspected fraud, abuse, or illegal activity, we may share relevant data with authorities to investigate or prevent harm.

**4.4 Business Transfers**

- If shnell Logistics is involved in a merger, acquisition, or asset sale, your information may be transferred to the acquiring entity. You will be notified of any such transfer and given the opportunity to opt out where applicable.
- We will ensure that any transferee agrees to protect your data in accordance with this policy or a comparable standard.

**4.5 Anonymized Data Sharing**

- We may share aggregated or anonymized data (e.g., delivery trends, user demographics) with partners, researchers, or advertisers. This data does not identify individuals and is used for statistical or marketing purposes.

**4.6 Consent-Based Sharing**

- We will not share your personal information with third parties for marketing purposes without your explicit consent. You can withdraw consent at any time via the App or by contacting us.`,
    },
    {
      h: '5. Data Security',
      b: `We prioritize the security of your personal information and implement robust measures to protect it from unauthorized access, loss, misuse, or alteration.

**5.1 Technical Safeguards**

- **Encryption**: All sensitive data, including personal identifiers, is encrypted in transit (using TLS 1.2 or higher) and at rest (using AES-256 encryption).
- **Access Controls**: Only authorized personnel with a legitimate need can access user data, and access is restricted through role-based permissions and multi-factor authentication.
- **Secure Servers**: Our servers are hosted in secure data centers with physical and digital protections, including firewalls, intrusion detection systems, and regular security patches.

**5.2 Organizational Safeguards**

- **Employee Training**: All employees and contractors undergo regular training on data protection and privacy best practices.
- **Third-Party Audits**: We engage independent security firms to conduct regular audits of our systems and processes to identify and address vulnerabilities.
- **Vendor Management**: All third-party service providers are vetted for compliance with data protection standards, and contracts include strict confidentiality clauses.

**5.3 Incident Response**

- In the unlikely event of a data breach, we have a comprehensive incident response plan to investigate, mitigate, and notify affected users promptly, as required by law.
- We maintain detailed logs of security incidents to improve our defenses and prevent recurrence.

**5.4 User Responsibilities**

- You are responsible for maintaining the confidentiality of your account credentials (e.g., password, PIN). Do not share these with others.
- Use strong, unique passwords and enable two-factor authentication (if available) to enhance your account security.
- Report any suspected unauthorized access to your account immediately to support@shnell.com.`,
    },
    {
      h: '6. Data Retention',
      b: `We retain your personal information only for as long as necessary to fulfill the purposes outlined in this policy or to comply with legal, regulatory, or operational requirements.

**6.1 Retention Periods**

- **Customer Data**: Information related to service requests (e.g., delivery details, payment records) is retained for 5 years after the last transaction to comply with tax and accounting regulations.
- **Driver Data**: Driver profiles, including certifications and transaction history, are retained for 7 years after account closure to comply with transportation and labor laws.
- **Communication Data**: Support tickets and correspondence are retained for 3 years to ensure quality control and resolve disputes.
- **Location Data**: Real-time location data is retained for 30 days after a delivery is completed, unless required for legal purposes or dispute resolution.
- **Anonymized Data**: Aggregated, non-identifiable data may be retained indefinitely for analytics and research purposes.

**6.2 Data Deletion**

- Upon account cancellation, you may request the deletion of your personal data via the App or by contacting support@shnell.com. We will delete your data within 30 days, except where retention is required by law (e.g., tax records).
- Anonymized data that cannot be linked to you may be retained for statistical purposes.
- Backups are securely deleted after 90 days to ensure no residual data remains.

**6.3 Data Archiving**

- Inactive accounts (no activity for 2 years) may be archived to reduce active storage. You will be notified before archiving, and you can reactivate your account by logging in or contacting support.
- Archived data is stored securely and subject to the same protections as active data.`,
    },
    {
      h: '7. Your Data Protection Rights',
      b: `Depending on your location, you have certain rights regarding your personal data under applicable data protection laws, such as the GDPR, CCPA, or other regional regulations.

**7.1 Right to Access**

- You may request a copy of the personal data we hold about you, including details on how it is processed and shared.
- To request access, contact support@shnell.com or use the “Data Request” feature in the App. We will respond within 30 days (or 45 days for complex requests).

**7.2 Right to Correction**

- If your personal data is inaccurate or incomplete, you may request corrections via the App’s profile settings or by contacting support.
- We will update your information promptly and notify any third parties with whom the data was shared.

**7.3 Right to Deletion**

- You may request the deletion of your personal data, subject to legal retention requirements (e.g., tax records).
- Deletion requests can be submitted via the App or by emailing support@shnell.com. We will confirm deletion within 30 days.

**7.4 Right to Restrict Processing**

- You may request that we limit the processing of your data (e.g., to storage only) if you contest its accuracy, lawfulness, or necessity.
- Restricted data will not be used for active processing but may be retained for legal purposes.

**7.5 Right to Data Portability**

- You may request a machine-readable copy of your personal data (e.g., in CSV or JSON format) to transfer to another service.
- We will provide this data within 30 days, free of charge, for standard requests.

**7.6 Right to Object**

- You may object to the processing of your data for marketing purposes or where processing is based on our legitimate interests.
- To opt out of marketing, use the App’s settings or click “Unsubscribe” in promotional emails.

**7.7 Right to Withdraw Consent**

- Where processing is based on your consent (e.g., location data, marketing), you may withdraw consent at any time via the App or by contacting us. Withdrawal does not affect the lawfulness of prior processing.

**7.8 Right to Non-Discrimination**

- We will not discriminate against you for exercising your data protection rights, such as by charging higher prices or denying services.

**7.9 Filing a Complaint**

- If you believe we have violated your data protection rights, you may file a complaint with your local data protection authority (e.g., CNIL in France, ICO in the UK, or the California Attorney General’s office).
- You may also contact us directly at support@shnell.com to resolve any concerns informally.

**7.10 How to Exercise Your Rights**

- Submit requests via the App’s “Data Request” feature or email support@shnell.com with your name, account details, and the specific right you wish to exercise.
- We may require identity verification (e.g., a copy of your ID) to prevent unauthorized requests.
- Responses will be provided in writing (via email or in-app notification) within the legally required timeframe.`,
    },
    {
      h: '8. Third-Party Services',
      b: `The App integrates with third-party services to provide essential functionality. These services have their own privacy policies, which apply separately to their processing of your data.

**8.1 Mapping and Navigation**

- **Mapbox**: Provides mapping, geolocation, and routing services. Mapbox receives location data to generate maps and optimize delivery routes. See Mapbox’s Privacy Policy at www.mapbox.com/privacy.
- **Analytics Providers**: Firebase Analytics and other tools receive anonymized usage data to generate insights on App performance and user behavior. Firebase may use device identifiers and usage patterns. See Google’s Privacy Policy at www.google.com/policies/privacy.
- **Mixpanel**: Tracks user interactions to improve App features. Mixpanel collects anonymized data, such as click patterns and session duration. See Mixpanel’s Privacy Policy at www.mixpanel.com/legal/privacy-policy.
- **Customer Support**: Zendesk manages support tickets and communication history. Zendesk stores your contact details and messages. See Zendesk’s Privacy Policy at www.zendesk.com/company/privacy.
- **Verification Services**: Jumio verifies Driver identities and documents (e.g., driver’s license, national ID). Jumio processes sensitive information securely. See Jumio’s Privacy Policy at www.jumio.com/legal-information/privacy-policy.
- **Onfido**: An alternative verification service for Driver onboarding. Onfido handles identity verification data. See Onfido’s Privacy Policy at www.onfido.com/privacy.
- **Cloud Storage**: Amazon Web Services (AWS) stores user data securely in encrypted form. AWS does not access or process your data beyond storage services. See AWS’s Privacy Policy at aws.amazon.com/privacy.
- **Google Cloud**: Provides additional cloud storage and processing capabilities. See Google’s Privacy Policy at www.google.com/policies/privacy.

**8.6 User Responsibility**

- You acknowledge that third-party services are governed by their respective privacy policies, and shnell is not responsible for their practices.
- We select reputable providers with strong data protection standards and ensure they comply with applicable laws.`,
    },
    {
      h: "9. Children's Privacy",
      b: `The App is not intended for users under 18 years of age. We do not knowingly collect personal information from children under 18.

**9.1 Age Restrictions**

- Users must be at least 18 years old to create an account or use our services.
- Drivers must meet additional age and licensing requirements as specified in our Terms of Use (e.g., minimum age of 21 for certain vehicle types).

**9.2 Parental Consent**

- If we become aware that a user under 18 has provided personal information without verifiable parental consent, we will delete the information promptly.
- Parents or guardians who believe their child has submitted data to the App should contact support@shnell.com immediately.

**9.3 COPPA Compliance**

- For U.S. users, we comply with the Children’s Online Privacy Protection Act (COPPA). We do not collect, use, or share data from children under 13 without parental consent.`,
    },
    {
      h: '10. Commission Structure',
      b: `shnell Logistics operates on a transparent commission-based model to ensure fair compensation for Drivers and sustainable operations for the platform.

**10.1 Commission Rate**

- **Standard Commission**: shnell deducts a **7% commission** from the total fare of each completed delivery or service. This commission covers platform maintenance, customer support, and operational costs.
- **Example**: If a delivery fare is 100 TND (Tunisian Dinar), shnell deducts 7 TND as commission, and the Driver receives 93 TND.
- **Transparency**: The commission is clearly displayed to Drivers before accepting a delivery request and in the transaction history within the App.

**10.2 Additional Fees**

- **Service Fees**: Customers may incur additional fees for premium services, such as express delivery or secure transport. These fees are disclosed during the booking process and do not affect the Driver’s commission.
- **Taxes**: Applicable taxes (e.g., VAT, sales tax) are calculated and added to the fare based on local regulations. Taxes are separate from the commission and are clearly itemized in receipts.
- **Surge Pricing**: During high-demand periods, fares may increase due to surge pricing. The 7% commission applies to the surged fare, increasing Driver earnings proportionally.

**10.3 Payment Processing**

- Customer payments are processed via in-office cash payments or mandat payments for account recharges, as online payments are not currently supported.
- Driver payouts are processed weekly (every Monday) to the Driver’s registered bank account or digital wallet, after deducting the 7% commission and any applicable taxes.
- Drivers can view their earnings, commission deductions, and payout schedules in the App’s “Earnings” section.

**10.4 Disputes**

- If a Customer disputes a charge, shnell will investigate and may temporarily hold the Driver’s payout until the dispute is resolved.
- Drivers will be notified of any disputes via email or in-app notifications and can provide evidence (e.g., delivery confirmation, photos) to support their case.
- Resolved disputes in favor of the Driver will result in immediate payout, minus the standard 7% commission.`,
    },
    {
      h: '11. Cancellation Policy & The 2ⁿ Discipline System',
      b: `**Sanctions Scale**:
1. **First offense**: Warning and administrative call (0 days).
2. **Second offense**: 1-day suspension.
3. **Third offense**: 2-day suspension.
4. **Fourth offense**: 4-day suspension.
5. **Fifth offense**: 8-day suspension.
6. **Subsequent**: 16, 32, up to 64 days.
- **Cancellation Recovery**: For every 5 successful services, 1 cancellation is removed from the driver's record, allowing them to gradually restore reliability.
- **Annual Reset**: Records are reset annually.

**11.3 Mutual Agreement**: If both parties agree to cancel (e.g., goods don't fit in the truck), management may waive the fees.`,
    },
    {
      h: '12. Account Suspension',
      b: `We maintain platform integrity through automated and manual protocols.

**12.1 Automated Suspension (Discipline System)**

- Driver accounts are automatically suspended according to the 2ⁿ system mentioned in Section 11.2. During suspension (1 to 64 days), drivers cannot receive new orders but can view history.
- This automated ban cannot be lifted manually unless a technical error is proven.

**12.2 Termination & Permanent Ban**

- **Fraud**: Fake orders or price manipulation.
- **Commission Evasion**: Attempting to complete deals off-platform.
- **Behavior**: Harassment or unsafe conduct.
- **User Abuse**: Customers who repeatedly cancel after driver arrival will be permanently banned.`,
    },
    {
      h: '13. Driver Autonomy',
      b: `Drivers have full autonomy to accept or reject requests before booking. Once accepted, strict reliability protocols apply.`,
    },
  ],
};

const FR: PolicyLang = {
  title: 'Politique de confidentialité',
  updated: 'Cette politique a été mise à jour pour la dernière fois le 22 août 2025.',
  sections: [
    {
      h: '1. Introduction',
      b: `La société SHNELL Logistics (« nous ») s'engage à protéger votre vie privée et à assurer la transparence dans le traitement de vos données personnelles. Cette politique de confidentialité décrit les pratiques de SHNELL Logistics, une plateforme mettant en relation les clients, les chauffeurs professionnels et les entreprises ayant besoin de services de transport logistique par camions de différentes tailles, incluant le transport de marchandises, les services B2B, le transport lourd, les livraisons interurbaines et les solutions de transport à la demande.

SHNELL vise à simplifier l’accès aux services de transport, réduire le désordre dans le secteur logistique, créer davantage d’opportunités pour les chauffeurs partenaires et offrir des tarifs plus compétitifs aux clients tout en garantissant un service fiable.

La plateforme repose sur un système de vérification des chauffeurs afin de renforcer la sécurité et la confiance. Nous collectons et analysons certaines données opérationnelles pour optimiser les trajets, réduire les retours à vide (empty returns) et améliorer l’efficacité logistique globale.

En utilisant l’application, vous acceptez cette politique. Dernière mise à jour : **22 août 2025**.`,
    },
    {
      h: '2. Informations que nous collectons',
      b: `Nous collectons différents types d'informations pour fournir, améliorer et personnaliser nos services. Les informations que nous collectons se répartissent dans les catégories suivantes :

**2.1 Informations que vous fournissez directement**

Lorsque vous interagissez avec l'Application, vous pouvez fournir les types d'informations personnelles suivants :

- **Création de compte** : Lors de l'inscription en tant que client ou chauffeur, vous fournissez des détails tels que votre nom complet, votre adresse e-mail, votre numéro de téléphone et, pour les chauffeurs, une pièce d'identité nationale valide (par exemple, la CIN pour les résidents tunisiens) ou un numéro de permis de conduire. Les partenaires commerciaux fournissent les détails de l'entreprise, y compris le nom commercial, le numéro d'enregistrement et les informations de contact.
- **Informations de profil** : Les clients peuvent fournir des préférences de livraison et des adresses. Les chauffeurs fournissent les détails du véhicule (par exemple, le type, la capacité, la plaque d'immatriculation), les certifications professionnelles et les informations bancaires pour les paiements.
- **Demandes de service** : Les clients soumettent des détails sur leurs besoins logistiques, tels que la taille du colis, le poids, les lieux de ramassage et de livraison et les instructions spéciales (par exemple, les articles fragiles ou les livraisons urgentes).
- **Données de communication** : Informations fournies lorsque vous contactez notre équipe d'assistance par e-mail, chat intégré à l'application ou par téléphone, y compris vos messages, demandes de renseignements et commentaires.
- **Données des partenaires commerciaux** : Pour les clients B2B, nous collectons des détails supplémentaires tels que les numéros d'identification fiscale, les détails du contrat et les exigences logistiques (par exemple, la taille de la flotte, les calendriers de livraison).

**2.2 Informations collectées automatiquement**

Nous collectons automatiquement certaines informations lorsque vous utilisez l'Application pour améliorer les fonctionnalités et l'expérience utilisateur :

- **Informations sur l'appareil** : Nous collectons des données sur votre appareil, y compris le type d'appareil (par exemple, iOS ou Android), la version du système d'exploitation, les identifiants uniques de l'appareil (par exemple, UDID ou IMEI), l'adresse IP et le type de navigateur.
- **Données de localisation** : Avec votre consentement, nous collectons des données de géolocalisation en temps réel pour activer des fonctionnalités telles que le suivi des envois, la mise en relation des chauffeurs avec les clients et l'optimisation des itinéraires de livraison. Les lieux de ramassage et de livraison des clients sont stockés pour l'exécution du service.
- **Données d'utilisation** : Nous suivons la façon dont vous interagissez avec l'Application, y compris les pages visitées, les fonctionnalités utilisées (par exemple, le suivi, les demandes de devis), le temps passé et les schémas de clics.
- **Données de journal** : Les journaux du serveur capturent des détails techniques tels que les appels d'API, les rapports d'erreurs et les horodatages pour surveiller les performances de l'Application et résoudre les problèmes.
- **Cookies et technologies de suivi** : Notre site Web utilise des cookies, des balises Web et des technologies similaires pour suivre le comportement des utilisateurs, personnaliser le contenu et analyser le trafic. Vous pouvez gérer les préférences en matière de cookies via les paramètres de votre navigateur.

**2.3 Informations provenant de tiers**

Nous pouvons recevoir des informations de sources tierces pour améliorer nos services ou nous conformer aux obligations légales :

- **Services de cartographie** : Mapbox fournit des données basées sur la localisation pour optimiser le routage et afficher les cartes dans l'Application.
- **Fournisseurs d'analyse** : Des outils tels que Firebase Analytics fournissent des données agrégées sur le comportement des utilisateurs et les performances de l'Application.
- **Services de vérification** : Pour les chauffeurs, nous utilisons des services tiers pour vérifier leur identité, leur dossier de conduite et la conformité du véhicule aux réglementations de sécurité.
- **Partenaires commerciaux** : Les clients B2B peuvent partager des données d'employés ou de sous-traitants (par exemple, les coordonnées) pour faciliter la coordination logistique.

**2.4 Informations sensibles**

Nous pouvons collecter des informations sensibles, telles que les numéros de carte d'identité nationale, uniquement avec votre consentement explicite ou si la loi l'exige. Nous prenons des mesures supplémentaires pour protéger ces données, comme indiqué dans la section 5 (Sécurité des données).`,
    },
    {
      h: '3. Comment nous utilisons vos informations',
      b: `Nous utilisons les informations que nous collectons pour exploiter, améliorer et personnaliser les services de l'Application. Les principaux objectifs sont :

**3.1 Livraison de service**

- **Mise en relation des clients et des chauffeurs** : Nous utilisons les données de localisation et de demande de service du client pour les mettre en relation avec des chauffeurs appropriés en fonction de la proximité, de la capacité du véhicule et de la disponibilité.
- **Exécution de la commande** : Des informations telles que les détails du colis, les lieux de ramassage et de livraison et les instructions spéciales sont utilisées pour garantir des livraisons précises et ponctuelles.
- **Suivi et mises à jour** : Les données de localisation en temps réel permettent le suivi des envois pour les clients et l'optimisation des itinéraires pour les chauffeurs.

**3.2 Amélioration de l'expérience utilisateur**

- **Personnalisation** : Nous analysons les données d'utilisation pour adapter l'expérience de l'Application, par exemple en suggérant des services préférés ou en affichant des promotions pertinentes.
- **Surveillance des performances** : Les données de l'appareil et les données de journal nous aident à identifier et à résoudre les problèmes techniques, garantissant une expérience utilisateur fluide.
- **Analyse** : Les données agrégées de Firebase Analytics et d'outils similaires permettent d'améliorer les fonctionnalités et les services.

**3.3 Communication**

- **Notifications** : Nous envoyons des notifications dans l'application, par e-mail ou par SMS concernant le statut des commandes, les mises à jour du compte, les promotions ou les changements de politique. Vous pouvez gérer les préférences de notification dans les paramètres de l'Application.
- **Assistance clientèle** : Vos coordonnées et votre historique de communication sont utilisés pour répondre aux demandes de renseignements, résoudre les problèmes et fournir une assistance.

**3.4 Gestion des chauffeurs**

- **Affichage des performances** : Avant d'accepter une demande de livraison, les chauffeurs peuvent consulter les mesures de performance du client, telles que la note moyenne (basée sur la ponctualité, la communication et l'historique de paiement) et la fréquence des commandes. Cela aide les chauffeurs à prendre des décisions éclairées.
- **Acceptation des offres** : Les chauffeurs ont l'autonomie d'accepter ou de rejeter les demandes de livraison en fonction des informations affichées, sans pénalité pour les refus, sauf s'ils enfreignent nos conditions d'utilisation.
- **Gestion de compte** : Les informations du chauffeur, y compris les détails du véhicule et les certifications, sont utilisées pour vérifier l'éligibilité et gérer le statut du compte.
- **Responsabilité du chauffeur** : Les chauffeurs sont responsables des marchandises à partir du moment où ils confirment le ramassage jusqu'à la confirmation de la livraison.

**3.5 Conformité légale et réglementaire**

- **Déclaration fiscale** : Les données de transaction peuvent être utilisées pour se conformer aux obligations fiscales, telles que la déclaration des revenus des chauffeurs aux autorités compétentes.
- **Prévention de la fraude** : Nous analysons les schémas d'utilisation et les données de tiers pour détecter et prévenir les activités frauduleuses, telles que l'accès non autorisé au compte ou la fraude au paiement.
- **Obligations légales** : Nous pouvons utiliser vos données pour répondre à des demandes légales, telles que des ordonnances de tribunal ou des enquêtes réglementaires.

**3.6 Marketing et promotions**

- Avec votre consentement, nous utilisons vos coordonnées pour envoyer des offres promotionnelles, des newsletters ou des mises à jour sur les nouveaux services. Vous pouvez vous désabonner à tout moment via l'Application ou en nous contactant.
- Nous pouvons utiliser des données agrégées et anonymisées pour créer des informations marketing ou des études de cas sans identifier les utilisateurs individuels.

**3.7 Recherche et développement**

- Nous utilisons des données anonymisées pour mener des recherches, développer de nouvelles fonctionnalités et améliorer nos algorithmes de mise en relation, de routage et de tarification.
- Les commentaires fournis par le biais d'enquêtes ou d'interactions d'assistance nous aident à améliorer les fonctionnalités de l'Application et la satisfaction des utilisateurs.`,
    },
    {
      h: '4. Comment nous partageons vos informations',
      b: `Nous pouvons partager vos informations avec des parties spécifiques pour fournir nos services, nous conformer aux obligations légales ou améliorer l'Application. Nous veillons à ce que tout partage soit effectué de manière responsable et conformément aux lois applicables.

**4.1 Partage avec d'autres utilisateurs**

- **Interactions client-chauffeur** : Lorsqu'un client soumet une demande de service, son nom, ses coordonnées (par exemple, son numéro de téléphone), ses lieux de ramassage/livraison et les détails du colis sont partagés avec le chauffeur attribué pour faciliter la livraison.
- **Affichage des performances du chauffeur** : Les clients peuvent consulter les mesures de performance du chauffeur, telles que les notes (basées sur la fiabilité, la communication et le succès de la livraison) et les années d'expérience, avant de confirmer une réservation.
- **Coordination B2B** : Pour les partenaires commerciaux, nous pouvons partager des données liées à la logistique (par exemple, les calendriers de livraison, les coordonnées des employés) avec des chauffeurs ou des prestataires tiers pour exécuter les contrats.

**4.2 Partage avec des fournisseurs de services**

Nous faisons appel à des fournisseurs de services tiers de confiance pour soutenir nos opérations. Ces fournisseurs sont contractuellement tenus de protéger vos données et de les utiliser uniquement aux fins que nous spécifions :

- **Cartographie et navigation** : Mapbox reçoit des données de localisation pour fournir des services de cartographie, de routage et de géolocalisation dans l'Application.
- **Fournisseurs d'analyse** : Firebase Analytics et d'autres outils reçoivent des données d'utilisation anonymisées pour générer des informations sur les performances de l'Application et le comportement des utilisateurs.
- **Stockage en nuage** : Nous utilisons des fournisseurs de services en nuage sécurisés (par exemple, AWS, Google Cloud) pour stocker les données des utilisateurs, avec un cryptage et des contrôles d'accès en place.
- **Services de vérification** : Des services tiers vérifient l'identité des chauffeurs, leurs dossiers de conduite et la conformité des véhicules pour garantir la sécurité et la conformité réglementaire.
- **Outils d'assistance client** : Des plateformes comme Zendesk gèrent les tickets d'assistance et stockent les données de communication pour aider efficacement les utilisateurs.

**4.3 Partage légal et réglementaire**

- Nous pouvons partager vos informations avec les autorités gouvernementales, les forces de l'ordre ou les organismes de réglementation lorsque la loi l'exige, par exemple en réponse à des citations à comparaître, des ordonnances de tribunal ou des audits fiscaux.
- En cas de suspicion de fraude, d'abus ou d'activité illégale, nous pouvons partager les données pertinentes avec les autorités pour enquêter ou prévenir les dommages.

**4.4 Transferts d'entreprise**

- Si shnell Logistics est impliquée dans une fusion, une acquisition ou une vente d'actifs, vos informations peuvent être transférées à l'entité acquéreuse. Vous serez informé de tout transfert de ce type et aurez la possibilité de vous désinscrire, le cas échéant.
- Nous veillerons à ce que tout acquéreur accepte de protéger vos données conformément à cette politique ou à une norme comparable.

**4.5 Partage de données anonymisées**

- Nous pouvons partager des données agrégées ou anonymisées (par exemple, les tendances de livraison, les données démographiques des utilisateurs) avec des partenaires, des chercheurs ou des annonceurs. Ces données n'identifient pas les individus et sont utilisées à des fins statistiques ou de marketing.

**4.6 Partage basé sur le consentement**

- Nous ne partagerons pas vos informations personnelles avec des tiers à des fins de marketing sans votre consentement explicite. Vous pouvez retirer votre consentement à tout moment via l'Application ou en nous contactant.`,
    },
    {
      h: '5. Sécurité des données',
      b: `Nous donnons la priorité à la sécurité de vos informations personnelles et mettons en œuvre des mesures robustes pour les protéger contre l'accès non autorisé, la perte, l'utilisation abusive ou l'altération.

**5.1 Mesures de protection techniques**

- **Cryptage** : Toutes les données sensibles, y compris les identifiants personnels, sont cryptées en transit (en utilisant TLS 1.2 ou supérieur) et au repos (en utilisant le cryptage AES-256).
- **Contrôles d'accès** : Seul le personnel autorisé ayant un besoin légitime peut accéder aux données des utilisateurs, et l'accès est restreint par des autorisations basées sur les rôles et une authentification multifacteur.
- **Serveurs sécurisés** : Nos serveurs sont hébergés dans des centres de données sécurisés avec des protections physiques et numériques, y compris des pare-feu, des systèmes de détection d'intrusion et des correctifs de sécurité réguliers.

**5.2 Mesures de protection organisationnelles**

- **Formation des employés** : Tous les employés et sous-traitants suivent une formation régulière sur la protection des données et les meilleures pratiques en matière de confidentialité.
- **Audits par des tiers** : Nous faisons appel à des cabinets de sécurité indépendants pour effectuer des audits réguliers de nos systèmes et processus afin d'identifier et de résoudre les vulnérabilités.
- **Gestion des fournisseurs** : Tous les fournisseurs de services tiers sont examinés pour leur conformité aux normes de protection des données, et les contrats comprennent des clauses de confidentialité strictes.

**5.3 Réponse aux incidents**

- Dans le cas peu probable d'une violation de données, nous disposons d'un plan complet de réponse aux incidents pour enquêter, atténuer et informer rapidement les utilisateurs concernés, comme l'exige la loi.
- Nous tenons des journaux détaillés des incidents de sécurité pour améliorer nos défenses et éviter qu'ils ne se reproduisent.

**5.4 Responsabilités de l'utilisateur**

- Vous êtes responsable du maintien de la confidentialité de vos identifiants de compte (par exemple, mot de passe, code PIN). Ne les partagez pas avec d'autres.
- Utilisez des mots de passe forts et uniques et activez l'authentification à deux facteurs (si disponible) pour renforcer la sécurité de votre compte.
- Signalez immédiatement tout accès non autorisé suspect à votre compte à support@shnell.com.`,
    },
    {
      h: '6. Rétention des données',
      b: `Nous ne conservons vos informations personnelles qu'aussi longtemps que nécessaire pour atteindre les objectifs décrits dans cette politique ou pour nous conformer aux exigences légales, réglementaires ou opérationnelles.

**6.1 Périodes de rétention**

- **Données client** : Les informations relatives aux demandes de service (par exemple, les détails de livraison, les registres de paiement) sont conservées pendant 5 ans après la dernière transaction pour se conformer aux réglementations fiscales et comptables.
- **Données chauffeur** : Les profils de chauffeurs, y compris les certifications et l'historique des transactions, sont conservés pendant 7 ans après la fermeture du compte pour se conformer aux lois sur le transport et le travail.
- **Données de communication** : Les tickets d'assistance et la correspondance sont conservés pendant 3 ans pour garantir le contrôle qualité et résoudre les litiges.
- **Données de localisation** : Les données de localisation en temps réel sont conservées pendant 30 jours après la fin d'une livraison, sauf si elles sont requises à des fins légales ou de résolution de litiges.
- **Données anonymisées** : Les données agrégées et non identifiables peuvent être conservées indéfiniment à des fins d'analyse et de recherche.

**6.2 Suppression des données**

- Lors de l'annulation d'un compte, vous pouvez demander la suppression de vos données personnelles via l'Application ou en contactant support@shnell.com. Nous supprimerons vos données dans les 30 jours, sauf si la rétention est requise par la loi (par exemple, les registres fiscaux).
- Les données anonymisées qui ne peuvent pas être liées à vous peuvent être conservées à des fins statistiques.
- Les sauvegardes sont supprimées en toute sécurité après 90 jours pour garantir qu'aucune donnée résiduelle ne subsiste.

**6.3 Archivage des données**

- Les comptes inactifs (aucune activité pendant 2 ans) peuvent être archivés pour réduire le stockage actif. Vous serez averti avant l'archivage, et vous pouvez réactiver votre compte en vous connectant ou en contactant l'assistance.
- Les données archivées sont stockées en toute sécurité et soumises aux mêmes protections que les données actives.`,
    },
    {
      h: '7. Vos droits en matière de protection des données',
      b: `Selon votre emplacement, vous disposez de certains droits concernant vos données personnelles en vertu des lois applicables sur la protection des données, telles que le RGPD, le CCPA ou d'autres réglementations régionales.

**7.1 Droit d'accès**

- Vous pouvez demander une copie des données personnelles que nous détenons à votre sujet, y compris des détails sur la manière dont elles sont traitées et partagées.
- Pour demander l'accès, contactez support@shnell.com ou utilisez la fonction « Demande de données » dans l'Application. Nous vous répondrons dans les 30 jours (ou 45 jours pour les demandes complexes).

**7.2 Droit de correction**

- Si vos données personnelles sont inexactes ou incomplètes, vous pouvez demander des corrections via les paramètres de profil de l'Application ou en contactant l'assistance.
- Nous mettrons à jour vos informations rapidement et en informerons les tiers avec lesquels les données ont été partagées.

**7.3 Droit de suppression**

- Vous pouvez demander la suppression de vos données personnelles, sous réserve des exigences de conservation légales (par exemple, les registres fiscaux).
- Les demandes de suppression peuvent être soumises via l'Application ou par e-mail à support@shnell.com. Nous confirmerons la suppression dans les 30 jours.

**7.4 Droit de restreindre le traitement**

- Vous pouvez nous demander de limiter le traitement de vos données (par exemple, au stockage uniquement) si vous contestez leur exactitude, leur légalité ou leur nécessité.
- Les données restreintes ne seront pas utilisées pour le traitement actif mais peuvent être conservées à des fins juridiques.

**7.5 Droit à la portabilité des données**

- Vous pouvez demander une copie lisible par machine de vos données personnelles (par exemple, au format CSV ou JSON) pour les transférer vers un autre service.
- Nous fournirons ces données dans les 30 jours, gratuitement, pour les demandes standard.

**7.6 Droit d'opposition**

- Vous pouvez vous opposer au traitement de vos données à des fins de marketing ou lorsque le traitement est basé sur nos intérêts légitimes.
- Pour vous désabonner du marketing, utilisez les paramètres de l'Application ou cliquez sur « Se désabonner » dans les e-mails promotionnels.

**7.7 Droit de retirer son consentement**

- Lorsque le traitement est basé sur votre consentement (par exemple, données de localisation, marketing), vous pouvez retirer votre consentement à tout moment via l'Application ou en nous contactant. Le retrait n'affecte pas la légalité du traitement antérieur.

**7.8 Droit à la non-discrimination**

- Nous ne ferons pas de discrimination à votre encontre pour l'exercice de vos droits de protection des données, par exemple en facturant des prix plus élevés ou en refusant des services.

**7.9 Dépôt d'une plainte**

- Si vous pensez que nous avons violé vos droits de protection des données, vous pouvez déposer une plainte auprès de votre autorité locale de protection des données (par exemple, la CNIL en France, l'ICO au Royaume-Uni ou le bureau du procureur général de Californie).
- Vous pouvez également nous contacter directement à support@shnell.com pour résoudre tout problème de manière informelle.

**7.10 Comment exercer vos droits**

- Soumettez les demandes via la fonction « Demande de données » de l'Application ou par e-mail à support@shnell.com avec votre nom, les détails de votre compte et le droit spécifique que vous souhaitez exercer.
- Nous pouvons exiger une vérification d'identité (par exemple, une copie de votre carte d'identité) pour empêcher les demandes non autorisées.
- Les réponses seront fournies par écrit (par e-mail ou par notification dans l'application) dans le délai légal requis.`,
    },
    {
      h: '8. Services tiers',
      b: `L'Application s'intègre à des services tiers pour fournir des fonctionnalités essentielles. Ces services ont leurs propres politiques de confidentialité, qui s'appliquent séparément à leur traitement de vos données.

**8.1 Cartographie et navigation**

- **Mapbox** : Fournit des services de cartographie, de géolocalisation et de routage. Mapbox reçoit des données de localisation pour générer des cartes et optimiser les itinéraires de livraison. Consultez la politique de confidentialité de Mapbox à l'adresse www.mapbox.com/privacy.

**8.2 Analyse**

- **Firebase Analytics** : Collecte des données d'utilisation anonymisées pour analyser les performances de l'Application et le comportement des utilisateurs. Firebase peut utiliser des identifiants d'appareil et des schémas d'utilisation. Consultez la politique de confidentialité de Google à l'adresse www.google.com/policies/privacy.
- **Mixpanel** : Suit les interactions des utilisateurs pour améliorer les fonctionnalités de l'Application. Mixpanel collecte des données anonymisées, telles que les schémas de clics et la durée de la session. Consultez la politique de confidentialité de Mixpanel à l'adresse www.mixpanel.com/legal/privacy-policy.

**8.3 Assistance clientèle**

- **Zendesk** : Gère les tickets d'assistance et l'historique de communication. Zendesk stocke vos coordonnées et vos messages. Consultez la politique de confidentialité de Zendesk à l'adresse www.zendesk.com/company/privacy.

**8.4 Services de vérification**

- **Jumio** : Vérifie l'identité et les documents des chauffeurs (par exemple, permis de conduire, carte d'identité nationale). Jumio traite les informations sensibles en toute sécurité. Consultez la politique de confidentialité de Jumio à l'adresse www.jumio.com/legal-information/privacy-policy.
- **Onfido** : Un service de vérification alternatif pour l'intégration des chauffeurs. Onfido gère les données de vérification d'identité. Consultez la politique de confidentialité d'Onfido à l'adresse www.onfido.com/privacy.

**8.5 Stockage en nuage**

- **Amazon Web Services (AWS)** : Stocke les données des utilisateurs en toute sécurité sous forme cryptée. AWS n'accède ni ne traite vos données au-delà des services de stockage. Consultez la politique de confidentialité d'AWS à l'adresse aws.amazon.com/privacy.
- **Google Cloud** : Fournit des capacités supplémentaires de stockage et de traitement en nuage. Consultez la politique de confidentialité de Google à l'adresse www.google.com/policies/privacy.

**8.6 Responsabilité de l'utilisateur**

- Vous reconnaissez que les services tiers sont régis par leurs politiques de confidentialité respectives, et shnell n'est pas responsable de leurs pratiques.
- Nous sélectionnons des fournisseurs réputés avec des normes de protection des données solides et nous nous assurons qu'ils se conforment aux lois applicables.`,
    },
    {
      h: '9. Confidentialité des enfants',
      b: `L'Application n'est pas destinée aux utilisateurs de moins de 18 ans. Nous ne collectons pas sciemment d'informations personnelles auprès d'enfants de moins de 18 ans.

**9.1 Restrictions d'âge**

- Les utilisateurs doivent être âgés d'au moins 18 ans pour créer un compte ou utiliser nos services.
- Les chauffeurs doivent satisfaire aux exigences d'âge et de permis supplémentaires spécifiées dans nos conditions d'utilisation (par exemple, un âge minimum de 21 ans pour certains types de véhicules).

**9.2 Consentement parental**

- Si nous prenons connaissance qu'un utilisateur de moins de 18 ans a fourni des informations personnelles sans le consentement parental vérifiable, nous supprimerons rapidement les informations.
- Les parents ou tuteurs qui pensent que leur enfant a soumis des données à l'Application doivent contacter support@shnell.com immédiatement.

**9.3 Conformité à la loi COPPA**

- Pour les utilisateurs américains, nous nous conformons à la loi sur la protection de la vie privée des enfants en ligne (COPPA). Nous ne collectons, n'utilisons ni ne partageons de données d'enfants de moins de 13 ans sans le consentement parental.`,
    },
    {
      h: '10. Structure de commission',
      b: `shnell Logistics fonctionne sur un modèle de commission transparent pour garantir une rémunération équitable aux chauffeurs et des opérations durables pour la plateforme.

**10.1 Taux de commission**

- **Commission standard** : shnell déduit une **commission de 7%** du montant total de la course de chaque livraison ou service effectué. Cette commission couvre l'entretien de la plateforme, le support client et les coûts opérationnels.
- **Exemple** : Si le prix de la livraison est de 100 TND (dinars tunisiens), shnell déduit 7 TND de commission et le chauffeur reçoit 93 TND.
- **Transparence** : La commission est clairement affichée aux chauffeurs avant d'accepter une demande de livraison et dans l'historique des transactions de l'Application.

**10.2 Frais supplémentaires**

- **Frais de service** : Les clients peuvent engager des frais supplémentaires pour les services premium, tels que la livraison express ou le transport sécurisé. Ces frais sont divulgués pendant le processus de réservation et n'affectent pas la commission du chauffeur.
- **Taxes** : Les taxes applicables (par exemple, la TVA, la taxe de vente) sont calculées et ajoutées au tarif en fonction des réglementations locales. Les taxes sont distinctes de la commission et sont clairement détaillées dans les reçus.
- **Surge Pricing** : Pendant les périodes de forte demande, les tarifs peuvent augmenter en raison du surge pricing. La commission de 7% s'applique au tarif majoré, ce qui augmente proportionnellement les revenus du chauffeur.

**10.3 Traitement des paiements**

- Les paiements des clients sont traités via des paiements en espèces au bureau ou des paiements par mandat pour les recharges de compte, car les paiements en ligne ne sont pas pris en charge actuellement.
- Les paiements aux chauffeurs sont traités chaque semaine (tous les lundis) sur le compte bancaire enregistré du chauffeur ou sur un portefeuille numérique, après déduction de la commission de 7% et de toute taxe applicable.
- Les chauffeurs peuvent consulter leurs revenus, les déductions de commission et les calendriers de paiement dans la section « Gains » de l'Application.

**10.4 Litiges**

- Si un client conteste un paiement, shnell enquêtera et pourra temporairement retenir le paiement du chauffeur jusqu'à ce que le litige soit résolu.
- Les chauffeurs seront informés de tout litige par e-mail ou par des notifications dans l'application et peuvent fournir des preuves (par exemple, confirmation de livraison, photos) pour étayer leur dossier.
- Les litiges résolus en faveur du chauffeur entraînent un paiement immédiat, moins la commission standard de 7%.`,
    },
    {
      h: '11. Politique d\'annulation et Système 2ⁿ',
      b: `**Échelle des sanctions** :
1. **Première infraction** : Avertissement et appel administratif (0 jour).
2. **Deuxième infraction** : Suspension d'un jour.
3. **Troisième infraction** : Suspension de 2 jours.
4. **Quatrième infraction** : Suspension de 4 jours.
5. **Cinquième infraction** : Suspension de 8 jours.
6. **Suivantes** : 16, 32, jusqu'à 64 jours.
- **Récupération d'annulation** : Pour chaque 5 services réussis, une annulation est retirée du dossier du chauffeur, lui redonnant une chance de restaurer sa fiabilité.
- **Remise à zéro annuelle** : Le dossier est réinitialisé chaque année.

**11.3 Accord mutuel** : Si les deux parties s'entendent sur l'annulation (ex : la marchandise n'entre pas dans le camion), l'administration peut annuler les frais.`,
    },
    {
      h: '12. Suspension de compte',
      b: `**12.1 Suspension Automatique**
- Les comptes chauffeurs sont suspendus automatiquement selon le système 2ⁿ (Section 11.2). Ce blocage est technique et ne peut être levé manuellement.

**12.2 Résiliation**
- **Fraude** : Fausses commandes ou contournement de la commission.
- **Comportement** : Harcèlement ou insécurité.
- **Abus Client** : Les clients annulant de manière abusive seront bannis définitivement.`,
    },
    {
      h: '13. Autonomie du Chauffeur',
      b: `Les chauffeurs sont libres d'accepter ou refuser les courses. Une fois acceptée, la fiabilité est obligatoire.`,
    },
  ],
};

export const PRIVACY_POLICY: { en: PolicyLang; fr: PolicyLang } = { en: EN, fr: FR };
