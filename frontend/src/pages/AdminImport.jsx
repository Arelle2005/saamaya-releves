import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, detailErreur } from "../api";

const TAILLE_MAX = 2 * 1024 * 1024; // 2 Mo, comme exigé par le sujet
const CLE_RECENTS = "saamaya_fichiers_recents";
const MAX_RECENTS = 8;
const PAR_PAGE = 10;
const COLONNES_ATTENDUES = [
  "reference",
  "date_heure",
  "code_marchand",
  "telephone_payeur",
  "montant",
  "statut",
];

/* ---------- Utilitaires ---------- */

const nombre = (valeur) => new Intl.NumberFormat("fr-FR").format(valeur ?? 0);

function formaterDate(valeur) {
  return new Date(valeur).toLocaleString("fr-FR", {
    timeZone: "Africa/Douala",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formaterTaille(octets) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) {
    return `${(octets / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Ko`;
  }
  return `${(octets / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mo`;
}

// Contrôle côté écran (le serveur refait ses propres contrôles)
function validerFichier(fichier) {
  if (!/\.csv$/i.test(fichier.name)) return "Le fichier doit être au format CSV (extension .csv).";
  if (fichier.size === 0) return "Le fichier est vide.";
  if (fichier.size > TAILLE_MAX) {
    return `Le fichier dépasse 2 Mo (${formaterTaille(fichier.size)}).`;
  }
  return "";
}

function analyserResume(r) {
  const importees = r.lignes_importees;
  const deja = r.lignes_deja_presentes;
  const rejetees = r.lignes_rejetees;
  if (rejetees > 0 && importees === 0 && deja > 0) {
    return {
      ton: "ambre",
      titre: "Aucune nouvelle ligne importée",
      texte: `Les lignes valides étaient déjà présentes ; ${rejetees} ligne(s) rejetée(s).`,
    };
  }
  if (rejetees > 0 && importees === 0) {
    return {
      ton: "ambre",
      titre: "Aucune ligne importée",
      texte: `Les ${rejetees} ligne(s) ont été rejetées. Corrigez le fichier puis recommencez.`,
    };
  }
  if (rejetees > 0) {
    return {
      ton: "ambre",
      titre: "Import terminé avec des lignes rejetées",
      texte: `${importees} ligne(s) importée(s), ${rejetees} rejetée(s). Les lignes valides sont enregistrées.`,
    };
  }
  if (importees === 0 && deja > 0) {
    return {
      ton: "bleu",
      titre: "Fichier déjà importé",
      texte: "Toutes les lignes existaient déjà : rien n'a été modifié.",
    };
  }
  if (importees === 0) {
    return {
      ton: "bleu",
      titre: "Aucune ligne à importer",
      texte: "Le fichier ne contient aucune ligne de paiement.",
    };
  }
  return { ton: "vert", titre: "Import réussi", texte: `${importees} ligne(s) importée(s) sans erreur.` };
}

// Export CSV des rejets : le séparateur « ; » s'ouvre bien dans Excel en français,
// et on neutralise les cellules qui commencent par un caractère de formule.
function proteger(valeur) {
  const texte = String(valeur ?? "");
  const sur = /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
  return `"${sur.replace(/"/g, '""')}"`;
}

function telechargerCsv(nom, lignes) {
  const contenu = "\uFEFF" + lignes.map((l) => l.map(proteger).join(";")).join("\r\n");
  const blob = new Blob([contenu], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

// Fichiers récents : on ne garde QUE des métadonnées (nom, taille, compteurs), jamais le contenu.
function lireRecents() {
  try {
    const brut = localStorage.getItem(CLE_RECENTS);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

function ecrireRecents(liste) {
  try {
    localStorage.setItem(CLE_RECENTS, JSON.stringify(liste));
  } catch {
    /* stockage indisponible : la liste reste simplement en mémoire */
  }
}

/* ---------- Icônes et petits composants ---------- */

const ICONES = {
  envoi: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  document:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  valide: "M5 13l4 4L19 7",
  alerte:
    "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  info: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  horloge: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  fermer: "M6 18L18 6M6 6l12 12",
  telecharger: "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4",
  copier:
    "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",
  rafraichir:
    "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  recherche: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  chevron: "M19 9l-7 7-7-7",
  fleche: "M9 5l7 7-7 7",
};

function Icone({ nom, className = "h-4 w-4", epaisseur = 2 }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={epaisseur}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONES[nom]} />
    </svg>
  );
}

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

const TEINTES = {
  bleu: { fond: "bg-blue-100", texte: "text-blue-600" },
  vert: { fond: "bg-emerald-100", texte: "text-emerald-600" },
  ambre: { fond: "bg-[#F5A623]/10", texte: "text-[#F5A623]" },
  rouge: { fond: "bg-red-100", texte: "text-red-600" },
  gris: { fond: "bg-slate-100", texte: "text-slate-600" },
};

function CarteCompteur({ libelle, valeur, detail, icone, teinte }) {
  const t = TEINTES[teinte];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{libelle}</p>
        <div className={`rounded-full p-2 ${t.fond}`}>
          <Icone nom={icone} className={`h-4 w-4 ${t.texte}`} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{nombre(valeur)}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

const BANDEAUX = {
  vert: { classes: "border-emerald-200 bg-emerald-50 text-emerald-800", icone: "valide" },
  ambre: { classes: "border-amber-200 bg-amber-50 text-amber-800", icone: "alerte" },
  bleu: { classes: "border-blue-200 bg-blue-50 text-blue-800", icone: "info" },
};

function BadgeResultat({ rejetees }) {
  return rejetees > 0 ? (
    <span className="inline-block whitespace-nowrap rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
      Partiel · {nombre(rejetees)} rejet(s)
    </span>
  ) : (
    <span className="inline-block whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
      Complet
    </span>
  );
}

function ListeRejets({ rejets, filtrable = false }) {
  const [recherche, setRecherche] = useState("");

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return rejets;
    return rejets.filter((r) =>
      `${r.numero_ligne} ${r.reference || ""} ${r.motif_rejet || ""}`.toLowerCase().includes(q)
    );
  }, [rejets, recherche]);

  return (
    <div>
      {filtrable && (
        <div className="border-b border-slate-100 p-4">
          <label className="relative block">
            <span className="sr-only">Rechercher dans les lignes rejetées</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <Icone nom="recherche" className="h-4 w-4" />
            </span>
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher une référence ou un motif…"
              className="block min-h-[44px] w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm text-slate-900 focus:border-[#F5A623] focus:outline-none focus:ring-2 focus:ring-[#F5A623]/30"
            />
          </label>
        </div>
      )}
      {visibles.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Aucune ligne ne correspond à votre recherche.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visibles.map((r, i) => (
            <li
              key={`${r.numero_ligne}-${i}`}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex items-center gap-2 sm:w-56 sm:shrink-0">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                  Ligne {r.numero_ligne}
                </span>
                <span className="truncate text-sm font-semibold text-slate-900">{r.reference || "—"}</span>
              </div>
              <p className="text-sm text-red-700">{r.motif_rejet}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Page ---------- */

export default function AdminImport() {
  const { pathname } = useLocation();
  const vueHistorique = pathname.endsWith("/historique");

  const [fichier, setFichier] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [erreur, setErreur] = useState("");
  const [resume, setResume] = useState(null);
  const [nomImporte, setNomImporte] = useState("");
  const [copie, setCopie] = useState(false);

  const [historique, setHistorique] = useState([]);
  const [chargementHisto, setChargementHisto] = useState(true);
  const [erreurHisto, setErreurHisto] = useState("");
  const [page, setPage] = useState(1);
  const [ouvert, setOuvert] = useState(null);

  const [recents, setRecents] = useState(() => lireRecents());
  const inputRef = useRef(null);

  const chargerHistorique = useCallback(async () => {
    setChargementHisto(true);
    setErreurHisto("");
    try {
      const reponse = await api("/imports");
      if (!reponse.ok) throw new Error("Erreur");
      setHistorique(await reponse.json());
    } catch {
      setErreurHisto("Impossible de charger l'historique des imports.");
    } finally {
      setChargementHisto(false);
    }
  }, []);

  useEffect(() => {
    chargerHistorique();
  }, [chargerHistorique]);

  useEffect(() => {
    if (!copie) return undefined;
    const minuteur = setTimeout(() => setCopie(false), 2500);
    return () => clearTimeout(minuteur);
  }, [copie]);

  // Le plus récent en premier, quel que soit l'ordre renvoyé par l'API
  const triees = useMemo(
    () => [...historique].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [historique]
  );
  const nbPages = Math.max(1, Math.ceil(triees.length / PAR_PAGE));
  const pageCourante = Math.min(page, nbPages);
  const pageDonnees = triees.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE);

  const totaux = useMemo(
    () => ({
      imports: historique.length,
      importees: historique.reduce((s, h) => s + (h.lignes_importees || 0), 0),
      rejetees: historique.reduce((s, h) => s + (h.lignes_rejetees || 0), 0),
    }),
    [historique]
  );

  function choisir(nouveau) {
    setResume(null);
    if (!nouveau) return;
    const probleme = validerFichier(nouveau);
    if (probleme) {
      setFichier(null);
      setErreur(probleme);
      return;
    }
    setErreur("");
    setFichier(nouveau);
  }

  function retirer() {
    setFichier(null);
    setErreur("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function deposer(evenement) {
    evenement.preventDefault();
    setSurvol(false);
    if (envoi) return;
    choisir(evenement.dataTransfer.files[0] || null);
  }

  async function importer(evenement) {
    evenement.preventDefault();
    if (!fichier || envoi) return;
    setErreur("");
    setResume(null);
    setEnvoi(true);
    try {
      const corps = new FormData();
      corps.append("fichier", fichier);
      const reponse = await api("/imports", { method: "POST", body: corps });
      if (!reponse.ok) {
        setErreur(await detailErreur(reponse));
        return;
      }
      const donnees = await reponse.json();
      setResume(donnees);
      setNomImporte(fichier.name);

      const entree = {
        id: Date.now(),
        nom: fichier.name,
        taille: fichier.size,
        date: new Date().toISOString(),
        lues: donnees.lignes_lues,
        importees: donnees.lignes_importees,
        deja: donnees.lignes_deja_presentes,
        rejetees: donnees.lignes_rejetees,
      };
      const nouvelle = [entree, ...recents].slice(0, MAX_RECENTS);
      setRecents(nouvelle);
      ecrireRecents(nouvelle);

      setFichier(null);
      if (inputRef.current) inputRef.current.value = "";
      setPage(1);
      await chargerHistorique();
    } catch {
      setErreur("Serveur injoignable. Vérifiez votre connexion puis réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  function viderRecents() {
    setRecents([]);
    ecrireRecents([]);
  }

  function exporterRejets() {
    const lignes = [["Ligne", "Référence", "Motif du rejet"]].concat(
      (resume.rejets || []).map((r) => [r.numero_ligne, r.reference || "", r.motif_rejet])
    );
    telechargerCsv(`rejets_${nomImporte.replace(/\.csv$/i, "")}.csv`, lignes);
  }

  async function copierCompteRendu() {
    const rejets = resume.rejets || [];
    const texte = [
      `Compte rendu d'import : ${nomImporte}`,
      `Lignes lues : ${resume.lignes_lues}`,
      `Lignes importées : ${resume.lignes_importees}`,
      `Déjà présentes : ${resume.lignes_deja_presentes}`,
      `Lignes rejetées : ${resume.lignes_rejetees}`,
      ...rejets.map((r) => `- Ligne ${r.numero_ligne} (${r.reference || "sans référence"}) : ${r.motif_rejet}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
    } catch {
      setErreur("Impossible de copier le compte rendu. Utilisez plutôt l'export CSV des rejets.");
    }
  }

  const analyse = resume ? analyserResume(resume) : null;
  const rejetsResume = resume?.rejets || [];
  const motifs = useMemo(() => {
    const compte = {};
    rejetsResume.forEach((r) => {
      compte[r.motif_rejet] = (compte[r.motif_rejet] || 0) + 1;
    });
    return Object.entries(compte).sort((a, b) => b[1] - a[1]);
  }, [rejetsResume]);

  const aDesDetails = (h) => Array.isArray(h.rejets) && h.rejets.length > 0;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A1628] to-[#0F2A4A] p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[#F5A623]/10" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">Administration</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              {vueHistorique ? "Historique des imports" : "Import des paiements"}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              {vueHistorique
                ? "Retrouvez tous les fichiers traités, leur résultat et les lignes rejetées."
                : "Chargez le fichier CSV des paiements de la veille. Chaque ligne est contrôlée avant d'être enregistrée."}
            </p>
          </div>
          <Link
            to={vueHistorique ? "/admin/import" : "/admin/historique"}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-lg bg-[#F5A623] px-4 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a] sm:self-auto"
          >
            {vueHistorique ? "Nouvel import" : "Voir l'historique"}
            <Icone nom="fleche" className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {!vueHistorique && (
        <>
          {/* Dépôt du fichier + format attendu */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <form
              onSubmit={importer}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-2"
            >
              <h3 className="text-lg font-semibold text-slate-900">Nouveau fichier</h3>
              <p className="mt-1 text-sm text-slate-500">Format CSV, 2 Mo maximum.</p>

              <label
                htmlFor="csv"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!envoi) setSurvol(true);
                }}
                onDragLeave={() => setSurvol(false)}
                onDrop={deposer}
                className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors focus-within:ring-2 focus-within:ring-[#F5A623] ${
                  survol
                    ? "border-[#F5A623] bg-[#F5A623]/5"
                    : "border-slate-300 bg-slate-50 hover:border-[#F5A623]/60 hover:bg-white"
                } ${envoi ? "pointer-events-none opacity-60" : ""}`}
              >
                <input
                  ref={inputRef}
                  id="csv"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={envoi}
                  onChange={(e) => {
                    const choisi = e.target.files[0] || null;
                    choisir(choisi);
                    e.target.value = "";
                  }}
                  className="sr-only"
                />
                <div className="rounded-full bg-[#F5A623]/10 p-3">
                  <Icone nom="envoi" className="h-7 w-7 text-[#F5A623]" epaisseur={1.5} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Glissez votre fichier ici ou <span className="text-[#F5A623]">parcourez</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Fichier CSV des paiements, 2 Mo maximum</p>
              </label>

              {fichier && (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="rounded-lg bg-white p-2 shadow-sm">
                    <Icone nom="document" className="h-5 w-5 text-[#0F2A4A]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{fichier.name}</p>
                    <p className="text-xs text-slate-500">{formaterTaille(fichier.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={retirer}
                    disabled={envoi}
                    aria-label="Retirer le fichier"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] disabled:opacity-50"
                  >
                    <Icone nom="fermer" className="h-4 w-4" />
                  </button>
                </div>
              )}

              {erreur && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                  <Icone nom="alerte" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{erreur}</span>
                </div>
              )}

              {envoi && (
                <div className="mt-4" role="status">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[#F5A623]" />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Contrôle et import du fichier en cours…</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!fichier || envoi}
                aria-busy={envoi}
                className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#F5A623] px-4 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2A4A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[200px]"
              >
                {envoi ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0A1628]/30 border-t-[#0A1628]" />
                    Import en cours…
                  </>
                ) : (
                  <>
                    <Icone nom="envoi" className="h-4 w-4" />
                    Importer le fichier
                  </>
                )}
              </button>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-100 p-2.5">
                  <Icone nom="info" className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Format attendu</h3>
                  <p className="mt-0.5 text-sm text-slate-500">Une ligne par paiement, avec ces colonnes :</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {COLONNES_ATTENDUES.map((c) => (
                  <code
                    key={c}
                    className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    {c}
                  </code>
                ))}
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li className="flex gap-2">
                  <Icone nom="valide" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Une ligne invalide est rejetée avec son motif, les autres sont importées.
                </li>
                <li className="flex gap-2">
                  <Icone nom="valide" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Réimporter un fichier ne crée aucun doublon.
                </li>
                <li className="flex gap-2">
                  <Icone nom="valide" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Un paiement déjà enregistré n'est jamais modifié.
                </li>
              </ul>
            </div>
          </div>

          {/* Compte rendu de l'import */}
          {resume && analyse && (
            <section className="space-y-4" aria-label="Compte rendu de l'import">
              <div
                role="status"
                className={`flex items-start gap-3 rounded-2xl border p-4 sm:p-5 ${BANDEAUX[analyse.ton].classes}`}
              >
                <Icone nom={BANDEAUX[analyse.ton].icone} className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{analyse.titre}</p>
                  <p className="mt-0.5 text-sm">{analyse.texte}</p>
                  <p className="mt-1 truncate text-xs opacity-80">Fichier : {nomImporte}</p>
                </div>
                <button
                  type="button"
                  onClick={copierCompteRendu}
                  className="hidden min-h-[40px] items-center gap-2 rounded-lg border border-current/30 bg-white/60 px-3 text-xs font-semibold transition-colors hover:bg-white sm:inline-flex"
                >
                  <Icone nom={copie ? "valide" : "copier"} className="h-4 w-4" />
                  {copie ? "Copié" : "Copier le compte rendu"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <CarteCompteur libelle="Lignes lues" valeur={resume.lignes_lues} icone="document" teinte="bleu" />
                <CarteCompteur
                  libelle="Importées"
                  valeur={resume.lignes_importees}
                  icone="valide"
                  teinte="vert"
                  detail="Nouveaux paiements"
                />
                <CarteCompteur
                  libelle="Déjà présentes"
                  valeur={resume.lignes_deja_presentes}
                  icone="horloge"
                  teinte="gris"
                  detail="Ignorées, sans doublon"
                />
                <CarteCompteur
                  libelle="Rejetées"
                  valeur={resume.lignes_rejetees}
                  icone="alerte"
                  teinte="rouge"
                  detail="Voir les motifs"
                />
              </div>

              {resume.lignes_rejetees > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 sm:px-8">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Lignes rejetées</h3>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {nombre(rejetsResume.length)} ligne(s) à corriger dans le fichier source.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={exporterRejets}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]"
                    >
                      <Icone nom="telecharger" className="h-4 w-4" />
                      Exporter les rejets (CSV)
                    </button>
                  </div>

                  {motifs.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-b border-slate-100 px-6 py-4 sm:px-8">
                      {motifs.map(([motif, nb]) => (
                        <span
                          key={motif}
                          className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                        >
                          <span className="font-bold tabular-nums">{nb}</span>
                          {motif}
                        </span>
                      ))}
                    </div>
                  )}

                  <ListeRejets rejets={rejetsResume} filtrable={rejetsResume.length > 5} />
                </div>
              )}
            </section>
          )}

          {/* Fichiers récents (sur cet appareil) */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4 sm:px-8">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Derniers fichiers importés</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Depuis cet appareil. Seuls le nom et le résultat sont mémorisés, jamais le contenu.
                </p>
              </div>
              {recents.length > 0 && (
                <button
                  type="button"
                  onClick={viderRecents}
                  className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  Effacer la liste
                </button>
              )}
            </div>
            {recents.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 text-center">
                <Icone nom="document" className="mb-3 h-10 w-10 text-slate-300" epaisseur={1.5} />
                <p className="text-sm font-medium text-slate-600">Aucun fichier importé depuis cet appareil</p>
                <p className="mt-1 max-w-sm text-xs text-slate-400">
                  Les fichiers que vous importerez apparaîtront ici, avec leur résultat.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recents.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-lg bg-slate-100 p-2">
                        <Icone nom="document" className="h-5 w-5 text-[#0F2A4A]" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{r.nom}</p>
                        <p className="text-xs text-slate-500">
                          {formaterDate(r.date)} · {formaterTaille(r.taille)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums text-slate-600">
                      <span>{nombre(r.importees)} importées</span>
                      <span>{nombre(r.deja)} déjà présentes</span>
                      <BadgeResultat rejetees={r.rejetees} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Vue d'ensemble de l'historique */}
      {!chargementHisto && !erreurHisto && historique.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CarteCompteur
            libelle="Imports effectués"
            valeur={totaux.imports}
            detail="Fichiers CSV traités"
            icone="envoi"
            teinte="ambre"
          />
          <CarteCompteur
            libelle="Lignes importées"
            valeur={totaux.importees}
            detail="Paiements enregistrés au total"
            icone="valide"
            teinte="vert"
          />
          <CarteCompteur
            libelle="Lignes rejetées"
            valeur={totaux.rejetees}
            detail="Au total, tous imports confondus"
            icone="alerte"
            teinte="rouge"
          />
        </div>
      )}

      {/* Historique des imports */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 sm:px-8">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Historique des imports</h3>
            <p className="mt-0.5 text-sm text-slate-500">Le plus récent en premier.</p>
          </div>
          <button
            type="button"
            onClick={chargerHistorique}
            disabled={chargementHisto}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] disabled:opacity-50"
          >
            <Icone nom="rafraichir" className={`h-4 w-4 ${chargementHisto ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>

        {chargementHisto ? (
          <div className="space-y-3 p-6 sm:p-8" aria-busy="true" aria-label="Chargement de l'historique">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : erreurHisto ? (
          <div role="alert" className="flex flex-col items-center justify-center p-10 text-center">
            <Icone nom="alerte" className="mb-3 h-10 w-10 text-red-500" epaisseur={1.5} />
            <p className="text-sm font-medium text-slate-700">{erreurHisto}</p>
            <button
              type="button"
              onClick={chargerHistorique}
              className="mt-4 min-h-[44px] rounded-lg bg-[#F5A623] px-5 text-sm font-semibold text-[#0A1628] transition-colors hover:bg-[#e0951a]"
            >
              Réessayer
            </button>
          </div>
        ) : triees.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Icone nom="document" className="mb-3 h-10 w-10 text-slate-300" epaisseur={1.5} />
            <p className="text-sm font-medium text-slate-600">Aucun import pour le moment</p>
            <p className="mt-1 max-w-sm text-xs text-slate-400">
              Importez un fichier CSV pour commencer à alimenter la plateforme.
            </p>
          </div>
        ) : (
          <>
            {/* Tableau (ordinateur) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Auteur</th>
                    <th className="px-4 py-3 text-right font-semibold">Lues</th>
                    <th className="px-4 py-3 text-right font-semibold">Importées</th>
                    <th className="px-4 py-3 text-right font-semibold">Déjà présentes</th>
                    <th className="px-4 py-3 text-right font-semibold">Rejetées</th>
                    <th className="px-6 py-3 text-left font-semibold">Résultat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageDonnees.map((h) => (
                    <Fragment key={h.id}>
                      <tr className="transition-colors hover:bg-slate-50">
                        <td className="whitespace-nowrap px-6 py-3 font-medium text-slate-900">
                          {formaterDate(h.date)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{h.auteur}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{nombre(h.lignes_lues)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">
                          {nombre(h.lignes_importees)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {nombre(h.lignes_deja_presentes)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-red-700">
                          {nombre(h.lignes_rejetees)}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <BadgeResultat rejetees={h.lignes_rejetees} />
                            {aDesDetails(h) && (
                              <button
                                type="button"
                                onClick={() => setOuvert(ouvert === h.id ? null : h.id)}
                                aria-expanded={ouvert === h.id}
                                aria-label="Afficher les lignes rejetées de cet import"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100"
                              >
                                <Icone
                                  nom="chevron"
                                  className={`h-4 w-4 transition-transform ${ouvert === h.id ? "rotate-180" : ""}`}
                                />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {ouvert === h.id && aDesDetails(h) && (
                        <tr>
                          <td colSpan={7} className="bg-slate-50 px-6 py-2">
                            <ListeRejets rejets={h.rejets} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cartes (téléphone) */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {pageDonnees.map((h) => (
                <li key={h.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{formaterDate(h.date)}</p>
                      <p className="text-xs text-slate-500">Par {h.auteur}</p>
                    </div>
                    <BadgeResultat rejetees={h.lignes_rejetees} />
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {[
                      ["Lues", h.lignes_lues, "text-slate-900"],
                      ["Import.", h.lignes_importees, "text-emerald-700"],
                      ["Déjà", h.lignes_deja_presentes, "text-slate-600"],
                      ["Rejet.", h.lignes_rejetees, "text-red-700"],
                    ].map(([libelle, valeur, couleur]) => (
                      <div key={libelle} className="rounded-lg bg-slate-50 py-2">
                        <dt className="text-[11px] text-slate-500">{libelle}</dt>
                        <dd className={`text-base font-bold tabular-nums ${couleur}`}>{nombre(valeur)}</dd>
                      </div>
                    ))}
                  </dl>
                  {aDesDetails(h) && (
                    <>
                      <button
                        type="button"
                        onClick={() => setOuvert(ouvert === h.id ? null : h.id)}
                        aria-expanded={ouvert === h.id}
                        className="mt-3 inline-flex min-h-[40px] items-center gap-1 text-xs font-semibold text-[#0F2A4A]"
                      >
                        {ouvert === h.id ? "Masquer" : "Voir"} les lignes rejetées
                        <Icone
                          nom="chevron"
                          className={`h-4 w-4 transition-transform ${ouvert === h.id ? "rotate-180" : ""}`}
                        />
                      </button>
                      {ouvert === h.id && (
                        <div className="mt-2 rounded-lg bg-slate-50">
                          <ListeRejets rejets={h.rejets} />
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {nbPages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 sm:px-8">
                <button
                  type="button"
                  onClick={() => setPage(pageCourante - 1)}
                  disabled={pageCourante === 1}
                  className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Précédent
                </button>
                <p className="text-sm text-slate-500">
                  Page <strong className="text-slate-900">{pageCourante}</strong> sur {nbPages}
                </p>
                <button
                  type="button"
                  onClick={() => setPage(pageCourante + 1)}
                  disabled={pageCourante === nbPages}
                  className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Suivant
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}