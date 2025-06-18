#!/bin/bash

# debug-garage-improved.sh - Script amélioré pour diagnostiquer Garage

echo "🔍 Garage Debug Script (Improved)"
echo "================================"

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Vérifier le conteneur
echo -e "\n${BLUE}1. Container Status${NC}"
echo "-------------------"
docker ps -a --filter name=garage-dev --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Vérifier les volumes
echo -e "\n${BLUE}2. Volume Status${NC}"
echo "----------------"
docker volume ls | grep garage

# Health check alternatif
echo -e "\n${BLUE}3. Garage Health Check (using garage command)${NC}"
echo "---------------------------------------------"
if docker exec garage-dev /garage status >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Garage is responding to status command${NC}"
else
    echo -e "${RED}✗ Garage is not responding${NC}"
fi

# Status détaillé
echo -e "\n${BLUE}4. Detailed Garage Status${NC}"
echo "------------------------"
docker exec garage-dev /garage status 2>&1

# Configuration actuelle
echo -e "\n${BLUE}5. Current Layout${NC}"
echo "-----------------"
docker exec garage-dev /garage layout show 2>&1

# Buckets
echo -e "\n${BLUE}6. Buckets${NC}"
echo "----------"
docker exec garage-dev /garage bucket list 2>&1

# Keys
echo -e "\n${BLUE}7. Access Keys${NC}"
echo "--------------"
docker exec garage-dev /garage key list 2>&1

# Vérifier la connectivité S3
echo -e "\n${BLUE}8. S3 API Connectivity Test${NC}"
echo "---------------------------"
# Test simple avec netcat
if nc -zv localhost 3902 2>&1; then
    echo -e "${GREEN}✓ S3 API port is accessible${NC}"
else
    echo -e "${RED}✗ S3 API port is not accessible${NC}"
fi

# Logs récents avec filtrage
echo -e "\n${BLUE}9. Recent Logs (filtered)${NC}"
echo "-------------------------"
echo "Errors and warnings:"
docker logs garage-dev 2>&1 | tail -50 | grep -E "(ERROR|WARN|error|warning)" || echo "No errors found in recent logs"

echo -e "\nLast 20 lines:"
docker logs garage-dev 2>&1 | tail -20

# Vérifier la configuration dans le conteneur
echo -e "\n${BLUE}10. Configuration File Check${NC}"
echo "----------------------------"
docker exec garage-dev cat /etc/garage.toml 2>&1 | head -20

# Statistiques du conteneur
echo -e "\n${BLUE}11. Container Statistics${NC}"
echo "------------------------"
docker stats garage-dev --no-stream

echo -e "\n${GREEN}Debug complete!${NC}"