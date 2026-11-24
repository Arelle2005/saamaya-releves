const BASE = "/api";

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
  // Session expirée ou absente : retour à la connexion (sauf sur la page de login)
  if (
    reponse.status === 401 &&
    chemin !== "/auth/connexion" &&
    window.location.pathname !== "/login"
  ) {
    window.location.assign("/login");
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