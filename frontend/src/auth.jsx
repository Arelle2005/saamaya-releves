import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, definirGestionnaireSessionExpiree, detailErreur } from "./api";

const AuthContext = createContext(null);

// Seule l'HEURE d'expiration est gardée dans sessionStorage (jamais le jeton, qui reste
// dans le cookie httpOnly). Elle permet de relancer le minuteur après un rechargement de page.
const CLE_EXPIRATION = "expiration_session";

function lireExpiration() {
  try {
    const valeur = Number(sessionStorage.getItem(CLE_EXPIRATION));
    return valeur > Date.now() ? valeur : null;
  } catch {
    return null; // stockage indisponible : on se contente du cas 401
  }
}

function ecrireExpiration(horodatage) {
  try {
    if (horodatage) sessionStorage.setItem(CLE_EXPIRATION, String(horodatage));
    else sessionStorage.removeItem(CLE_EXPIRATION);
  } catch {
    // stockage indisponible : sans conséquence
  }
}

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);
  // Heure (en millisecondes) à laquelle le jeton expire, ou null si inconnue
  const [expireA, setExpireA] = useState(null);
  // true seulement quand une session ouverte vient de se terminer par expiration
  const [sessionExpiree, setSessionExpiree] = useState(false);

  // Le gestionnaire de 401 est appelé hors rendu : il lit l'utilisateur via une référence
  const utilisateurRef = useRef(null);
  useEffect(() => {
    utilisateurRef.current = utilisateur;
  }, [utilisateur]);

  const terminerSession = useCallback((parExpiration) => {
    ecrireExpiration(null);
    setExpireA(null);
    setUtilisateur(null);
    setSessionExpiree(parExpiration);
  }, []);

  // Une expiration n'a de sens que si quelqu'un était connecté
  const expirer = useCallback(() => {
    if (utilisateurRef.current) terminerSession(true);
  }, [terminerSession]);

  // api.js nous prévient dès qu'une route protégée répond 401
  useEffect(() => {
    definirGestionnaireSessionExpiree(expirer);
    return () => definirGestionnaireSessionExpiree(null);
  }, [expirer]);

  // Au démarrage, le cookie (s'il est encore valide) restaure la session
  useEffect(() => {
    api("/auth/moi")
      .then(async (reponse) => {
        if (reponse.ok) {
          setUtilisateur(await reponse.json());
          setExpireA(lireExpiration());
        }
      })
      .catch(() => {
        // Échec silencieux au démarrage : l'utilisateur est simplement non connecté
      })
      .finally(() => setChargement(false));
  }, []);

  // Déconnexion automatique à l'heure d'expiration du jeton
  useEffect(() => {
    if (!utilisateur || !expireA) return undefined;
    const restant = expireA - Date.now();
    if (restant <= 0) {
      expirer();
      return undefined;
    }
    const minuteur = setTimeout(expirer, restant);
    // Onglet resté en veille : les minuteurs sont ralentis, on revérifie l'heure au retour
    const auRetour = () => {
      if (document.visibilityState === "visible" && Date.now() >= expireA) expirer();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      clearTimeout(minuteur);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [utilisateur, expireA, expirer]);

  async function connexion(identifiant, motDePasse) {
    const reponse = await api("/auth/connexion", {
      method: "POST",
      body: JSON.stringify({ identifiant, mot_de_passe: motDePasse }),
    });
    if (!reponse.ok) {
      const erreur = new Error(await detailErreur(reponse));
      // Le code HTTP permet à l'écran de distinguer « identifiants faux » (401),
      // « compte bloqué » (403) et « serveur en panne » (500 et plus)
      erreur.status = reponse.status;
      throw erreur;
    }
    const corps = await reponse.json();
    // Le jeton est déjà dans le cookie httpOnly : on ne le garde PAS dans l'état React,
    // où n'importe quel script de la page pourrait le lire.
    // eslint-disable-next-line no-unused-vars
    const { jeton, expire_dans_secondes: dureeSecondes, ...profil } = corps;
    const fin = Number.isFinite(dureeSecondes) ? Date.now() + dureeSecondes * 1000 : null;
    ecrireExpiration(fin);
    setExpireA(fin);
    setSessionExpiree(false);
    setUtilisateur(profil);
    return profil;
  }

  async function deconnexion() {
    try {
      // On tente de notifier le backend, mais on ne bloque pas si ça échoue
      await api("/auth/deconnexion", { method: "POST" });
    } catch (err) {
      console.warn("Erreur lors de la déconnexion backend, nettoyage local anyway", err);
    } finally {
      // On vide l'état local dans tous les cas : déconnexion volontaire, pas une expiration
      terminerSession(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{ utilisateur, chargement, sessionExpiree, connexion, deconnexion }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}