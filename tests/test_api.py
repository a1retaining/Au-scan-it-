from fastapi.testclient import TestClient

from asx_trade_finder.api import app


client = TestClient(app)


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'
    assert payload['service'] == 'asx-trade-finder-api'


def test_signals_endpoint_returns_sample_signals():
    response = client.get('/signals')
    assert response.status_code == 200
    payload = response.json()
    assert 'signals' in payload
    data = payload['signals']
    assert isinstance(data, list)
    assert len(data) >= 1
    assert {'ticker', 'score', 'status'}.issubset(data[0].keys())


def test_keepalive():
    response = client.get('/keepalive')
    assert response.status_code == 200
    assert response.json()['status'] == 'awake'


def test_refresh_endpoint():
    response = client.post('/refresh')
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert 'signals' in payload
