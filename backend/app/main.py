from fastapi import FastAPI

from app.auth import router as router_auth

app = FastAPI(
    title="Saamaya — Espace relevés marchand",
    version="0.1.0",
    description="Import des paiements, consultation et export des relevés marchand.",
)
app.include_router(router_auth)


@app.get("/sante")
def sante():
    return {"statut": "ok"}
