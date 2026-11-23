import pytest

from app.frais import calculer_frais_commission_net, frais_reseau

# Les 6 cas de contrôle imposés par le sujet : (montant, frais, commission, net)
CAS_CONTROLE = [
    (500, 5, 50, 445),
    (10_000, 100, 50, 9_850),
    (250_000, 1_000, 50, 248_950),
    (300_000, 3_000, 50, 296_950),
    (1_234_567, 5_000, 50, 1_229_517),
    (6_000_000, 25_000, 50, 5_974_950),
]


@pytest.mark.parametrize("montant,frais,commission,net", CAS_CONTROLE)
def test_cas_controle(montant, frais, commission, net):
    assert calculer_frais_commission_net(montant, "CONFIRME") == (frais, commission, net)


@pytest.mark.parametrize(
    "montant,frais_attendu",
    [
        (500, 5),            # borne basse tranche A
        (250_000, 1_000),    # borne haute A : plafond atteint
        (250_001, 2_500),    # passage en B : le plafond change, pas le taux
        (5_000_000, 5_000),  # borne haute B : plafond atteint
        (5_000_001, 25_000), # passage en C : 0,5 % dépasse déjà le plafond
        (100_000_000, 25_000),  # borne haute C
    ],
)
def test_bornes_des_tranches(montant, frais_attendu):
    assert frais_reseau(montant) == frais_attendu


@pytest.mark.parametrize(
    "montant,frais_attendu",
    [
        (550, 6),        # 5,5 -> 6 : le 0,5 part vers le haut
        (549, 5),        # 5,49 -> 5
        (300_050, 3_001),  # 3 000,5 -> 3 001 (tranche B, sous le plafond)
        (300_049, 3_000),  # 3 000,49 -> 3 000
    ],
)
def test_arrondi_demi_vers_le_haut(montant, frais_attendu):
    assert frais_reseau(montant) == frais_attendu


@pytest.mark.parametrize("montant", [0, 499, -1_000, 100_000_001])
def test_montant_hors_tranche(montant):
    with pytest.raises(ValueError, match="hors tranche"):
        frais_reseau(montant)


@pytest.mark.parametrize("statut", ["EN_ATTENTE", "REFUSE"])
def test_statut_non_confirme_donne_null(statut):
    assert calculer_frais_commission_net(10_000, statut) == (None, None, None)


def test_resultats_toujours_entiers():
    for montant, _, _, _ in CAS_CONTROLE:
        frais, commission, net = calculer_frais_commission_net(montant, "CONFIRME")
        assert type(frais) is int
        assert type(commission) is int
        assert type(net) is int