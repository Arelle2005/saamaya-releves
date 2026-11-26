const STYLES = {
  CONFIRME: "bg-emerald-100 text-emerald-800",
  EN_ATTENTE: "bg-amber-100 text-amber-800",
  REFUSE: "bg-red-100 text-red-800",
};

// Pastille de couleur d'un statut de paiement (utilisée par « Mes paiements » et l'accueil)
export default function StatutBadge({ statut }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[statut] ?? "bg-slate-100 text-slate-700"}`}>
      {statut}
    </span>
  );
}