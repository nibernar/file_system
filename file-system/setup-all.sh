#!/bin/bash
set -e

echo "🚀 Setting up all services for Coders File System..."

# Couleurs pour le output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PRISMA_SCHEMA_PATH="src/infrastructure/prisma/schema.prisma"

# Arrêter les services existants
echo -e "${YELLOW}Stopping existing services...${NC}"
docker compose down

# Démarrer tous les services
echo -e "${BLUE}Starting all services...${NC}"
docker compose up -d

# Attendre que tous les services soient prêts
echo -e "${YELLOW}Waiting for services to be ready...${NC}"

# Attendre PostgreSQL
echo -n "Waiting for PostgreSQL..."
until docker exec coders-files-db pg_isready -U postgres > /dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo -e " ${GREEN}Ready!${NC}"

# Attendre Redis
echo -n "Waiting for Redis..."
until docker exec coders-files-redis redis-cli ping > /dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo -e " ${GREEN}Ready!${NC}"

# Attendre Garage
echo -n "Waiting for Garage..."
MAX_GARAGE_ATTEMPTS=30
GARAGE_ATTEMPT=0
while [ $GARAGE_ATTEMPT -lt $MAX_GARAGE_ATTEMPTS ]; do
  if docker exec garage-dev /garage status > /dev/null 2>&1; then
    echo -e " ${GREEN}Ready!${NC}"
    break
  fi
  echo -n "."
  sleep 2
  ((GARAGE_ATTEMPT++))
done

if [ $GARAGE_ATTEMPT -eq $MAX_GARAGE_ATTEMPTS ]; then
  echo -e " ${RED}Failed!${NC}"
  echo -e "${RED}ERROR: Garage did not start properly${NC}"
  docker compose logs garage
  exit 1
fi

# Attendre un peu plus pour que Garage soit complètement initialisé
sleep 5

# Configuration du layout Garage
echo -e "${BLUE}Configuring Garage layout...${NC}"

# Récupérer le Node ID et vérifier s'il a un rôle
GARAGE_STATUS=$(docker exec garage-dev /garage status 2>/dev/null)
NODE_ID=$(echo "$GARAGE_STATUS" | grep -A 10 "HEALTHY NODES" | grep -E '^[a-f0-9]{16}' | head -n 1 | awk '{print $1}')

if [ -z "$NODE_ID" ]; then
  echo -e "${RED}ERROR: Could not determine Node ID. Garage status:${NC}"
  echo "$GARAGE_STATUS"
  exit 1
fi

echo -e "${GREEN}Node ID detected: $NODE_ID${NC}"

# Vérifier si le node a "NO ROLE ASSIGNED"
NODE_LINE=$(echo "$GARAGE_STATUS" | grep "$NODE_ID")
if echo "$NODE_LINE" | grep -q "NO ROLE ASSIGNED"; then
  echo -e "${YELLOW}Node has no role assigned. Configuring...${NC}"
  
  # Assigner le layout
  echo -e "${YELLOW}Assigning layout to node $NODE_ID...${NC}"
  if ! docker exec garage-dev /garage layout assign -z "dev-zone" -c 1G "$NODE_ID"; then
    echo -e "${RED}ERROR: Failed to assign layout${NC}"
    exit 1
  fi
  
  # Afficher le layout proposé
  echo -e "${BLUE}Proposed layout:${NC}"
  docker exec garage-dev /garage layout show
  
  # Appliquer le layout
  echo -e "${YELLOW}Applying layout changes...${NC}"
  if ! docker exec garage-dev /garage layout apply --version 1; then
    echo -e "${RED}ERROR: Failed to apply layout${NC}"
    exit 1
  fi
  
  # Attendre que le layout soit appliqué
  echo "Waiting for ring to stabilize..."
  sleep 5
  
  echo -e "${GREEN}Layout applied successfully!${NC}"
elif echo "$NODE_LINE" | grep -q "dev-zone"; then
  echo -e "${GREEN}Node already has the correct zone assigned.${NC}"
else
  # Le node a un rôle mais pas dans dev-zone
  CURRENT_ZONE=$(echo "$NODE_LINE" | awk '{print $5}')
  echo -e "${YELLOW}Node is in zone '$CURRENT_ZONE', expected 'dev-zone'${NC}"
  echo -e "${YELLOW}You may need to reset Garage data or manually reconfigure${NC}"
fi

# Vérifier si des clés existent déjà
echo -e "${BLUE}Checking for existing access keys...${NC}"
EXISTING_KEYS=$(docker exec garage-dev /garage key list 2>/dev/null | grep -c "dev-key" || echo "0")

if [ "$EXISTING_KEYS" -gt "0" ]; then
  echo -e "${YELLOW}Found existing access key(s). Reusing...${NC}"
  # Récupérer la première clé dev-key existante
  KEY_INFO=$(docker exec garage-dev /garage key list 2>/dev/null | grep "dev-key" | head -n 1)
  ACCESS_KEY=$(echo "$KEY_INFO" | awk '{print $1}')
  
  # Pour la secret key, on ne peut pas la récupérer, donc on garde celle du .env si elle existe
  if [ -f .env ] && grep -q "^GARAGE_SECRET_KEY=" .env; then
    SECRET_KEY=$(grep "^GARAGE_SECRET_KEY=" .env | cut -d'=' -f2)
    echo -e "${YELLOW}Using existing secret key from .env${NC}"
  else
    echo -e "${RED}WARNING: Cannot retrieve secret key for existing access key${NC}"
    echo -e "${YELLOW}You may need to create a new key or use the existing one from your .env backup${NC}"
  fi
else
  # Créer une nouvelle clé d'accès
  echo -e "${BLUE}Creating new Garage access key...${NC}"
  KEY_OUTPUT=$(docker exec garage-dev /garage key create "dev-key-$(date +%s)")
  ACCESS_KEY=$(echo "$KEY_OUTPUT" | grep "Key ID:" | awk '{print $3}')
  SECRET_KEY=$(echo "$KEY_OUTPUT" | grep "Secret key:" | awk '{print $3}')
  
  if [ -z "$ACCESS_KEY" ] || [ -z "$SECRET_KEY" ]; then
    echo -e "${RED}ERROR: Could not create access key. Key output:${NC}"
    echo "$KEY_OUTPUT"
    exit 1
  fi
  
  echo -e "${GREEN}Access key created successfully!${NC}"
fi

# Créer les buckets
echo -e "${BLUE}Managing buckets...${NC}"
BUCKETS=("coders-documents" "coders-backups" "coders-temp")

for BUCKET in "${BUCKETS[@]}"; do
    if ! docker exec garage-dev /garage bucket list 2>/dev/null | grep -q "$BUCKET"; then
        echo "Creating bucket: $BUCKET"
        if ! docker exec garage-dev /garage bucket create "$BUCKET"; then
          echo -e "${RED}ERROR: Failed to create bucket $BUCKET${NC}"
          continue
        fi
        
        # Attribuer les permissions si on a un ACCESS_KEY
        if [ -n "$ACCESS_KEY" ]; then
          if docker exec garage-dev /garage bucket allow --read --write --owner "$BUCKET" --key "$ACCESS_KEY"; then
            echo -e "${GREEN}✓ Bucket $BUCKET created and configured${NC}"
          else
            echo -e "${YELLOW}Warning: Could not set permissions for $BUCKET${NC}"
          fi
        fi
    else
        echo -e "${GREEN}✓ Bucket $BUCKET already exists${NC}"
        # Vérifier/ajouter les permissions si nécessaire
        if [ -n "$ACCESS_KEY" ]; then
          docker exec garage-dev /garage bucket allow --read --write --owner "$BUCKET" --key "$ACCESS_KEY" 2>/dev/null || true
        fi
    fi
done

# Mettre à jour .env seulement si on a des nouvelles valeurs
if [ -n "$ACCESS_KEY" ] && [ -n "$SECRET_KEY" ]; then
  echo -e "${BLUE}Updating .env file...${NC}"
  
  # Fonction pour mettre à jour ou ajouter une variable dans .env
  update_env_var() {
      local key=$1
      local value=$2
      if [ -f .env ] && grep -q "^${key}=" .env; then
          # La clé existe, la mettre à jour
          if [[ "$OSTYPE" == "darwin"* ]]; then
              # macOS
              sed -i '' "s|^${key}=.*|${key}=${value}|" .env
          else
              # Linux
              sed -i "s|^${key}=.*|${key}=${value}|" .env
          fi
      else
          # La clé n'existe pas, l'ajouter
          echo "${key}=${value}" >> .env
      fi
  }
  
  # Mettre à jour les variables
  update_env_var "GARAGE_ACCESS_KEY" "$ACCESS_KEY"
  update_env_var "GARAGE_SECRET_KEY" "$SECRET_KEY"
  update_env_var "GARAGE_ENDPOINT" "http://localhost:3902"
  update_env_var "DATABASE_URL" "postgresql://postgres:postgres@localhost:5432/coders_files?schema=public"
  
  echo -e "${GREEN}Environment variables updated!${NC}"
fi


# Lancer les migrations Prisma
echo -e "${BLUE}Running database migrations...${NC}"
if npx prisma migrate dev --name init --skip-seed --schema=${PRISMA_SCHEMA_PATH} 2>/dev/null; then
    echo -e "${GREEN}Database migrations completed!${NC}"
else
    echo -e "${YELLOW}Database migrations may have already been applied or failed.${NC}"
    echo -e "${YELLOW}Check with: npx prisma migrate status --schema=${PRISMA_SCHEMA_PATH}${NC}"
fi

# Générer le client Prisma
echo -e "${BLUE}Generating Prisma client...${NC}"
if npx prisma generate --schema=${PRISMA_SCHEMA_PATH}; then
    echo -e "${GREEN}Prisma client generated!${NC}"
else
    echo -e "${YELLOW}Prisma client generation failed. You may need to run it manually.${NC}"
fi

# Afficher le statut final
echo -e "\n${GREEN}✅ All services are ready!${NC}"
echo -e "${BLUE}Service Status:${NC}"
docker compose ps

# Vérifier le statut de Garage
echo -e "\n${BLUE}Garage Status:${NC}"
docker exec garage-dev /garage status

echo -e "\n${BLUE}Service URLs:${NC}"
echo "📊 PostgreSQL: postgresql://postgres:postgres@localhost:5432/coders_files"
echo "🔄 Redis: redis://localhost:6379"
echo "📦 Garage S3: http://localhost:3902"
echo "🔧 Garage Admin: http://localhost:3900"

if [ -n "$ACCESS_KEY" ]; then
  echo -e "\n${BLUE}Garage Credentials:${NC}"
  echo "Access Key: $ACCESS_KEY"
  if [ -n "$SECRET_KEY" ]; then
    echo "Secret Key: $SECRET_KEY"
  else
    echo "Secret Key: Check your .env file or .env.backup files"
  fi
fi

echo -e "\n${GREEN}Your services are configured and ready to use!${NC}"
