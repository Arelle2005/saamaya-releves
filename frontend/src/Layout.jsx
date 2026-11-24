import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { api } from "./api";

export default function Layout({ children }) {
  const { utilisateur, deconnexion } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);

  if (!utilisateur) return null;

  const isAdmin = utilisateur.role === "ADMIN";

  const navItems = isAdmin
    ? [
        { path: "/", label: "Tableau de bord", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
        { path: "/admin/import", label: "Import des paiements", icon: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" },
        { path: "/admin/historique", label: "Historique des imports", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
      ]
    : [
        { path: "/", label: "Tableau de bord", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
        { path: "/marchand/releve", label: "Mes paiements", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
      ];

  const isActive = (path) => location.pathname === path;

  async function handleDeconnexion() {
    await deconnexion();
    window.location.replace("/login");
  }

  // Export CSV direct depuis la sidebar (période : mois en cours)
  async function handleExportReleve() {
    if (exportEnCours) return;
    setExportEnCours(true);
    try {
      const aujourdhui = new Date();
      const debutMois = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const reponse = await api(`/releve/export?du=${fmt(debutMois)}&au=${fmt(aujourdhui)}`);
      if (!reponse.ok) {
        alert("Échec de l'export. Vérifiez qu'il existe des paiements sur cette période.");
        return;
      }
      const blob = await reponse.blob();
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = `releve_${utilisateur.code_marchand}_${fmt(debutMois)}_${fmt(aujourdhui)}.csv`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Serveur injoignable. Vérifiez que le backend est démarré.");
    } finally {
      setExportEnCours(false);
    }
  }

  const initiales = utilisateur.identifiant
    ? utilisateur.identifiant.substring(0, 2).toUpperCase()
    : "U";

  return (
    // h-screen + overflow-hidden : le scroll se fait uniquement dans <main>
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Overlay mobile */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar fixe en hauteur, scrollable si contenu trop long */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#0A1628] text-white transition-transform duration-300 md:static md:translate-x-0 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-6">
          <img src="/images/logo-saamaya.png" alt="Saamaya" className="h-8 w-auto mr-3" />
          <span className="text-sm font-bold tracking-widest uppercase text-white">Saamaya</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200 ${
                    active
                      ? "bg-[#F5A623]/10 text-[#F5A623] border-l-4 border-[#F5A623]"
                      : "text-slate-400 hover:bg-white/5 hover:text-white border-l-4 border-transparent"
                  }`}
                >
                  <svg className={`h-5 w-5 transition-colors ${active ? "text-[#F5A623]" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Bouton Export pour les marchands, en bas de la nav */}
          {!isAdmin && (
            <div className="mt-6 border-t border-white/10 pt-4">
              <button
                onClick={handleExportReleve}
                disabled={exportEnCours}
                className="group flex w-full items-center gap-3 rounded-lg border-l-4 border-transparent px-3 py-3 text-sm font-medium text-slate-400 transition-all duration-200 hover:bg-white/5 hover:text-white disabled:opacity-60"
              >
                <svg className="h-5 w-5 text-slate-400 group-hover:text-[#F5A623]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exportEnCours ? "Export en cours…" : "Exporter mon relevé (CSV)"}
              </button>
            </div>
          )}
        </nav>

        {/* Profil utilisateur en bas de sidebar */}
        <div className="shrink-0 border-t border-white/10 p-4">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F5A623]/20 text-xs font-bold text-[#F5A623]">
              {initiales}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">{utilisateur.identifiant}</p>
              <p className="truncate text-xs text-slate-400 uppercase">{utilisateur.role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Zone droite : header fixe + contenu scrollable */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="shrink-0 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm md:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
              aria-label="Ouvrir le menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-slate-900">
              {navItems.find((n) => n.path === location.pathname)?.label || "Tableau de bord"}
            </h1>
          </div>

          <button
            onClick={handleDeconnexion}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/20"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </header>

        {/* Main scrollable indépendamment de la sidebar */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}