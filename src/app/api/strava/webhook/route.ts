import { NextResponse } from 'next/server';

const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ?? 'ai-coach-strava-webhook';

/**
 * Strava webhook endpoint.
 * GET  – validace subscription (hub.challenge)
 * POST – notifikace o nových/aktualizovaných aktivitách
 *
 * @see https://developers.strava.com/docs/webhooks/
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const challenge = url.searchParams.get('hub.challenge');
  const verifyToken = url.searchParams.get('hub.verify_token');

  if (mode === 'subscribe' && verifyToken === VERIFY_TOKEN && challenge) {
    return NextResponse.json({ 'hub.challenge': challenge });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const event = await request.json();

    console.log('[Strava webhook]', {
      object_type: event.object_type,
      aspect_type: event.aspect_type,
      object_id: event.object_id,
      owner_id: event.owner_id,
    });

    // Pro produkci: zde spustit async sync job pro danou aktivitu

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('[Strava webhook]', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
