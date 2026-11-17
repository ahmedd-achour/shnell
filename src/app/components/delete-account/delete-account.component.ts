import { Component } from '@angular/core';

type Lang = 'fr' | 'en';

/**
 * Public account / data deletion page — the URL declared in the Google Play
 * Data safety form for both "Shnell - Transport Marchandise" (com.shnell.app)
 * and "Shnell Driver" (com.shnell.shnell_driver).
 * Google requires: the app / developer name, clear steps to request deletion,
 * which data is deleted and which is kept (and for how long).
 */
@Component({
  selector: 'app-delete-account',
  templateUrl: './delete-account.component.html',
  styleUrls: ['./delete-account.component.css'],
})
export class DeleteAccountComponent {
  lang: Lang = 'fr';

  readonly email = 'shnellservices@gmail.com';
  readonly phone = '+216 28 29 20 24';

  readonly apps = [
    { name: 'Shnell - Transport Marchandise', pkg: 'com.shnell.app', icon: 'fa-solid fa-box' },
    { name: 'Shnell Driver', pkg: 'com.shnell.shnell_driver', icon: 'fa-solid fa-truck' },
  ];

  setLang(l: Lang): void { this.lang = l; }

  mailto(kind: 'account' | 'data'): string {
    const fr = this.lang === 'fr';
    const subject = kind === 'account'
      ? (fr ? 'Suppression de mon compte Shnell' : 'Delete my Shnell account')
      : (fr ? 'Suppression de certaines données Shnell' : 'Delete some of my Shnell data');
    const body = fr
      ? "Application (Shnell / Shnell Driver) :\nNuméro de téléphone ou e-mail du compte :\n" +
        (kind === 'data' ? 'Données à supprimer :\n' : '')
      : 'App (Shnell / Shnell Driver):\nAccount phone number or e-mail:\n' +
        (kind === 'data' ? 'Data to delete:\n' : '');
    return `mailto:${this.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  get t() { return this.lang === 'fr' ? FR : EN; }
}

const FR = {
  eyebrow: 'Shnell · Applications Android & iOS',
  title1: 'Supprimer votre',
  title2: 'compte Shnell',
  lead: "Vous pouvez supprimer votre compte et vos données personnelles à tout moment, gratuitement. Cette page concerne les deux applications Shnell publiées sur Google Play et l'App Store.",
  appsLabel: 'Applications concernées',
  cta: 'Demander la suppression',
  howTitle: 'Comment supprimer votre compte',
  opt1: 'Option 1 · Dans l’application',
  steps: [
    'Ouvrez l’application Shnell ou Shnell Driver et connectez-vous.',
    'Ouvrez le menu, puis « Paramètres ».',
    'Appuyez sur « Supprimer le compte ».',
    'Confirmez. Vous êtes déconnecté et la suppression est lancée.',
  ],
  opt2: 'Option 2 · Par e-mail',
  opt2Text: "Envoyez-nous un e-mail depuis n'importe quel appareil, même si l'application est désinstallée. Indiquez l'application et le numéro de téléphone (ou l'e-mail) de votre compte.",
  opt2Btn: 'Envoyer la demande par e-mail',
  orCall: 'ou appelez-nous au',
  delTitle: 'Données supprimées',
  deleted: [
    'Profil : nom, numéro de téléphone, e-mail, photo',
    'Adresses enregistrées et historique de localisation',
    'Chauffeurs : documents (CIN, permis, carte grise), véhicule et coordonnées de paiement',
    'Jetons de notification et identifiants de connexion',
  ],
  keptTitle: 'Données conservées',
  kept: [
    'Factures et transactions de paiement, uniquement pendant la durée imposée par la loi (obligations fiscales et comptables)',
    'Sauvegardes chiffrées : effacées automatiquement sous 90 jours',
  ],
  delayTitle: 'Délai',
  delay: 'Votre compte et vos données sont supprimés définitivement sous 30 jours maximum. Nous vous confirmons la suppression par e-mail ou SMS.',
  partTitle: 'Supprimer seulement certaines données',
  partText: 'Vous souhaitez garder votre compte mais effacer certaines données (historique de trajets, photo, documents, adresses…) ? Envoyez-nous la liste par e-mail : nous les supprimons sous 30 jours.',
  partBtn: 'Demander la suppression de données',
  privacy: 'Lire la politique de confidentialité',
  footer: 'Shnell Logistics — Ben Arous, Tunis, Tunisie',
};

const EN: typeof FR = {
  eyebrow: 'Shnell · Android & iOS apps',
  title1: 'Delete your',
  title2: 'Shnell account',
  lead: 'You can delete your account and personal data at any time, free of charge. This page covers both Shnell apps published on Google Play and the App Store.',
  appsLabel: 'Apps covered',
  cta: 'Request deletion',
  howTitle: 'How to delete your account',
  opt1: 'Option 1 · In the app',
  steps: [
    'Open the Shnell or Shnell Driver app and sign in.',
    'Open the menu, then “Settings”.',
    'Tap “Delete account”.',
    'Confirm. You are signed out and the deletion starts.',
  ],
  opt2: 'Option 2 · By e-mail',
  opt2Text: 'Send us an e-mail from any device, even if the app is uninstalled. Tell us which app and the phone number (or e-mail) of your account.',
  opt2Btn: 'Send the request by e-mail',
  orCall: 'or call us at',
  delTitle: 'Data we delete',
  deleted: [
    'Profile: name, phone number, e-mail, photo',
    'Saved addresses and location history',
    'Drivers: documents (ID card, licence, registration), vehicle and payout details',
    'Notification tokens and sign-in identifiers',
  ],
  keptTitle: 'Data we keep',
  kept: [
    'Invoices and payment transactions, only for the period required by law (tax and accounting obligations)',
    'Encrypted backups: automatically erased within 90 days',
  ],
  delayTitle: 'Timeline',
  delay: 'Your account and data are permanently deleted within 30 days at most. We confirm the deletion by e-mail or SMS.',
  partTitle: 'Delete only some data',
  partText: 'Want to keep your account but erase some data (trip history, photo, documents, addresses…)? E-mail us the list: we delete it within 30 days.',
  partBtn: 'Request data deletion',
  privacy: 'Read the privacy policy',
  footer: 'Shnell Logistics — Ben Arous, Tunis, Tunisia',
};
