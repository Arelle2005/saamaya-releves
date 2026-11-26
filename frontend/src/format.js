// Formats et dates partagés par les écrans. Tout est calculé en heure du Cameroun,
// que l'ordinateur de l'utilisateur soit réglé sur un autre fuseau ou non.

const FUSEAU = "Africa/Douala";
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

// 1234567 -> « 1 234 567 ». null (paiement non confirmé) -> « — ».
export function nombre(valeur) {
  return valeur == null ? "—" : new Intl.NumberFormat("fr-FR").format(valeur);
}

// 1234567 -> « 1 234 567 FCFA »
export function francs(valeur) {
  return valeur == null ? "—" : `${nombre(valeur)} FCFA`;
}

// « 04/11/2026 08:05 » (heure du Cameroun)
export function dateCourte(valeur) {
  return new Date(valeur).toLocaleString("fr-FR", {
    timeZone: FUSEAU, dateStyle: "short", timeStyle: "short",
  });
}

// « jeudi 26 novembre 2026 »
export function dateLongue(date = new Date()) {
  return date.toLocaleDateString("fr-FR", {
    timeZone: FUSEAU, weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// Date AAAA-MM-JJ d'il y a N jours, en heure du Cameroun (et non en UTC : toISOString()
// donnerait la veille entre minuit et 1 h du matin). Le Cameroun n'a pas d'heure d'été.
export function isoIlYA(jours) {
  const date = new Date(Date.now() - jours * MS_PAR_JOUR);
  return date.toLocaleDateString("sv-SE", { timeZone: FUSEAU });
}

// Les `jours` derniers jours, aujourd'hui compris : periodeDepuis(30) couvre exactement 30 jours.
// « du » et « au » sont inclus, comme le demande l'API.
export function periodeDepuis(jours) {
  return { du: isoIlYA(jours - 1), au: isoIlYA(0) };
}

export function salutation(date = new Date()) {
  // On lit la partie « heure » (0 à 23) : le texte complet serait « 11 h », pas un nombre
  const parties = new Intl.DateTimeFormat("fr-FR", {
    timeZone: FUSEAU, hour: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const heure = Number(parties.find((partie) => partie.type === "hour").value);
  return heure < 18 ? "Bonjour" : "Bonsoir";
}