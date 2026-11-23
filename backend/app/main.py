from fastapi import FastAPI

app = FastAPI(
    title="Saamaya — Espace relevés marchand",
    version="0.1.0",
    description="Import des paiements, consultation et export des relevés marchand.",
)


@app.get("/sante")
def sante():
    return {"statut": "ok"}
