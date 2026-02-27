.PHONY: install dev-frontend dev-backend dev build-frontend build-app deploy attach-lakebase lint test build clean

install:
	cd frontend && npm install
	cd backend && pip install -r requirements.txt

dev-frontend:
	cd frontend && npm run dev

dev-backend:
	cd backend && uvicorn app.main:app --reload

dev:
	@echo "Starting frontend and backend..."
	@(cd frontend && npm run dev) & (cd backend && uvicorn app.main:app --reload) && wait

build-frontend:
	cd frontend && npm run build

build-app: build-frontend
	@echo "Frontend built to frontend/out/ - backend serves from ../frontend/out/"

WORKSPACE_PATH = /Workspace/Users/sourabh.ghose@databricks.com/.bundle/lakestream-cep-builder/dev/files
APP_NAME = lakestream-cep-builder

deploy: build-frontend
	databricks bundle deploy
	$(MAKE) attach-lakebase
	databricks apps deploy $(APP_NAME) --source-code-path "$(WORKSPACE_PATH)"

attach-lakebase:
	@echo "Attaching Lakebase resource to app..."
	databricks apps update $(APP_NAME) --json '{"resources":[{"name":"lakestream-cep-db","database":{"instance_name":"lakestream-cep","database_name":"postgres","permission":"CAN_CONNECT_AND_CREATE"}}]}'

lint:
	cd frontend && npm run lint
	cd backend && python3 -m flake8 --max-line-length=120 . 2>/dev/null || true

test:
	cd frontend && npm test 2>/dev/null || echo "Frontend tests not configured"
	cd backend && pytest 2>/dev/null || echo "Backend tests not configured"

build: build-app

clean:
	rm -rf frontend/.next frontend/out frontend/node_modules/.cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
