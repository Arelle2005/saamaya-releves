"""Masquage des numéros de téléphone : jamais exposés en clair."""


def masquer_telephone(numero: str) -> str:
    # 699000001 -> "6XX XX X0 01" : 1er chiffre + 3 derniers visibles (format du sujet)
    return numero[0] + "XX XX X" + numero[-3] + " " + numero[-2:]