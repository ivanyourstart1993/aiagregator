// Lightweight S3/MinIO uploader for the worker process. Mirrors the
// StorageService used in the API module but stays self-contained so that
// the worker tsconfig (rootDir=src) doesn't need cross-app path aliases.
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { randomBytes } from 'node:crypto';

export interface WorkerStorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

export class WorkerStorage {
  private readonly client: S3Client;
  public readonly bucket: string;
  private readonly endpoint: string;
  private readonly forcePathStyle: boolean;
  private bucketEnsured = false;

  constructor(cfg: WorkerStorageConfig) {
    this.endpoint = cfg.endpoint;
    this.bucket = cfg.bucket;
    this.forcePathStyle = cfg.forcePathStyle;
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      forcePathStyle: cfg.forcePathStyle,
    });
  }

  static fromEnv(): WorkerStorage {
    return new WorkerStorage({
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      region: process.env.S3_REGION ?? 'us-east-1',
      accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
      bucket: process.env.S3_BUCKET ?? 'aiagg-results',
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    });
  }

  async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.bucketEnsured = true;
      return;
    } catch (err) {
      const status =
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode ?? 0;
      if (status !== 404 && status !== 301 && status !== 0) throw err;
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      const code = (err as { name?: string }).name;
      if (
        code !== 'BucketAlreadyOwnedByYou' &&
        code !== 'BucketAlreadyExists'
      ) {
        throw err;
      }
    }
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    };
    try {
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify(policy),
        }),
      );
    } catch {
      /* swallow — best effort */
    }
    this.bucketEnsured = true;
  }

  buildKey(opts: {
    userId: string;
    taskId: string;
    filename: string;
  }): string {
    const safe = opts.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = Date.now().toString(36);
    const rand = randomBytes(3).toString('hex');
    const dot = safe.lastIndexOf('.');
    const base = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : '';
    return `results/${opts.userId}/${opts.taskId}/${base}-${stamp}${rand}${ext}`;
  }

  getObjectUrl(key: string): string {
    const ep = this.endpoint.replace(/\/+$/, '');
    if (this.forcePathStyle) return `${ep}/${this.bucket}/${key}`;
    try {
      const u = new URL(ep);
      return `${u.protocol}//${this.bucket}.${u.host}/${key}`;
    } catch {
      return `${ep}/${this.bucket}/${key}`;
    }
  }

  async upload(input: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
  }): Promise<{ url: string; bucket: string; key: string; size: number }> {
    await this.ensureBucket();
    const size = input.body.length;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: size,
      }),
    );
    return {
      url: this.getObjectUrl(input.key),
      bucket: this.bucket,
      key: input.key,
      size,
    };
  }
}
