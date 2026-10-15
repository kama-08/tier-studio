export {};

const origin = process.env.TEST_BASE_URL;
if (!origin) throw new Error('TEST_BASE_URL is required.');

const expected = await Bun.file('dist/web/index.html').text();
const url = new URL('/index.html', origin);
// Avoid reusing a cached response from an earlier verification attempt.
url.searchParams.set('verify', crypto.randomUUID());

let lastFailure = 'No response received.';
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    const response = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok && (await response.text()) === expected) {
      console.log('Published HTML matches the production build tested by CI.');
      process.exit(0);
    }
    lastFailure = `HTTP ${response.status}; the published HTML does not match the tested build.`;
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : 'Network request failed.';
  }
  console.log(`Deployment verification attempt ${attempt}/6: ${lastFailure}`);
  if (attempt < 6) await Bun.sleep(5_000);
}

throw new Error(`Production verification failed: ${lastFailure}`);
