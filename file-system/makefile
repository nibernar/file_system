
.PHONY: help test setup clean fresh-test

help:
	@echo "Available commands:"
	@echo "  make all         - Setup file_system environment"
	@echo "  make run         - run file_system app..."
	@echo "  make test        - Run file system tests"
	@echo "  make clean       - Clean all Docker volumes"
	@echo "  make fresh-test  - Clean, setup and test"

all:
	@echo "🔧 Setting up file_system environment..."
	npm run dev:setup


run:
	@echo "🔧 run file_system app..."
	npm run start:dev 


# Lance les tests
test:
	@echo "🧪 Running file system tests..."
	@chmod +x ./setup-test-garage.sh
	@./setup-test-garage.sh
	npm run test:file-system:step-1-1
	npm run test:file-system:step-1-2
	npm run test:file-system:step-1-3
	npm run test:file-system:step-2-1
	npm run test:file-system:step-2-2
	npm run test:file-system:step-3-1
	npm run test:file-system:step-3-2

# Nettoie tout
clean:
	@echo "🧹 Cleaning Docker environment..."
	npm run dev:clean
	
# Affiche les infos Garage
garage-info:
	@echo "📊 Garage Status:"
	@docker exec garage-dev /garage status
	@echo "\n📦 Buckets:"
	@docker exec garage-dev /garage bucket list
	@echo "\n🔑 Keys:"
	@docker exec garage-dev /garage key list