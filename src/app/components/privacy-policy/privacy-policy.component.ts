import { Component } from '@angular/core';

@Component({
  selector: 'app-privacy-policy',
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.css']
})
export class PrivacyPolicyComponent {
  appTitle = 'Shnell Driver';
  welcomeMessage = 'Bienvenue sur Shnell Driver !';
  selectLanguage = 'Sélectionner la langue';
  personalInfo = 'Informations personnelles';
  privacyPolicyTitle = 'Politique de confidentialité';
  privacyPolicyUpdated = 'Cette politique a été mise à jour pour la dernière fois le 27 mars 2026.';

  introHeading = '1. Introduction';
  introBody = `Shnell Logistics for Shnell, and Shnell Driver by Achour (« nous », « notre » ou « nos ») s'engage à protéger votre vie privée et à assurer la transparence dans la manière dont nous traitons vos informations personnelles.

Cette Politique de confidentialité décrit les pratiques de Shnell Logistics et de son application partenaire Shnell Driver, une plateforme de transport qui connecte les utilisateurs (passagers) avec des chauffeurs via un système d'enchères (bidding). Les chauffeurs peuvent proposer des offres attractives pour remporter les courses, tout en garantissant un service efficace, des tarifs compétitifs pour les utilisateurs et l'élimination des retours à vide.

Shnell Driver est l'application dédiée aux chauffeurs. En accédant ou en utilisant l'application mobile Shnell Driver (collectivement, l'« App »), vous acceptez les pratiques décrites dans cette politique.

Cette politique est conçue pour se conformer aux lois applicables en matière de protection des données, y compris le RGPD pour les utilisateurs de l'Union européenne, les réglementations tunisiennes et d'autres lois pertinentes dans le monde.

**Règle importante sur le système d'enchères :**
En tant que chauffeur, vous êtes libre de faire une offre (bid) pour attirer les utilisateurs. Cependant, une fois votre offre acceptée, vous êtes strictement engagé par le prix proposé. Il est absolument interdit de modifier le prix ou de demander un supplément après acceptation. Toute violation (changement de prix après avoir attiré le client) entraînera un signalement et l'application de notre système de discipline exponentiel (2ⁿ).

Nous pouvons mettre à jour cette politique périodiquement. Vous serez notifié des changements significatifs via l'application ou par e-mail. L'utilisation continue de l'App après ces changements constitue votre acceptation de la version révisée.

Cette politique a été mise à jour pour la dernière fois le **27 mars 2026**. Veuillez la lire attentivement.`;

  infoCollectionHeading = '2. Informations que nous collectons';
  infoCollectionBody = `Nous collectons les informations nécessaires pour connecter les chauffeurs avec les utilisateurs via notre système d'enchères et fournir un service optimal.

**2.1 Informations que vous fournissez directement**

- Informations de compte : nom complet, numéro de téléphone, adresse e-mail, photo de profil.
- Documents professionnels : permis de conduire, carte grise, plaque d'immatriculation, et autres certifications.
- Informations du véhicule : marque, modèle, année, capacité.
- Informations bancaires pour recevoir vos gains.

**2.2 Informations collectées automatiquement**

- **Données de localisation** : Nous collectons votre position en arrière-plan de manière intelligente et optimisée (Google Maps), respectueuse des directives de confidentialité de Google et économe en batterie. Ces données permettent le matching en temps réel, l'optimisation des trajets et l'affichage des offres aux utilisateurs à proximité.
- Informations sur l'appareil : modèle, version du système d'exploitation, identifiants uniques.
- Données d'utilisation et de courses : offres (bids) que vous proposez, courses acceptées, itinéraires, évaluations et historique.
- Données techniques : journaux d'erreurs et performance.

**2.3 Informations provenant de tiers**

Nous utilisons Google Maps pour les services de cartographie, géolocalisation et navigation. Nous pouvons également recevoir des données de services de vérification ou de paiement.`;

  infoUsageHeading = '3. Comment nous utilisons vos informations';
  infoUsageBody = `Nous utilisons vos informations pour :

- Vous mettre en relation avec les utilisateurs via le système d'enchères (bidding).
- Afficher vos offres attractives aux utilisateurs à proximité.
- Gérer les courses acceptées, calculer les itinéraires et optimiser les trajets (sans retours à vide).
- Traiter vos gains et paiements.
- Assurer la sécurité et prévenir la fraude.
- Faire respecter les règles, notamment l'interdiction de changer le prix après acceptation d'une offre.
- Améliorer l'application et l'expérience des chauffeurs.

Toute tentative de modifier le prix après avoir attiré le client via une offre basse sera sanctionnée selon le système de discipline exponentiel.`;

  infoSharingHeading = '4. Comment nous partageons vos informations';
  infoSharingBody = `Nous partageons vos informations de manière limitée et sécurisée :

- Avec l'utilisateur pendant une course active (nom, photo, véhicule, temps estimé).
- Avec les processeurs de paiement pour vos versements.
- Avec Google Maps pour la cartographie et la navigation.
- Avec des prestataires techniques sous accords de confidentialité stricts.
- Avec les autorités si requis par la loi.

Nous ne vendons pas vos données personnelles.`;

  dataSecurityHeading = '5. Sécurité des données';
  dataSecurityBody = `Nous mettons en œuvre des mesures techniques et organisationnelles robustes (chiffrement, contrôles d'accès, serveurs sécurisés) pour protéger vos données, notamment la localisation et les informations de paiement.

Vous êtes responsable de la confidentialité de vos identifiants de connexion.`;

  dataRetentionHeading = '6. Conservation des données';
  dataRetentionBody = `Nous conservons vos données uniquement le temps nécessaire pour fournir le service, respecter nos obligations légales et gérer les litiges ou sanctions. Les données de localisation sont conservées pour une période limitée après la course.`;

  dataRightsHeading = '7. Vos droits';
  dataRightsBody = `Vous disposez de droits sur vos données (accès, rectification, suppression, etc.). Pour les exercer, contactez-nous à support@shnell.tn.

Vous pouvez gérer la permission de localisation à tout moment dans les paramètres de votre téléphone.`;

  thirdPartyHeading = '8. Services tiers';
  thirdPartyBody = `L'application utilise **Google Maps** pour la cartographie, la géolocalisation et la navigation. Google Maps reçoit des données de localisation pour optimiser les trajets et afficher les positions en temps réel.

Les services tiers ont leurs propres politiques de confidentialité. Nous choisissons des partenaires fiables et exigeons un haut niveau de protection des données.`;

  childrenPrivacyHeading = '9. Confidentialité des enfants';
  childrenPrivacyBody = `Shnell Driver est destiné aux chauffeurs professionnels âgés de 18 ans et plus. Nous ne collectons pas sciemment de données auprès de mineurs.`;

  cancellationHeading = '10. Politique d\'annulation et Système de Discipline Exponentiel (2ⁿ)';
  cancellationBody = `**Système de Discipline (2ⁿ)** :

1. Première infraction : Avertissement + appel administratif (0 jour).
2. Deuxième infraction : Suspension de 1 jour.
3. Troisième infraction : Suspension de 2 jours.
4. Quatrième infraction : Suspension de 4 jours.
5. Cinquième infraction : Suspension de 8 jours.
6. Infractions suivantes : 16, 32, jusqu’à 64 jours.

- **Récupération** : Pour chaque 5 courses réussies, 1 annulation est retirée de votre dossier.
- **Réinitialisation annuelle** : Le compteur est réinitialisé chaque année.

**Règle clé** : Une fois votre offre (bid) acceptée, vous ne pouvez pas changer le prix. Toute modification visant à attirer le client initialement puis à augmenter le tarif est strictement interdite et déclenche automatiquement le système de discipline.`;

  suspensionHeading = '11. Suspension et résiliation de compte';
  suspensionBody = `Nous maintenons l'intégrité de la plateforme via des protocoles automatisés et manuels.

**11.1 Suspension Automatique**
Les comptes chauffeurs sont suspendus selon le système 2ⁿ décrit ci-dessus. Pendant la suspension, vous ne pouvez pas recevoir de nouvelles courses mais pouvez consulter votre historique.

**11.2 Résiliation et Ban Permanent**
- Fraude ou manipulation de prix après acceptation d'offre.
- Tentative de contourner la plateforme.
- Comportement dangereux ou harcèlement.
- Violations répétées du système de discipline.

Les décisions de suspension ou résiliation sont généralement automatiques et ne peuvent être levées manuellement sauf en cas d'erreur technique prouvée.`;

  driverPerformanceHeading = '12. Autonomie des Chauffeurs';
  driverPerformanceBody = `Les chauffeurs ont pleine autonomie pour proposer des offres (bids) et accepter ou rejeter les demandes avant acceptation. Une fois l'offre acceptée, des protocoles stricts de fiabilité s'appliquent, notamment l'interdiction de modifier le prix.`;

  contactHeading = '13. Nous contacter';
  contactBody = `Pour toute question concernant cette Politique de confidentialité, veuillez nous contacter à :
**support@shnell.tn**`;

  pickupLocation = 'Lieu de ramassage';
  whereDoYouWantToGo = 'Où souhaitez-vous aller ?';
  notSuitable = 'Non adapté';
  retry = 'Réessayer';

  selectedLanguage = 'fr';

  onLanguageChange() {
    console.log(`Langue changée en : ${this.selectedLanguage}`);
  }

  logout() {
    console.log('Utilisateur déconnecté');
  }

  deleteAccount() {
    console.log('Demande de suppression de compte');
  }
}
