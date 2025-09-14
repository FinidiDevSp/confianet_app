from fastapi import FastAPI

app = FastAPI(title="Confianet API")


@app.get("/", tags=["health"])
def read_root() -> dict[str, str]:
    """Return service health message."""
    return {"message": "Hello, World"}
