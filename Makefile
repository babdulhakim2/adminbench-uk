.PHONY: up down reset smoke evaluate browsergym-config browsergym-smoke lock-services

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

browsergym-config:
	python3 scripts/browsergym_adminbench.py --print-config

browsergym-smoke:
	python3 scripts/browsergym_adminbench.py --smoke --headless

lock-services:
	npm run lock:services
