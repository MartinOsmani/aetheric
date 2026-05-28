.PHONY: install backend frontend dev demo eval test clean help

help:
	@echo "Aetheric — common tasks"
	@echo "  make install                    Install backend (uv sync) + frontend (npm)"
	@echo "  make backend                    Run FastAPI on :8000"
	@echo "  make frontend                   Run Vite/React on :5173"
	@echo "  make dev                        Reminder to run backend + frontend in two terminals"
	@echo "  make demo PLAYBOOK=attribution  Drive the canned demo replay"
	@echo "  make demo PLAYBOOK=media_buying"
	@echo "  make eval                       Run attribution eval harness (accuracy + calibration)"
	@echo "  make test                       Run pytest"
	@echo "  make clean                      Remove .venv, node_modules, caches"

install:
	cd backend && uv sync
	cd frontend && npm install

backend:
	cd backend && set -a && . ../.env && set +a && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

dev:
	@echo "Run in two terminals:"
	@echo "  make backend"
	@echo "  make frontend"

PLAYBOOK ?= attribution
demo:
	cd backend && set -a && . ../.env && set +a && uv run python -m app.demo.replay --playbook=$(PLAYBOOK)

eval:
	cd backend && set -a && . ../.env && set +a && uv run python -m app.playbooks.attribution.eval_harness

test:
	cd backend && uv run pytest -q

clean:
	rm -rf backend/.venv backend/.ruff_cache backend/.pytest_cache
	rm -rf frontend/node_modules frontend/dist
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
