from fastapi.testclient import TestClient

from asx_trade_finder.api import app


def test_health_endpoint():
    client = TestClient(app)
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_signals_endpoint_returns_sample_signals():
    client = TestClient(app)
    response = client.get('/signals')
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert {'ticker', 'score', 'status'}.issubset(data[0].keys())
