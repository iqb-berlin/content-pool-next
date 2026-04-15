# IQB ContentPool - Makefile
# Usage: make [target]

.PHONY: help dev prod stop logs status clean db-backup db-restore keycloak-admin

# Default target
help: ## Show this help message
	@echo "IQB ContentPool - Available Commands"
	@echo "===================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ============================================
# Development Commands
# ============================================

dev: ## Start development environment (docker compose up -d)
	@echo "Starting development environment..."
	docker compose up -d
	@echo "Development environment started!"
	@echo "  Frontend: http://localhost:4201"
	@echo "  Backend API: http://localhost:3000"
	@echo "  Keycloak: http://localhost:8080"

dev-build: ## Build and start development environment
	@echo "Building development environment..."
	docker compose up -d --build

dev-stop: ## Stop development environment
	@echo "Stopping development environment..."
	docker compose down

dev-logs: ## View development logs (all services)
	docker compose logs -f

dev-logs-backend: ## View backend logs only
	docker compose logs -f backend

dev-logs-frontend: ## View frontend logs only
	docker compose logs -f frontend

dev-logs-keycloak: ## View Keycloak logs only
	docker compose logs -f keycloak

dev-restart: ## Restart development environment
	@echo "Restarting development environment..."
	docker compose restart

dev-clean: ## Stop and remove development containers, volumes, and images
	@echo "Cleaning development environment..."
	docker compose down -v --rmi local

# ============================================
# Production Commands
# ============================================

prod: ## Start production environment (requires .env file)
	@echo "Starting production environment..."
	@if [ ! -f .env ]; then echo "Error: .env file not found. Copy .env.example to .env and configure it."; exit 1; fi
	docker compose -f docker-compose.prod.yml up -d
	@echo "Production environment started!"
	@echo "  Application: http://YOUR_SERVER_IP (or configured domain)"
	@echo "  Keycloak (localhost only): http://127.0.0.1:8080"

prod-build: ## Build and start production environment
	@echo "Building production environment..."
	@if [ ! -f .env ]; then echo "Error: .env file not found. Copy .env.example to .env and configure it."; exit 1; fi
	docker compose -f docker-compose.prod.yml up -d --build

prod-stop: ## Stop production environment
	@echo "Stopping production environment..."
	docker compose -f docker-compose.prod.yml down

prod-logs: ## View production logs (all services)
	docker compose -f docker-compose.prod.yml logs -f

prod-logs-api: ## View API logs only
	docker compose -f docker-compose.prod.yml logs -f content-pool-api

prod-logs-nginx: ## View nginx logs only
	docker compose -f docker-compose.prod.yml logs -f nginx

prod-logs-keycloak: ## View Keycloak logs only
	docker compose -f docker-compose.prod.yml logs -f keycloak

prod-restart: ## Restart production environment
	@echo "Restarting production environment..."
	docker compose -f docker-compose.prod.yml restart

prod-clean: ## Stop and remove production containers, volumes, and images
	@echo "Cleaning production environment..."
	docker compose -f docker-compose.prod.yml down -v --rmi local

# ============================================
# Server Deployment Commands (Pre-built Images)
# ============================================

server-up: ## Deploy on server using pre-built images (requires .env file)
	@echo "Deploying using pre-built images from GHCR..."
	@if [ ! -f .env ]; then echo "Error: .env file not found. Copy .env.example to .env and configure it."; exit 1; fi
	docker compose -f docker-compose.server.yml pull
	docker compose -f docker-compose.server.yml up -d
	@echo "Server deployment complete!"
	@echo "  Application: http://YOUR_SERVER_IP (or configured domain)"

server-stop: ## Stop server deployment
	@echo "Stopping server deployment..."
	docker compose -f docker-compose.server.yml down

server-logs: ## View server deployment logs
	docker compose -f docker-compose.server.yml logs -f

server-update: ## Pull latest images and restart server deployment
	@echo "Updating server deployment..."
	docker compose -f docker-compose.server.yml pull
	docker compose -f docker-compose.server.yml up -d
	@echo "Server deployment updated!"

server-clean: ## Stop and remove server deployment
	@echo "Cleaning server deployment..."
	docker compose -f docker-compose.server.yml down -v

# ============================================
# Build & Push Commands (for GHCR)
# ============================================

build-push: ## Build and push images to GitHub Container Registry
	@echo "Building and pushing images to GHCR..."
	@if [ -z "$(VERSION)" ]; then echo "Error: VERSION not set. Usage: make build-push VERSION=v1.0.0"; exit 1; fi
	docker build -t ghcr.io/iqb-berlin/content-pool-backend:$(VERSION) -f backend/Dockerfile.prod ./backend
	docker build -t ghcr.io/iqb-berlin/content-pool-frontend:$(VERSION) -f frontend/Dockerfile.prod ./frontend
	docker push ghcr.io/iqb-berlin/content-pool-backend:$(VERSION)
	docker push ghcr.io/iqb-berlin/content-pool-frontend:$(VERSION)
	@echo "Images pushed: ghcr.io/iqb-berlin/content-pool-{backend,frontend}:$(VERSION)"

# ============================================
# Database Commands
# ============================================

db-backup: ## Backup database to ./backups/backup_YYYY-MM-DD.sql
	@mkdir -p backups
	@echo "Creating database backup..."
	@FILE="backups/backup_$$(date +%Y-%m-%d_%H-%M-%S).sql"; \
	docker exec content-pool-db pg_dump -U $${POSTGRES_USER:-content_pool} $${POSTGRES_DB:-content_pool} > $$FILE && \
	echo "Backup created: $$FILE"

db-restore: ## Restore database from file (usage: make db-restore FILE=backups/backup_xxx.sql)
	@if [ -z "$(FILE)" ]; then echo "Error: FILE not specified. Usage: make db-restore FILE=backups/backup_xxx.sql"; exit 1; fi
	@if [ ! -f "$(FILE)" ]; then echo "Error: File $(FILE) not found"; exit 1; fi
	@echo "Restoring database from $(FILE)..."
	docker exec -i content-pool-db psql -U $${POSTGRES_USER:-content_pool} $${POSTGRES_DB:-content_pool} < $(FILE)
	@echo "Database restored!"

db-shell: ## Open PostgreSQL shell
	docker exec -it content-pool-db psql -U $${POSTGRES_USER:-content_pool} $${POSTGRES_DB:-content_pool}

db-migrate: ## Run database migrations (TypeORM)
	@echo "Running database migrations..."
	cd backend && npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts

db-migrate-generate: ## Generate new migration (usage: make db-migrate-generate NAME=MigrationName)
	@if [ -z "$(NAME)" ]; then echo "Error: NAME not specified. Usage: make db-migrate-generate NAME=AddNewFeature"; exit 1; fi
	@echo "Generating migration: $(NAME)..."
	cd backend && npx typeorm-ts-node-commonjs migration:generate -d src/database/data-source.ts src/database/migrations/$(NAME)

# ============================================
# Keycloak Commands
# ============================================

keycloak-admin: ## Open Keycloak admin console URL info
	@echo "Keycloak Admin Console:"
	@echo "  Development: http://localhost:8080/admin"
	@echo "  Production (recommended via SSH tunnel):"
	@echo "    ssh -L 8080:127.0.0.1:8080 USER@YOUR_SERVER"
	@echo "    then open http://localhost:8080/admin"
	@echo ""
	@echo "Default credentials:"
	@echo "  Username: admin"
	@echo "  Password: (from .env file or 'admin' for dev)"

keycloak-logs: ## View Keycloak logs
	docker compose logs -f keycloak

keycloak-export: ## Export Keycloak realm to JSON file
	@echo "Exporting Keycloak realm..."
	mkdir -p keycloak-exports
	docker exec keycloak /opt/keycloak/bin/kc.sh export --realm iqb --file /tmp/realm-export.json
	docker cp keycloak:/tmp/realm-export.json keycloak-exports/realm-export-$$(date +%Y%m%d-%H%M%S).json
	@echo "Realm exported to keycloak-exports/"

# ============================================
# Utility Commands
# ============================================

status: ## Show running containers status
	@echo "=== Development Containers ==="
	docker compose ps
	@echo ""
	@echo "=== Production Containers ==="
	docker compose -f docker-compose.prod.yml ps 2>/dev/null || echo "Production not running"

logs: ## View logs for all running services
	@echo "Use 'make dev-logs' or 'make prod-logs' for specific environment"

shell-backend: ## Open shell in backend container (dev)
	docker compose exec backend sh

shell-api: ## Open shell in API container (prod)
	docker compose -f docker-compose.prod.yml exec content-pool-api sh

clean: ## Remove all stopped containers, unused images, and volumes
	@echo "Cleaning Docker resources..."
	docker system prune -f
	docker volume prune -f

update: ## Pull latest images and restart (production)
	@echo "Updating production environment..."
	docker compose -f docker-compose.prod.yml pull
	docker compose -f docker-compose.prod.yml up -d

# ============================================
# Build Commands
# ============================================

build-backend: ## Build backend Docker image
	docker build -t content-pool-backend ./backend

build-frontend: ## Build frontend Docker image
	docker build -t content-pool-frontend ./frontend

build-prod: ## Build production images
	docker compose -f docker-compose.prod.yml build

# ============================================
# Helper Scripts
# ============================================

init-keycloak: ## Initialize Keycloak realm (check and verify setup)
	@./scripts/init-keycloak.sh \
		"$(shell grep OIDC_PUBLIC_ISSUER_URL .env 2>/dev/null | cut -d= -f2 | sed 's|/realms/.*||' || echo http://localhost:8080)" \
		"$(shell grep KEYCLOAK_ADMIN_USER .env 2>/dev/null | cut -d= -f2 || echo admin)" \
		"$(shell grep KEYCLOAK_ADMIN_PASSWORD .env 2>/dev/null | cut -d= -f2 || echo admin)"

health: ## Check health of all services
	@echo "Checking development environment..."
	@./scripts/check-health.sh dev \
		"http://localhost:8080" \
		"http://localhost:3000/api" \
		"http://localhost:4201"

health-prod: ## Check health of production services
	@echo "Checking production environment..."
	@source .env && ./scripts/check-health.sh prod \
		"$$OIDC_PUBLIC_ISSUER_URL" \
		"http://localhost/api" \
		"http://localhost"

# ============================================
# Testing & Development
# ============================================

test-backend: ## Run backend tests
	cd backend && npm test

test-frontend: ## Run frontend tests
	cd frontend && npm test

lint-backend: ## Run backend linter
	cd backend && npm run lint

lint-frontend: ## Run frontend linter
	cd frontend && npm run lint

dev-setup: ## Initial development setup (install dependencies)
	@echo "Setting up development environment..."
	cd backend && npm install --legacy-peer-deps
	cd frontend && npm install --legacy-peer-deps
	@echo "Setup complete! Run 'make dev' to start."
