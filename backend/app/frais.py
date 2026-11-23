"""Calcul des frais réseau, de la commission et du net. Uniquement des entiers."""

COMMISSION_FCFA = 50

# (montant_min, montant_max, diviseur, plafond)
# 1 % -> diviseur 100 ; 0,5 % -> diviseur 200. Pas de flottant.
TRANCHES = [
    (500, 250_000, 100, 1_000),
    (250_001, 5_000_000, 100, 5_000),
    (5_000_001, 100_000_000, 200, 25_000),
]


def frais_reseau(montant: int) -> int:
    for minimum, maximum, diviseur, plafond in TRANCHES:
        if minimum <= montant <= maximum:
            # Arrondi au franc le plus proche, 0,5 vers le haut : (m + d/2) // d
            arrondi = (montant + diviseur // 2) // diviseur
            return min(arrondi, plafond)
    raise ValueError("Montant hors tranche : doit être compris entre 500 et 100 000 000 FCFA.")


def calculer_frais_commission_net(
    montant: int, statut: str
) -> tuple[int | None, int | None, int | None]:
    # Seuls les paiements confirmés portent des frais ; les autres restent NULL
    if statut != "CONFIRME":
        return (None, None, None)
    frais = frais_reseau(montant)
    return (frais, COMMISSION_FCFA, montant - frais - COMMISSION_FCFA)