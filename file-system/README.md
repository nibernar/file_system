
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

# Premier setup (création des buckets, migrations, etc.)
npm run dev:setup

# Démarrer les services (si déjà configurés)
npm run dev:start

# Voir les logs
npm run dev:logs

# Arrêter tout
npm run dev:stop

# Nettoyer tout (attention, supprime les données)
npm run dev:clean
```

## Run tests

```bash
$ make test

```

## Deployment

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

# a deactiver en prod !!!!
# Tester l'API : Allez sur http://localhost:3000/api/docs
# Tester les queues : Allez sur http://localhost:3000/admin/queues