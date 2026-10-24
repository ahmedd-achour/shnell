/**
 * Labels for the server's Gemini auto-review (functions lib/auto_review.js,
 * lib/vehicle_classifier.js, lib/identity_review.js), shared by the
 * vehicles and verifications tabs.
 */

const SIGNALS: Record<string, string> = {
  screen_photo: "Photo d'écran / capture",
  edited_or_tampered: 'Document retouché',
  internet_image: 'Image internet / spécimen',
  printout_or_copy: 'Photocopie / impression',
  different_vehicles: 'Plusieurs véhicules différents',
  plate_mismatch: 'Plaque ≠ carte grise',
  not_a_registration_card: "Ce n'est pas une carte grise",
  no_vehicle: 'Aucun véhicule visible',
  unreadable: 'Illisible',
  wrong_document: 'Mauvais document',
  names_mismatch: 'Noms différents (CIN / permis)',
  faces_mismatch: 'Visages différents (CIN / permis)',
  expired_permit: 'Permis expiré',
  underage: 'Moins de 18 ans',
  cin_in_use: 'CIN déjà utilisée par un autre compte',
  plate_in_use: 'Plaque déjà utilisée par un autre chauffeur',
  permit_category: 'Catégorie de permis insuffisante',
  ai_failed: 'IA indisponible',
};

export function aiSignalLabel(code: string): string {
  return SIGNALS[code] || code;
}

export function aiVerdictLabel(v?: string): string {
  return v === 'approve' ? 'Valide' : v === 'reject' ? 'Frauduleux / invalide' : v === 'review' ? 'Doute' : '—';
}

export function aiVerdictClass(v?: string): string {
  return v === 'approve' ? 'success' : v === 'reject' ? 'danger' : 'warning';
}

/** vehicles.reviewStatus / drivers.verificationStatus. */
export function aiReviewStatusLabel(s?: string): string {
  switch (s) {
    case 'approved': return 'Approuvé';
    case 'rejected': return 'Refusé (IA)';
    case 'await_driver': return 'Attend la vérif. du chauffeur';
    case 'manual': return 'À vérifier (admin)';
    case 'reviewing': return 'Analyse IA en cours…';
    case 'suspended': return 'Suspendu';
    default: return 'En attente';
  }
}

export function aiReviewStatusClass(s?: string): string {
  return s === 'approved' ? 'success' : s === 'rejected' || s === 'suspended' ? 'danger' : 'warning';
}
