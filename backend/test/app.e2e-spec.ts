import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';

if (!process.env.DB_HOST) process.env.DB_HOST = 'localhost';
if (!process.env.DB_PORT) process.env.DB_PORT = '5433';
if (!process.env.DB_USERNAME) process.env.DB_USERNAME = 'contentpool';
if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = 'contentpool_dev';
if (!process.env.DB_DATABASE) process.env.DB_DATABASE = 'contentpool';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';
if (!process.env.OIDC_ISSUER_URL) process.env.OIDC_ISSUER_URL = 'http://localhost:8080/realms/iqb';
if (!process.env.OIDC_PUBLIC_ISSUER_URL) process.env.OIDC_PUBLIC_ISSUER_URL = process.env.OIDC_ISSUER_URL;
if (!process.env.OIDC_CLIENT_ID) process.env.OIDC_CLIENT_ID = 'contentpool';

/**
 * E2E test for the ContentPool API.
 *
 * Prerequisites: a running PostgreSQL instance with the database configured
 * as per .env or environment variables.
 *
 * Run with: npm run test:e2e
 */
describe('ContentPool API (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let authToken: string;
  let testUsername: string;
  let testPackageId: string;

  jest.setTimeout(30000);

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();

    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    testUsername = `testuser_${uniqueSuffix}`;
    testPackageId = `e2e-test-${uniqueSuffix}`;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Auth', () => {
    it('POST /api/auth/login - should reject local admin login', async () => {
      await request(server)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin' })
        .expect(401);
    });

    it('POST /api/auth/oidc-callback - should login as OIDC admin', async () => {
      const res = await request(server)
        .post('/api/auth/oidc-callback')
        .send({ idToken: 'mock-id-token' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user?.isAppAdmin).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      authToken = res.body.accessToken;
    });

    it('POST /api/auth/login - should reject bad credentials', async () => {
      await request(server)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong' })
        .expect(401);
    });

    it('GET /api/auth/profile - should return profile with token', async () => {
      const res = await request(server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(typeof res.body.username).toBe('string');
      expect(res.body.isAppAdmin).toBe(true);
    });

    it('GET /api/auth/profile - should reject without token', async () => {
      await request(server)
        .get('/api/auth/profile')
        .expect(401);
    });
  });

  describe('Users', () => {
    let createdUserId: string;

    it('POST /api/users - should create user', async () => {
      const res = await request(server)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ username: testUsername, password: 'password123', displayName: 'Test' })
        .expect(201);

      expect(res.body.username).toBe(testUsername);
      createdUserId = res.body.id;
    });

    it('GET /api/users - should list users', async () => {
      const res = await request(server)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('DELETE /api/users/:id - should delete user', async () => {
      await request(server)
        .delete(`/api/users/${createdUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('ACP', () => {
    let acpId: string;

    it('POST /api/acp - should create ACP', async () => {
      const res = await request(server)
        .post('/api/acp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ packageId: testPackageId, name: 'E2E Test ACP' })
        .expect(201);

      expect(res.body.packageId).toBe(testPackageId);
      acpId = res.body.id;
    });

    it('GET /api/acp/:id/index - should return ACP-Index', async () => {
      const res = await request(server)
        .get(`/api/acp/${acpId}/index`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.packageId).toBe(testPackageId);
    });

    it('POST /api/acp/:id/snapshots - should create snapshot', async () => {
      const res = await request(server)
        .post(`/api/acp/${acpId}/snapshots`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ changelog: 'E2E test snapshot' })
        .expect(201);

      expect(res.body.versionNumber).toBe(1);
    });

    it('DELETE /api/acp/:id - should delete ACP', async () => {
      await request(server)
        .delete(`/api/acp/${acpId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('Admin', () => {
    it('GET /api/admin/settings - should return settings', async () => {
      const res = await request(server)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.language).toBeDefined();
    });
  });

  describe('Public Views', () => {
    it('GET /api/view/acp - should return public ACPs', async () => {
      const res = await request(server)
        .get('/api/view/acp')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
