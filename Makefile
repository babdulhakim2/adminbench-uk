.PHONY: up down reset smoke evaluate lock-services

up:
	docker compose up --build

down:
	docker compose down --volumes

reset:
	node scripts/reset-stack.mjs

smoke:
	node scripts/smoke-test.mjs

evaluate:
	python3 scripts/evaluate_run.py

lock-services:
	npm run lock:services
