import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES } from '../src/routes.js';

const call = (path, query) => ROUTES[path](new URLSearchParams(query));

test('close approaches forwards only allow-listed params', () => {
  const url = call('/api/close-approaches', 'date-max=%2B30&dist-max=5LD&evil=1&date-min=now');
  assert.equal(url.host, 'ssd-api.jpl.nasa.gov');
  assert.equal(url.searchParams.get('dist-max'), '5LD');
  assert.equal(url.searchParams.get('evil'), null);
  assert.equal(url.searchParams.get('diameter'), 'true');
});

test('orbit lookup validates the designation', () => {
  assert.equal(call('/api/orbit', 'des=2025 UK9').searchParams.get('sstr'), '2025 UK9');
  assert.equal(call('/api/orbit', 'des=<script>'), null);
  assert.equal(call('/api/orbit', ''), null);
});

test('flyby builds a Horizons query and rejects other bodies', () => {
  const url = call('/api/flyby', 'body=54555159&jd=2461344.837');
  assert.equal(url.host, 'ssd.jpl.nasa.gov');
  assert.equal(url.searchParams.get('COMMAND'), "'DES=54555159;'");
  assert.equal(url.searchParams.get('CENTER'), "'500@399'");
  assert.equal(call('/api/flyby', 'body=moon&jd=2461344.5').searchParams.get('COMMAND'), "'301'");
  assert.equal(call('/api/flyby', 'body=399&jd=2461344.5'), null); // Earth itself: not allowed
  assert.equal(call('/api/flyby', 'body=moon&jd=soon'), null);
});
