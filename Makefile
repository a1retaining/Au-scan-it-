.PHONY: install test scan backtest api frontend-build keepalive clean

install:
	python -m pip install --upgrade pip
	pip install -r requirements.txt
	pip install -e .

test:
	pytest -q

scan:
	python -m asx_trade_finder.scanner --input data/sample/sample_watchlist.csv --prices data/sample/prices --output outputs/scanner_output.csv --json-output outputs/scanner_output.json

backtest:
	python -m asx_trade_finder.backtest --input data/sample/sample_watchlist.csv --prices data/sample/prices --output outputs/backtest_results.csv

api:
	uvicorn asx_trade_finder.api:app --reload

frontend-build:
	cd frontend && npm install && npm run build

keepalive:
	python scripts/keepalive_render.py

clean:
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf .pytest_cache frontend/dist frontend/node_modules
