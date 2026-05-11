"""Aplica supabase-config.yml al proyecto via Supabase Management API."""
import os
import sys
import yaml
import requests

TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not TOKEN:
    print("ERROR: falta SUPABASE_ACCESS_TOKEN en el entorno.", file=sys.stderr)
    sys.exit(1)

with open("supabase-config.yml", encoding="utf-8") as f:
    cfg = yaml.safe_load(f)

ref = cfg["project_ref"]
base = f"https://api.supabase.com/v1/projects/{ref}"
headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}


def apply_postgrest(desired: dict) -> None:
    if not desired:
        print("postgrest: sin cambios definidos en config")
        return

    r = requests.get(f"{base}/postgrest", headers=headers, timeout=30)
    r.raise_for_status()
    current = r.json()
    print(f"postgrest actual: {current}")

    body = {k: v for k, v in desired.items() if current.get(k) != v}
    if not body:
        print("postgrest: ya esta en el valor deseado, nada que hacer")
        return

    print(f"postgrest -> aplicando: {body}")
    r = requests.patch(f"{base}/postgrest", headers=headers, json=body, timeout=30)
    if not r.ok:
        print(f"ERROR {r.status_code}: {r.text}", file=sys.stderr)
        r.raise_for_status()
    print(f"postgrest OK: {r.json()}")


apply_postgrest(cfg.get("postgrest", {}))
print("Listo.")
