#!/bin/bash
set -e

echo "🔧 Configuring Garage layout..."

# Configuration du layout
NODE_ID=$(docker exec garage-dev /garage status | grep -A 10 "HEALTHY NODES" | tail -n +3 | head -n 1 | awk '{print $1}')
echo "Node ID: $NODE_ID"

# Vérifier si déjà configuré
CURRENT_ZONE=$(docker exec garage-dev /garage status | grep "$NODE_ID" | awk '{print $5}')

if [ "$CURRENT_ZONE" != "dev-zone" ]; then
    echo "🏗️ Assigning layout..."
    docker exec garage-dev /garage layout assign -z "dev-zone" -c 1000000000 "$NODE_ID"
    docker exec garage-dev /garage layout apply --version 1
    sleep 3
fi

# Créer clé
echo "🔑 Creating key..."
KEY_OUTPUT=$(docker exec garage-dev /garage key create "dev-key-$(date +%s)")
ACCESS_KEY=$(echo "$KEY_OUTPUT" | grep "Key ID:" | awk '{print $3}')
SECRET_KEY=$(echo "$KEY_OUTPUT" | grep "Secret key:" | awk '{print $3}')

# Créer bucket
echo "🪣 Creating bucket..."
BUCKET_NAME="test-integration-coders-file-system"
if ! docker exec garage-dev /garage bucket list | grep -q "$BUCKET_NAME"; then
    docker exec garage-dev /garage bucket create "$BUCKET_NAME"
fi

# Permissions
echo "🔗 Setting permissions..."
docker exec garage-dev /garage bucket allow --read --write --owner "$BUCKET_NAME" --key "$ACCESS_KEY"

# Mettre à jour .env.test
echo "📝 Updating .env.test..."
sed -i '' "s/GARAGE_TEST_ACCESS_KEY=.*/GARAGE_TEST_ACCESS_KEY=$ACCESS_KEY/" .env.test
sed -i '' "s/GARAGE_TEST_SECRET_KEY=.*/GARAGE_TEST_SECRET_KEY=$SECRET_KEY/" .env.test
sed -i '' "s/GARAGE_ACCESS_KEY=.*/GARAGE_ACCESS_KEY=$ACCESS_KEY/" .env.test
sed -i '' "s/GARAGE_SECRET_KEY=.*/GARAGE_SECRET_KEY=$SECRET_KEY/" .env.test

echo "✅ Done!"
echo "Access Key: $ACCESS_KEY"
echo "Secret Key: $SECRET_KEY"
echo "Endpoint: http://localhost:3902"
