#!/bin/bash

# debug-garage.sh - Script pour diagnostiquer les problèmes Garage

echo "🔍 Garage Debug Script"
echo "====================="

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Vérifier si le conteneur existe
echo -e "\n${BLUE}1. Checking container status...${NC}"
if docker ps -a | grep -q garage-dev; then
    echo -e "${GREEN}✓ Container 'garage-dev' exists${NC}"
    
    if docker ps | grep -q garage-dev; then
        echo -e "${GREEN}✓ Container is running${NC}"
    else
        echo -e "${RED}✗ Container is not running${NC}"
        echo "Last logs:"
        docker logs --tail 20 garage-dev
        
        echo -e "\n${YELLOW}Trying to start container...${NC}"
        docker start garage-dev
        sleep 5
    fi
else
    echo -e "${RED}✗ Container 'garage-dev' does not exist${NC}"
    exit 1
fi

# Vérifier la santé du service
echo -e "\n${BLUE}2. Checking Garage health...${NC}"
if docker exec garage-dev curl -f http://localhost:3900/health 2>/dev/null; then
    echo -e "${GREEN}✓ Garage health check passed${NC}"
else
    echo -e "${RED}✗ Garage health check failed${NC}"
fi

# Vérifier le status de Garage
echo -e "\n${BLUE}3. Garage status:${NC}"
docker exec garage-dev /garage status || echo -e "${RED}Failed to get status${NC}"

# Récupérer le Node ID
echo -e "\n${BLUE}4. Extracting Node ID...${NC}"
NODE_ID=$(docker exec garage-dev /garage status 2>/dev/null | grep -A 10 "HEALTHY NODES" | tail -n +3 | head -n 1 | awk '{print $1}')

if [ -n "$NODE_ID" ]; then
    echo -e "${GREEN}✓ Node ID: $NODE_ID${NC}"
    
    # Vérifier la zone
    ZONE=$(docker exec garage-dev /garage status | grep "$NODE_ID" | awk '{print $5}')
    echo -e "Zone: ${ZONE:-NO ZONE}"
else
    echo -e "${RED}✗ Could not extract Node ID${NC}"
    
    # Essayer une méthode alternative
    echo -e "${YELLOW}Trying alternative method...${NC}"
    docker exec garage-dev /garage node id 2>/dev/null || echo -e "${RED}Alternative method also failed${NC}"
fi

# Vérifier les buckets
echo -e "\n${BLUE}5. Checking buckets:${NC}"
docker exec garage-dev /garage bucket list 2>/dev/null || echo -e "${RED}Failed to list buckets${NC}"

# Vérifier les clés
echo -e "\n${BLUE}6. Checking keys:${NC}"
docker exec garage-dev /garage key list 2>/dev/null || echo -e "${RED}Failed to list keys${NC}"

# Vérifier la configuration
echo -e "\n${BLUE}7. Checking configuration file:${NC}"
if [ -f garage.toml ]; then
    echo -e "${GREEN}✓ garage.toml exists${NC}"
    echo "Content preview:"
    head -n 20 garage.toml
else
    echo -e "${RED}✗ garage.toml not found${NC}"
fi

# Vérifier les ports
echo -e "\n${BLUE}8. Checking port availability:${NC}"
for port in 3900 3901 3902; do
    if nc -z localhost $port 2>/dev/null; then
        echo -e "${GREEN}✓ Port $port is open${NC}"
    else
        echo -e "${RED}✗ Port $port is not accessible${NC}"
    fi
done

# Afficher les derniers logs
echo -e "\n${BLUE}9. Recent logs:${NC}"
docker logs --tail 30 garage-dev

echo -e "\n${BLUE}Diagnostic complete!${NC}"