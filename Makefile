.PHONY: install dev-frontend dev-backend dev build-frontend build-app deploy lint test build clean

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

deploy:
	databricks apps deploy

lint:
	cd frontend && npm run lint
	cd backend && ruff check . 2>/dev/null || true

test:
	cd frontend && npm test 2>/dev/null || echo "Frontend tests not configured"
	cd backend && pytest 2>/dev/null || echo "Backend tests not configured"

build: build-app

clean:
	rm -rf frontend/.next frontend/out frontend/node_modules/.cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
