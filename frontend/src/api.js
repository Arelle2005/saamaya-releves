const BASE = "/api";

// auth.jsx s'inscrit ici pour être prévenu quand la session se termine (401).
// api.js ne connaît pas React : il appelle simplement la fonction inscrite.
let surSessionExpiree = null;

export function definirGestionnaireSessionExpiree(gestionnaire) {
  surSessionExpiree = gestionnaire;
}

// Pour ces routes, un 401 est normal et ne veut PAS dire « session expirée » :
// - /auth/connexion : mauvais mot de passe
// - /auth/moi : vérification au démarrage, personne n'est encore connecté
const ROUTES_SANS_EXPIRATION = ["/auth/connexion", "/auth/moi"];

// Point de passage unique : cookie httpOnly envoyé automatiquement (credentials)
export async function api(chemin, options = {}) {
  const estFormulaire = options.body instanceof FormData;
  const reponse = await fetch(BASE + chemin, {
    ...options,
    credentials: "include",
    headers: estFormulaire
      ? options.headers
      : { "Content-Type": "application/json", ...options.headers },
  });
  // Un 401 sur une route protégée : le jeton a expiré (ou n'est plus valide).
  // On prévient l'authentification, qui ferme la session et renvoie vers la connexion
  // sans recharger la page.
  if (
    reponse.status === 401 &&
    !ROUTES_SANS_EXPIRATION.some((route) => chemin.startsWith(route)) &&
    surSessionExpiree
  ) {
    surSessionExpiree();
  }
  return reponse;
}

export async function detailErreur(reponse) {
  try {
    const corps = await reponse.json();
    if (typeof corps.detail === "string") return corps.detail;
  } catch {
    // réponse non JSON : message générique ci-dessous
  }
  return "Une erreur est survenue. Veuillez réessayer.";
}