# Convertly

Application responsive de conversion de fichiers : Next.js/TypeScript pour l’interface, FastAPI/Python pour l’orchestration et CloudConvert pour les conversions.

## Formats intégrés

- Word DOCX ↔ PDF
- Excel XLSX ↔ PDF
- PowerPoint PPTX ↔ PDF
- JPG, PNG, WEBP vers PDF
- WEBP → JPG, JPG → PNG, PNG → WEBP et JPG → WEBP
- Sélection de plusieurs fichiers, avec un travail CloudConvert par fichier
- Limite dans l’interface et validation API des métadonnées : 20 Mo par fichier

Les fichiers sont envoyés du navigateur directement vers le formulaire d’import temporaire CloudConvert. Convertly ne reçoit pas le contenu des fichiers. Le navigateur impose 20 Mo sur le fichier réel; le backend vérifie également la taille déclarée avant de créer un travail. Pour un lancement public, ajouter une protection contre les créations automatisées de tâches (pare-feu/rate limit Vercel ou CAPTCHA) : l’API CloudConvert est secrète côté serveur, mais chaque appel crée un travail facturable.

## Prérequis CloudConvert

1. Créer une clé API CloudConvert avec les autorisations de création et lecture des tâches.
2. Ne jamais mettre cette clé dans une variable `NEXT_PUBLIC_*`.
3. Configurer dans Vercel les variables serveur `CLOUDCONVERT_API_KEY` et `CONVERTLY_JOB_SIGNING_SECRET` (secret aléatoire d’au moins 32 octets). `CLOUDCONVERT_BASE_URL` est facultatif et vaut par défaut `https://api.cloudconvert.com/v2`.
4. Pour le développement, utiliser l’API sandbox CloudConvert via `CLOUDCONVERT_BASE_URL=https://sandbox.api.cloudconvert.com/v2`.

## Développement local

Installer les dépendances Next.js :

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Dans un deuxième terminal PowerShell, démarrer Python :

```powershell
npm install
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:CLOUDCONVERT_API_KEY = "votre-cle-sandbox"
$env:CONVERTLY_JOB_SIGNING_SECRET = "un-secret-aleatoire-long"
$env:CLOUDCONVERT_BASE_URL = "https://sandbox.api.cloudconvert.com/v2"
$env:CONVERTLY_ALLOWED_ORIGINS = "http://localhost:3000"
uvicorn main:app --reload --port 8000
```

## Déploiement Vercel

Le fichier `vercel.json` déclare deux services, Next.js et FastAPI, avec `/api/*` routé vers Python. Dans Vercel, sélectionner le framework **Services** pour le projet et configurer les variables serveur listées plus haut. Services est actuellement en bêta; le projet Vercel doit y avoir accès.

Les fichiers partent directement du navigateur vers CloudConvert, ce qui évite le plafond de corps de requête de 4,5 Mo des Functions pour les téléversements. CloudConvert conserve les fichiers pour le traitement puis les supprime; ses pages de sécurité et confidentialité indiquent une suppression automatique au plus tard sous 24 heures. Informer les utilisateurs de ce traitement externe avant la mise en production.
