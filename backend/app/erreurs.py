"""Erreurs de l'API : messages en français et modèle de documentation OpenAPI.

FastAPI renvoie par défaut une erreur 422 avec un message technique en anglais
quand un paramètre est absent ou mal formé. Le sujet exige un code HTTP juste
(400, 401, 403, 404) et un message clair en français : ce module s'en charge.
"""

from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErreurReponse(BaseModel):
    """Format de toutes les erreurs de l'API."""

    detail: str


# Messages français pour les erreurs que Starlette génère lui-même (404, 405...)
MESSAGES_HTTP = {
    404: "Ressource introuvable.",
    405: "Méthode non autorisée pour cette adresse.",
}

TYPES_DATE = {"date_parsing", "date_from_datetime_parsing", "date_from_datetime_inexact", "date_type"}
TYPES_ENTIER = {"int_parsing", "int_type", "int_from_float"}


def _message_validation(erreur: dict) -> str:
    """Transforme une erreur de validation Pydantic en phrase française."""
    type_ = erreur.get("type", "")
    loc = erreur.get("loc", ())
    ctx = erreur.get("ctx") or {}

    if type_ == "json_invalid":
        return "Le corps de la requête n'est pas un JSON valide."
    if loc == ("body",) and type_ == "missing":
        return "Le corps de la requête est obligatoire."

    nom = str(loc[-1]) if len(loc) > 1 else str(loc[0] if loc else "?")
    genre = "champ" if loc and loc[0] == "body" else "paramètre"
    sujet = f"Le {genre} « {nom} »"

    if type_ == "missing":
        return f"{sujet} est obligatoire."
    if type_ in TYPES_DATE:
        return f"{sujet} doit être une date au format AAAA-MM-JJ (exemple : 2026-11-01)."
    if type_ in TYPES_ENTIER:
        return f"{sujet} doit être un nombre entier."
    if type_ == "greater_than_equal":
        return f"{sujet} doit être supérieur ou égal à {ctx.get('ge')}."
    if type_ == "less_than_equal":
        return f"{sujet} doit être inférieur ou égal à {ctx.get('le')}."
    if type_ == "string_type":
        return f"{sujet} doit être un texte."
    return f"{sujet} est invalide."


async def erreur_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
    # 400 et non 422 : c'est le code demandé par le sujet pour une requête invalide
    messages = [_message_validation(e) for e in exc.errors()]
    return JSONResponse(status_code=400, content={"detail": " ".join(messages)})


async def erreur_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    detail = exc.detail
    try:
        phrase_anglaise = HTTPStatus(exc.status_code).phrase
    except ValueError:
        phrase_anglaise = None
    # Nos propres HTTPException portent déjà un message français : on le garde.
    # Seul le texte anglais par défaut de Starlette (« Not Found ») est remplacé.
    if not isinstance(detail, str) or detail == phrase_anglaise:
        detail = MESSAGES_HTTP.get(exc.status_code, "Une erreur est survenue.")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail},
        headers=getattr(exc, "headers", None),
    )


def installer_gestionnaires(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, erreur_validation)
    app.add_exception_handler(StarletteHTTPException, erreur_http)