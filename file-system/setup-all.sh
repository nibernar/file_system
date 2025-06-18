#!/bin/bash
set -e

echo "🚀 Setting up all services for Coders File System..."

# Couleurs pour le output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PRISMA_DIR="src/infrastructure/prisma"
PRISMA_SCHEMA_PATH="$PRISMA_DIR/schema.prisma"

# Initialiser Prisma si besoin
if [ ! -f "$PRISMA_SCHEMA_PATH" ]; then
  echo -e "${YELLOW}Prisma schema not found. Initializing...${NC}"
  mkdir -p "$PRISMA_DIR"
  npx prisma init --schema="$PRISMA_SCHEMA_PATH"
  echo -e "${GREEN}Prisma initialized at $PRISMA_SCHEMA_PATH${NC}"
fi

# Arrêter les services existants
echo -e "${YELLOW}Stopping existing services...${NC}"
docker compose down

# Démarrer tous les services
echo -e "${BLUE}Starting all services...${NC}"
docker compose up -d

# Attente des services
wait_for_service() {
  local name="$1"
  local cmd="$2"
  echo -n "Waiting for $name..."
  until eval "$cmd" > /dev/null 2>&1; do
    echo -n "."
    sleep 1
  done
  echo -e " ${GREEN}Ready!${NC}"
}

wait_for_service "PostgreSQL" "docker exec coders-files-db pg_isready -U postgres"
wait_for_service "Redis" "docker exec coders-files-redis redis-cli ping | grep PONG"

# Attente Garage
echo -n "Waiting for Garage..."
for i in {1..30}; do
  if docker exec garage-dev /garage status > /dev/null 2>&1; then
    echo -e " ${GREEN}Ready!${NC}"
    break
  fi
  echo -n "."
  sleep 2
  [[ $i -eq 30 ]] && {
    echo -e " ${RED}Failed!${NC}"
    docker compose logs garage
    exit 1
  }
done

sleep 5

# Configuration Garage
GARAGE_STATUS=$(docker exec garage-dev /garage status 2>/dev/null)
NODE_ID=$(echo "$GARAGE_STATUS" | grep -A 10 "HEALTHY NODES" | grep -E '^[a-f0-9]{16}' | head -n 1 | awk '{print $1}')

if [ -z "$NODE_ID" ]; then
  echo -e "${RED}Could not detect Garage node ID.${NC}"
  exit 1
fi

echo -e "${GREEN}Node ID: $NODE_ID${NC}"

if echo "$GARAGE_STATUS" | grep "$NODE_ID" | grep -q "NO ROLE ASSIGNED"; then
  echo -e "${YELLOW}Assigning layout...${NC}"
  docker exec garage-dev /garage layout assign -z "dev-zone" -c 1G "$NODE_ID"
  docker exec garage-dev /garage layout apply --version 1
  sleep 5
  echo -e "${GREEN}Layout applied.${NC}"
fi

# Gestion des access keys
EXISTING_KEYS=$(docker exec garage-dev /garage key list | grep -c "dev-key" || echo 0)
if [ "$EXISTING_KEYS" -gt 0 ]; then
  KEY_INFO=$(docker exec garage-dev /garage key list | grep "dev-key" | head -n 1)
  ACCESS_KEY=$(echo "$KEY_INFO" | awk '{print $1}')
  SECRET_KEY=$(grep "^GARAGE_SECRET_KEY=" .env | cut -d'=' -f2)
else
  OUTPUT=$(docker exec garage-dev /garage key create "dev-key-$(date +%s)")
  ACCESS_KEY=$(echo "$OUTPUT" | grep "Key ID:" | awk '{print $3}')
  SECRET_KEY=$(echo "$OUTPUT" | grep "Secret key:" | awk '{print $3}')
fi

# Création des buckets
BUCKETS=("coders-documents" "coders-backups" "coders-temp")
for BUCKET in "${BUCKETS[@]}"; do
  if ! docker exec garage-dev /garage bucket list | grep -q "$BUCKET"; then
    docker exec garage-dev /garage bucket create "$BUCKET"
  fi
  docker exec garage-dev /garage bucket allow --read --write --owner "$BUCKET" --key "$ACCESS_KEY" || true
done

# Mise à jour .env
update_env_var() {
  local key=$1
  local value=$2
  if [ -f .env ] && grep -q "^${key}=" .env; then
    sed -i "" "s|^${key}=.*|${key}=${value}|" .env 2>/dev/null || sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

update_env_var "GARAGE_ACCESS_KEY" "$ACCESS_KEY"
update_env_var "GARAGE_SECRET_KEY" "$SECRET_KEY"
update_env_var "GARAGE_ENDPOINT" "http://localhost:3902"
update_env_var "DATABASE_URL" "postgresql://postgres:postgres@localhost:5432/coders_files?schema=public"

echo -e "${GREEN}Environment variables updated!${NC}"

# Prisma migrations
echo -e "${BLUE}Running database migrations...${NC}"
if npx prisma migrate dev --name init --skip-seed --schema="$PRISMA_SCHEMA_PATH" 2>/dev/null; then
  echo -e "${GREEN}Database migrations completed!${NC}"
else
  echo -e "${YELLOW}Database migrations may have already been applied or failed.${NC}"
  echo -e "${YELLOW}Check with: npx prisma migrate status --schema=$PRISMA_SCHEMA_PATH${NC}"
fi

# Prisma client
echo -e "${BLUE}Generating Prisma client...${NC}"
if npx prisma generate --schema="$PRISMA_SCHEMA_PATH"; then
  echo -e "${GREEN}Prisma client generated!${NC}"
else
  echo -e "${YELLOW}Prisma client generation failed. You may need to run it manually.${NC}"
fi

# Final output
echo -e "\n${GREEN}✅ All services are ready!${NC}"
docker compose ps

echo -e "\n${BLUE}Garage Status:${NC}"
docker exec garage-dev /garage status

echo -e "\n${BLUE}Service URLs:${NC}"
echo "📊 PostgreSQL: postgresql://postgres:postgres@localhost:5432/coders_files"
echo "🔄 Redis: redis://localhost:6379"
echo "📦 Garage S3: http://localhost:3902"
echo "🔧 Garage Admin: http://localhost:3900"

echo -e "\n${BLUE}Garage Credentials:${NC}"
echo "Access Key: $ACCESS_KEY"
echo "Secret Key: $SECRET_KEY"

echo -e "\n${GREEN}Your services are configured and ready to use!${NC}"

