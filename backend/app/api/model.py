"""Model power controls — the on / pause / off buttons for the client."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.lifecycle import lifecycle

router = APIRouter(prefix="/model", tags=["model"])


@router.get("/status")
async def status() -> dict:
    return await lifecycle.status()


@router.post("/on")
async def turn_on() -> dict:
    try:
        state = await lifecycle.turn_on()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"state": state.value}


@router.post("/pause")
async def pause() -> dict:
    return {"state": (await lifecycle.pause()).value}


@router.post("/resume")
async def resume() -> dict:
    try:
        state = await lifecycle.resume()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"state": state.value}


@router.post("/off")
async def turn_off() -> dict:
    return {"state": (await lifecycle.turn_off()).value}
