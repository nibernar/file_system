
## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# tests de l'étape 1.1 complète
npm run test:file-system:step-1-1

# Tests configuration seulement
npm run test:file-system:config

# Tests types seulement  
npm run test:file-system:types

# Tests constantes seulement
npm run test:file-system:constants

# tests avec coverage
npm run test:file-system:coverage

# tests en mode watch (développement)
npm run test:file-system:watch
```

## Deployment

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```








## Stratégie de test complète pour la sécurité

# Niveau 1 : Validation basique (✅ Fait actuellement)
    Extensions de fichiers
    Types MIME
    Taille des fichiers
    Patterns de noms dangereux

# Niveau 2 : Analyse de contenu (❌ Manquant)
    Signatures de fichiers réelles
    Détection de contenu caché
    Analyse des métadonnées
    Validation de structure

# Niveau 3 : Scan antivirus (❌ Manquant)
    Intégration ClamAV/Windows Defender
    Test avec EICAR
    Gestion des timeouts
    Fallback si service indisponible

# Niveau 4 : Analyse comportementale (❌ Manquant)
    Détection d'obfuscation
    Analyse des scripts embarqués
    Détection de polyglots
    Tests de sandboxing