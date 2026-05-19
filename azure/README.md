# Delad resa (Azure)

En JSON-fil (publik läsning) + en liten Function (spara med hemlig nyckel).

## Deploy (en gång)

```bash
chmod +x azure/deploy.sh
./azure/deploy.sh
```

Skriptet skapar resursgruppen `rg-roadtrip-map-live`, deployar allt och skriver `azure/deploy-output.env`.

1. Kopiera `VITE_*` från output till `.env` lokalt.
2. Lägg samma variabler som **GitHub Actions secrets** (Settings → Secrets).
3. Bokmärk **din** länk med `?key=...` (från output). Dela **inte** den.
4. Familj får vanlig GitHub Pages-URL (utan `?key=`).

## Efter deploy

- **Du:** bocka av stopp → **Spara för familjen** i sidopanelen (några gånger per dag räcker).
- **Familj:** öppnar sidan → **Hämta senaste** (eller ladda om).
