import { describe, expect, it, vi } from 'vitest';
import { EventMediaClient, EventMediaUnavailableError } from './eventMediaClient.js';

describe('event media client', () => {
  it('batches temporary URL resolution and sends the shared secret', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ urls: [{ fileId: 'hero-1', url: 'https://temp.example/hero.jpg' }] }), { status: 200 }));
    const client = new EventMediaClient({ baseUrl: 'https://media.example/function', sharedSecret: 'x'.repeat(32), fetchImpl });
    const urls = await client.temporaryUrls(['hero-1', 'hero-1', 'thumb-1']);
    expect(urls.get('hero-1')).toBe('https://temp.example/hero.jpg');
    expect(fetchImpl).toHaveBeenCalledWith('https://media.example/function', expect.objectContaining({ method: 'POST' }));
    const request = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).get('x-worthrun-event-media-secret')).toBe('x'.repeat(32));
    expect(JSON.parse(String(request.body))).toEqual({ action: 'temporary-url', fileIds: ['hero-1', 'thumb-1'] });
  });

  it('fails closed when CloudBase is not configured', async () => {
    const client = new EventMediaClient();
    await expect(client.temporaryUrls(['file-1'])).rejects.toBeInstanceOf(EventMediaUnavailableError);
  });
});
