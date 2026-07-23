import { INestApplication } from '@nestjs/common';

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';

import { CustomConfigService } from '../src/modules/config/config.service';
import {
  clearBatches,
  getBatchRepo,
  seedBatch,
} from './fixtures/batches.fixtures';
import { clearPicoUnits, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('BatchIdImagesV1Controller (e2e)', () => {
  let app: INestApplication;
  let batchImageUploadDir: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    const configService = app.get(CustomConfigService);
    batchImageUploadDir = path.join(configService.upload.imageDir, 'batches');
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await clearBatches(app);
    await clearPicoUnits(app);
    if (fs.existsSync(batchImageUploadDir)) {
      for (const entry of fs.readdirSync(batchImageUploadDir)) {
        const dir = path.join(batchImageUploadDir, entry);
        if (fs.statSync(dir).isDirectory()) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    }
  });

  // ─── Middleware ───────────────────────────────────────────────────────────

  describe('middleware validation', () => {
    it('returns 422 for a non-numeric id on PUT', async () => {
      await request(app.getHttpServer())
        .put('/v1/batches/abc/images')
        .expect(422);
    });

    it('returns 404 when the batch does not exist on PUT', async () => {
      await request(app.getHttpServer())
        .put('/v1/batches/99999/images')
        .expect(404);
    });

    it('returns 422 for a non-numeric id on DELETE', async () => {
      await request(app.getHttpServer())
        .delete('/v1/batches/abc/images/1.jpg')
        .expect(422);
    });

    it('returns 404 when the batch does not exist on DELETE', async () => {
      await request(app.getHttpServer())
        .delete('/v1/batches/99999/images/1.jpg')
        .expect(404);
    });
  });

  // ─── PUT /batches/:batchId/images ────────────────────────────────────────

  describe('PUT /batches/:batchId/images', () => {
    it('uploads a single JPEG file and stores the filename', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      const imageBuffer = Buffer.from('fake-jpeg-data', 'utf-8');

      const res = await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', imageBuffer, 'test.jpg')
        .expect(200);

      expect(res.body).toHaveProperty('id', batch.id);
      expect(res.body.images).toEqual(['1.jpg']);
      expect(res.body.images_url).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            new RegExp(
              `^http://localhost:\\d+/images/batches/${batch.id}/1\\.jpg$`,
            ),
          ),
        ]),
      );

      const repo = await getBatchRepo(app);
      const persisted = await repo.findOneBy({ id: batch.id });
      expect(persisted!.images).toEqual(['1.jpg']);

      const filePath = path.join(
        batchImageUploadDir,
        String(batch.id),
        '1.jpg',
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('uploads a PNG file', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      const imageBuffer = Buffer.from('fake-png-data', 'utf-8');

      const res = await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', imageBuffer, 'test.png')
        .expect(200);

      expect(res.body.images).toEqual(['1.png']);

      const filePath = path.join(
        batchImageUploadDir,
        String(batch.id),
        '1.png',
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('uploads multiple files at once and assigns sequential slots', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      const buf1 = Buffer.from('fake-jpeg-1', 'utf-8');
      const buf2 = Buffer.from('fake-jpeg-2', 'utf-8');
      const buf3 = Buffer.from('fake-png-3', 'utf-8');

      const res = await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', buf1, 'a.jpg')
        .attach('images', buf2, 'b.jpg')
        .attach('images', buf3, 'c.png')
        .expect(200);

      expect(res.body.images).toHaveLength(3);
      expect(res.body.images).toContain('1.jpg');
      expect(res.body.images).toContain('2.jpg');
      expect(res.body.images).toContain('3.png');
      expect(res.body.images_url).toHaveLength(3);
    });

    it('appends new images to existing ones (additive)', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      // First upload
      const buf1 = Buffer.from('fake-jpeg-1', 'utf-8');
      await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', buf1, 'first.jpg')
        .expect(200);

      // Second upload
      const buf2 = Buffer.from('fake-png-2', 'utf-8');
      const res = await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', buf2, 'second.png')
        .expect(200);

      expect(res.body.images).toHaveLength(2);
      expect(res.body.images).toContain('1.jpg');
      expect(res.body.images).toContain('2.png');
    });

    it('returns 400 when file type is not allowed', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      const imageBuffer = Buffer.from('fake-gif-data', 'utf-8');

      const res = await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', imageBuffer, 'test.gif')
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body.message).toContain('Invalid file type');
    });

    it('returns 409 when batch already has 5 images', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      // Upload 5 images
      for (let i = 1; i <= 5; i++) {
        const buf = Buffer.from(`fake-data-${i}`, 'utf-8');
        await request(app.getHttpServer())
          .put(`/v1/batches/${batch.id}/images`)
          .attach('images', buf, `${i}.jpg`)
          .expect(200);
      }

      // 6th should fail
      const buf = Buffer.from('fake-data-6', 'utf-8');
      const res = await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', buf, '6.jpg')
        .expect(409);

      expect(res.body).toHaveProperty('statusCode', 409);
      expect(res.body.message).toContain('5');
    });

    it('sets images to empty array when no images exist', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      const res = await request(app.getHttpServer())
        .get(`/v1/batches/${batch.id}`)
        .expect(200);

      expect(res.body.images).toEqual([]);
      expect(res.body.images_url).toEqual([]);
    });
  });

  // ─── DELETE /batches/:batchId/images/:filename ───────────────────────────

  describe('DELETE /batches/:batchId/images/:filename', () => {
    it('removes the image and deletes the file from disk', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      const buf = Buffer.from('fake-jpeg-data', 'utf-8');
      await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', buf, 'test.jpg')
        .expect(200);

      const filePath = path.join(
        batchImageUploadDir,
        String(batch.id),
        '1.jpg',
      );
      expect(fs.existsSync(filePath)).toBe(true);

      await request(app.getHttpServer())
        .delete(`/v1/batches/${batch.id}/images/1.jpg`)
        .expect(204);

      expect(fs.existsSync(filePath)).toBe(false);

      const repo = await getBatchRepo(app);
      const persisted = await repo.findOneBy({ id: batch.id });
      expect(persisted!.images).toBeNull();
    });

    it('removes only the targeted image, keeping others', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      // Upload 2 images
      await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', Buffer.from('data-1', 'utf-8'), 'a.jpg')
        .attach('images', Buffer.from('data-2', 'utf-8'), 'b.jpg')
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/v1/batches/${batch.id}/images/1.jpg`)
        .expect(204);

      const repo = await getBatchRepo(app);
      const persisted = await repo.findOneBy({ id: batch.id });
      expect(persisted!.images).toEqual(['2.jpg']);
    });

    it('returns 404 when image filename is not found', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      const res = await request(app.getHttpServer())
        .delete(`/v1/batches/${batch.id}/images/nonexistent.jpg`)
        .expect(404);

      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body.message).toContain('not found');
    });

    it('returns 400 for path traversal in filename', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      await request(app.getHttpServer())
        .delete(`/v1/batches/${batch.id}/images/..%2F..%2Fetc%2Fpasswd`)
        .expect(400);
    });

    it('returns 400 for filename with slashes', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      await request(app.getHttpServer())
        .delete(`/v1/batches/${batch.id}/images/sub/dir/file.jpg`)
        .expect(404);
    });
  });

  // ─── Slot refill ────────────────────────────────────────────────────────

  describe('slot refill', () => {
    it('refills the first free slot after deletion', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      // Upload 3 images: slots 1, 2, 3
      await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', Buffer.from('d1', 'utf-8'), 'a.jpg')
        .attach('images', Buffer.from('d2', 'utf-8'), 'b.jpg')
        .attach('images', Buffer.from('d3', 'utf-8'), 'c.jpg')
        .expect(200);

      // Delete slot 2
      await request(app.getHttpServer())
        .delete(`/v1/batches/${batch.id}/images/2.jpg`)
        .expect(204);

      // Upload new image → should reuse slot 2
      const res = await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', Buffer.from('d4', 'utf-8'), 'd.jpg')
        .expect(200);

      expect(res.body.images).toHaveLength(3);
      expect(res.body.images).toContain('1.jpg');
      expect(res.body.images).toContain('2.jpg');
      expect(res.body.images).toContain('3.jpg');
    });
  });

  // ─── Batch deletion cleanup ─────────────────────────────────────────────

  describe('DELETE /batches/:batchId (image cleanup)', () => {
    it('deletes all uploaded image files when batch is removed', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', Buffer.from('d1', 'utf-8'), 'a.jpg')
        .attach('images', Buffer.from('d2', 'utf-8'), 'b.jpg')
        .expect(200);

      const batchDir = path.join(batchImageUploadDir, String(batch.id));
      expect(fs.existsSync(batchDir)).toBe(true);

      await request(app.getHttpServer())
        .delete(`/v1/batches/${batch.id}`)
        .expect(204);

      expect(fs.existsSync(batchDir)).toBe(false);
    });

    it('does not fail when batch has no images', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      await request(app.getHttpServer())
        .delete(`/v1/batches/${batch.id}`)
        .expect(204);
    });
  });

  // ─── images_url serialization ───────────────────────────────────────────

  describe('images_url computation', () => {
    it('returns absolute URLs for uploaded images', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      await request(app.getHttpServer())
        .put(`/v1/batches/${batch.id}/images`)
        .attach('images', Buffer.from('d1', 'utf-8'), 'a.jpg')
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/v1/batches/${batch.id}`)
        .expect(200);

      expect(res.body.images).toEqual(['1.jpg']);
      expect(res.body.images_url).toHaveLength(1);
      expect(res.body.images_url[0]).toMatch(
        new RegExp(
          `^http://localhost:\\d+/images/batches/${batch.id}/1\\.jpg$`,
        ),
      );
    });

    it('returns empty arrays when batch has no images', async () => {
      const pico = await seedPicoUnit(app);
      const batch = await seedBatch(app, pico.id);

      const res = await request(app.getHttpServer())
        .get(`/v1/batches/${batch.id}`)
        .expect(200);

      expect(res.body.images).toEqual([]);
      expect(res.body.images_url).toEqual([]);
    });
  });
});
