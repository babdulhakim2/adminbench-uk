.PHONY: up down reset smoke lock-services

up:
	docker compose up --build

down:
	docker compose down --volumes

reset:
	node scripts/reset-stack.mjs

smoke:
	node scripts/smoke-test.mjs

lock-services:
	npm run lock:services
