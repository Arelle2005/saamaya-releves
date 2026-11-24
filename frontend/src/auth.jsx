import { createContext, useContext, useEffect, useState } from "react";
import { api, detailErreur } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);

  // Au démarrage, le cookie (s'il est encore valide) restaure la session
  useEffect(() => {
    api("/auth/moi")
      .then(async (reponse) => {
        if (reponse.ok) setUtilisateur(await reponse.json());
      })
      .catch(() => {})
      .finally(() => setChargement(false));
  }, []);

  async function connexion(identifiant, motDePasse) {
    const reponse = await api("/auth/connexion", {
      method: "POST",
      body: JSON.stringify({ identifiant, mot_de_passe: motDePasse }),
    });
    if (!reponse.ok) throw new Error(await detailErreur(reponse));
    const profil = await reponse.json();
    setUtilisateur(profil);
    return profil;
  }

  async function deconnexion() {
    await api("/auth/deconnexion", { method: "POST" }).catch(() => {});
    setUtilisateur(null);
  }

  return (
    <AuthContext.Provider value={{ utilisateur, chargement, connexion, deconnexion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}