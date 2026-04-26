import {
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { randomBytes } from 'node:crypto';

export interface UploadInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  url: string;
  bucket: string;
  key: string;
  size: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly forcePathStyle: boolean;

  constructor(private readonly config: ConfigService) {
    this.endpoint = this.config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000';
    const region = this.config.get<string>('S3_REGION') ?? 'us-east-1';
    const accessKeyId =
      this.config.get<string>('S3_ACCESS_KEY') ?? 'minioadmin';
    const secretAccessKey =
      this.config.get<string>('S3_SECRET_KEY') ?? 'minioadmin';
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'aiagg-results';
    this.forcePathStyle =
      (this.config.get<string>('S3_FORCE_PATH_STYLE') ?? 'true') === 'true';

    this.client = new S3Client({
      endpoint: this.endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: this.forcePathStyle,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`storage init failed (will retry on first use): ${m}`);
    }
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (err) {
      const status =
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode ?? 0;
      if (status !== 404 && status !== 301 && status !== 0) {
        throw err;
      }
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`bucket created: ${this.bucket}`);
    } catch (err) {
      const code = (err as { name?: string }).name;
      if (
        code !== 'BucketAlreadyOwnedByYou' &&
        code !== 'BucketAlreadyExists'
      ) {
        throw err;
      }
    }
    // Public read policy
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
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`failed to set bucket policy: ${m}`);
    }
  }

  buildResultKey(opts: {
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

  async upload(input: UploadInput): Promise<UploadResult> {
    await this.ensureBucket().catch(() => undefined);
    const size = input.contentLength ?? input.body.length;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: size,
        Metadata: input.metadata,
      }),
    );
    return {
      bucket: this.bucket,
      key: input.key,
      size,
      url: this.getObjectUrl(input.key),
    };
  }

  getObjectUrl(key: string): string {
    const ep = this.endpoint.replace(/\/+$/, '');
    if (this.forcePathStyle) return `${ep}/${this.bucket}/${key}`;
    // Virtual-hosted style: bucket as subdomain (best-effort)
    try {
      const u = new URL(ep);
      return `${u.protocol}//${this.bucket}.${u.host}/${key}`;
    } catch {
      return `${ep}/${this.bucket}/${key}`;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async headObject(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  get bucketName(): string {
    return this.bucket;
  }
}
