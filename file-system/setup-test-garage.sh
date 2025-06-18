#!/bin/bash

# setup-test-garage.sh - Configure automatiquement Garage pour les tests

echo "🔧 Setting up Garage test environment..."

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Attendre que Garage soit prêt
echo -n "Waiting for Garage to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if docker exec garage-dev /garage status > /dev/null 2>&1; then
        echo -e " ${GREEN}Ready!${NC}"
        break
    fi
    echo -n "."
    sleep 1
    ((ATTEMPT++))
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e " ${YELLOW}Timeout!${NC}"
    exit 1
fi

# Vérifier si une clé de test existe déjà
echo -e "\n${BLUE}Checking for existing test key...${NC}"
EXISTING_TEST_KEY=$(docker exec garage-dev /garage key list 2>/dev/null | grep "test-key" | head -n 1 | awk '{print $1}')

if [ -n "$EXISTING_TEST_KEY" ]; then
    echo -e "${GREEN}✓ Test key already exists: $EXISTING_TEST_KEY${NC}"
    ACCESS_KEY="$EXISTING_TEST_KEY"
    # Récupérer la secret key depuis .env.test si elle existe
    if [ -f .env.test ] && grep -q "GARAGE_TEST_SECRET_KEY=" .env.test; then
        SECRET_KEY=$(grep "GARAGE_TEST_SECRET_KEY=" .env.test | cut -d'=' -f2)
        echo "Using existing secret key from .env.test"
    else
        echo -e "${YELLOW}Warning: Cannot retrieve secret key. You'll need to create a new key.${NC}"
        NEED_NEW_KEY=true
    fi
else
    NEED_NEW_KEY=true
fi

# Créer une nouvelle clé si nécessaire
if [ "$NEED_NEW_KEY" = true ]; then
    echo -e "\n${BLUE}Creating new test key...${NC}"
    KEY_OUTPUT=$(docker exec garage-dev /garage key create "test-key")
    ACCESS_KEY=$(echo "$KEY_OUTPUT" | grep "Key ID:" | awk '{print $3}')
    SECRET_KEY=$(echo "$KEY_OUTPUT" | grep "Secret key:" | awk '{print $3}')
    
    echo -e "${GREEN}✓ New test key created${NC}"
    echo "Access Key: $ACCESS_KEY"
    
    # Mettre à jour .env.test
    echo -e "\n${BLUE}Updating .env.test...${NC}"
    
    # Mettre à jour ou créer .env.test
    if [ -f .env.test ]; then
        # macOS compatible sed
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/GARAGE_TEST_ACCESS_KEY=.*/GARAGE_TEST_ACCESS_KEY=$ACCESS_KEY/" .env.test
            sed -i '' "s/GARAGE_TEST_SECRET_KEY=.*/GARAGE_TEST_SECRET_KEY=$SECRET_KEY/" .env.test
            sed -i '' "s/GARAGE_ACCESS_KEY=.*/GARAGE_ACCESS_KEY=$ACCESS_KEY/" .env.test
            sed -i '' "s/GARAGE_SECRET_KEY=.*/GARAGE_SECRET_KEY=$SECRET_KEY/" .env.test
        else
            sed -i "s/GARAGE_TEST_ACCESS_KEY=.*/GARAGE_TEST_ACCESS_KEY=$ACCESS_KEY/" .env.test
            sed -i "s/GARAGE_TEST_SECRET_KEY=.*/GARAGE_TEST_SECRET_KEY=$SECRET_KEY/" .env.test
            sed -i "s/GARAGE_ACCESS_KEY=.*/GARAGE_ACCESS_KEY=$ACCESS_KEY/" .env.test
            sed -i "s/GARAGE_SECRET_KEY=.*/GARAGE_SECRET_KEY=$SECRET_KEY/" .env.test
        fi
    else
        echo -e "${YELLOW}Creating new .env.test file${NC}"
        cat > .env.test << EOF
# Configuration de test pour File System
NODE_ENV=test
LOG_LEVEL=error

# Garage S3 Test Configuration
GARAGE_TEST_ENDPOINT=http://localhost:3902
GARAGE_TEST_ACCESS_KEY=$ACCESS_KEY
GARAGE_TEST_SECRET_KEY=$SECRET_KEY
GARAGE_TEST_BUCKET=test-integration-coders-file-system
GARAGE_TEST_REGION=eu-west-1

# Legacy Garage variables
GARAGE_ENDPOINT=http://localhost:3902
GARAGE_ACCESS_KEY=$ACCESS_KEY
GARAGE_SECRET_KEY=$SECRET_KEY
GARAGE_BUCKET_DOCUMENTS=test-coders-documents
GARAGE_BUCKET_BACKUPS=test-coders-backups
GARAGE_BUCKET_TEMP=test-coders-temp
GARAGE_REGION=eu-west-1

# CDN Test Configuration
CDN_BASE_URL=https://cdn.test.coders.com
CDN_CACHE_CONTROL=public, max-age=300
CDN_INVALIDATION_TOKEN=test_cdn_invalidation_token_123
CDN_EDGE_LOCATIONS=eu-west-1,us-east-1
CDN_DEFAULT_TTL=300
CDN_MAX_TTL=3600

# Processing Test Configuration  
MAX_FILE_SIZE=10485760
ALLOWED_MIME_TYPES=image/jpeg,application/pdf,text/plain
VIRUS_SCAN_TIMEOUT=5000
IMAGE_OPTIMIZATION_QUALITY=75
THUMBNAIL_SIZE=128

# Security Test Configuration
PRESIGNED_URL_EXPIRY=1800
MAX_PRESIGNED_URLS=5
IP_RESTRICTION_ENABLED=false
SCAN_VIRUS_ENABLED=false
RATE_LIMIT_UPLOADS_PER_MINUTE=20
ABUSE_BLOCK_DURATION=60
DEVICE_FINGERPRINTING_ENABLED=false
SECURITY_TOKEN_SECRET=test_security_token_secret_with_minimum_32_characters_length
EOF
    fi
    
    echo -e "${GREEN}✓ .env.test updated${NC}"
fi

# Créer les buckets de test
echo -e "\n${BLUE}Creating test buckets...${NC}"

# Bucket principal de test
if ! docker exec garage-dev /garage bucket list 2>/dev/null | grep -q "test-integration-coders-file-system"; then
    docker exec garage-dev /garage bucket create test-integration-coders-file-system
    docker exec garage-dev /garage bucket allow --read --write --owner test-integration-coders-file-system --key "$ACCESS_KEY"
    echo -e "${GREEN}✓ Created test-integration-coders-file-system${NC}"
else
    # S'assurer que les permissions sont correctes
    docker exec garage-dev /garage bucket allow --read --write --owner test-integration-coders-file-system --key "$ACCESS_KEY" 2>/dev/null || true
    echo -e "${GREEN}✓ test-integration-coders-file-system already exists${NC}"
fi

# Autres buckets de test
for BUCKET in test-coders-documents test-coders-backups test-coders-temp; do
    if ! docker exec garage-dev /garage bucket list 2>/dev/null | grep -q "$BUCKET"; then
        docker exec garage-dev /garage bucket create "$BUCKET"
        docker exec garage-dev /garage bucket allow --read --write --owner "$BUCKET" --key "$ACCESS_KEY"
        echo -e "${GREEN}✓ Created $BUCKET${NC}"
    else
        docker exec garage-dev /garage bucket allow --read --write --owner "$BUCKET" --key "$ACCESS_KEY" 2>/dev/null || true
        echo -e "${GREEN}✓ $BUCKET already exists${NC}"
    fi
done

# Afficher le résumé
echo -e "\n${GREEN}✅ Garage test environment ready!${NC}"
echo -e "\n${BLUE}Summary:${NC}"
echo "Access Key: $ACCESS_KEY"
echo "Buckets configured:"
docker exec garage-dev /garage bucket list | grep -E "(test-integration-coders-file-system|test-coders-)"

echo -e "\n${YELLOW}You can now run your tests:${NC}"
echo "npm run test:file-system:step-1-2"