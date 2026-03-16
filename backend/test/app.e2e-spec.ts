import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

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
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth', () => {
    it('POST /api/auth/login - should login with seeded admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      authToken = res.body.accessToken;
    });

    it('POST /api/auth/login - should reject bad credentials', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong' })
        .expect(401);
    });

    it('GET /api/auth/profile - should return profile with token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.username).toBe('admin');
      expect(res.body.isAppAdmin).toBe(true);
    });

    it('GET /api/auth/profile - should reject without token', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .expect(401);
    });
  });

  describe('Users', () => {
    let createdUserId: string;

    it('POST /api/users - should create user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ username: 'testuser', password: 'password123', displayName: 'Test' })
        .expect(201);

      expect(res.body.username).toBe('testuser');
      createdUserId = res.body.id;
    });

    it('GET /api/users - should list users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('DELETE /api/users/:id - should delete user', async () => {
      await request(app.getHttpServer())
        .delete(`/api/users/${createdUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('ACP', () => {
    let acpId: string;

    it('POST /api/acp - should create ACP', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/acp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ packageId: 'e2e-test', name: 'E2E Test ACP' })
        .expect(201);

      expect(res.body.packageId).toBe('e2e-test');
      acpId = res.body.id;
    });

    it('GET /api/acp/:id/index - should return ACP-Index', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/acp/${acpId}/index`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.packageId).toBe('e2e-test');
    });

    it('POST /api/acp/:id/snapshots - should create snapshot', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/acp/${acpId}/snapshots`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ changelog: 'E2E test snapshot' })
        .expect(201);

      expect(res.body.versionNumber).toBe(1);
    });

    it('DELETE /api/acp/:id - should delete ACP', async () => {
      await request(app.getHttpServer())
        .delete(`/api/acp/${acpId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('Admin', () => {
    it('GET /api/admin/settings - should return settings', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.language).toBeDefined();
    });
  });

  describe('Public Views', () => {
    it('GET /api/view/acp - should return public ACPs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/view/acp')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
