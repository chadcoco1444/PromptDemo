import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../src/lib/pg', () => ({ getPool: () => ({ query: mockQuery }) }));

vi.mock('../../src/lib/s3', () => ({
  getS3Client: () => ({}),
  getS3Bucket: () => 'test-bucket',
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

vi.mock('../../src/auth', () => ({
  isAuthEnabled: () => true,
  auth: vi.fn().mockResolvedValue({ user: { id: '42' } }),
}));

import { GET } from '../../src/app/api/jobs/[jobId]/download/route';

describe('GET /api/jobs/[jobId]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid type param', async () => {
    const req = new Request('http://localhost/api/jobs/abc/download?type=invalid');
    const res = await GET(req, { params: { jobId: 'abc' } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when job not found or not owned', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const req = new Request('http://localhost/api/jobs/abc/download?type=mp4');
    const res = await GET(req, { params: { jobId: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when video_url is null', async () => {
    mockQuery.mockResolvedValue({ rows: [{ video_url: null, storyboard_uri: null }] });
    const req = new Request('http://localhost/api/jobs/abc/download?type=mp4');
    const res = await GET(req, { params: { jobId: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 307 redirect to presigned URL for valid mp4 request', async () => {
    mockQuery.mockResolvedValue({ rows: [{ video_url: 's3://test-bucket/jobs/abc/video.mp4', storyboard_uri: 's3://test-bucket/jobs/abc/storyboard.json' }] });
    const req = new Request('http://localhost/api/jobs/abc/download?type=mp4');
    const res = await GET(req, { params: { jobId: 'abc' } });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('presigned-url');
  });

  it('returns 307 redirect to presigned URL for valid storyboard request', async () => {
    mockQuery.mockResolvedValue({ rows: [{ video_url: 's3://test-bucket/jobs/abc/video.mp4', storyboard_uri: 's3://test-bucket/jobs/abc/storyboard.json' }] });
    const req = new Request('http://localhost/api/jobs/abc/download?type=storyboard');
    const res = await GET(req, { params: { jobId: 'abc' } });
    expect(res.status).toBe(307);
  });
});
