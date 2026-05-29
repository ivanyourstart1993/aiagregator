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
  DeleteObjectsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandOutput,
  type _Object as S3Object,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { randomBytes } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';

/** Thrown by uploadStream when the incoming body exceeds the byte cap. */
export class UploadTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`upload exceeds max size of ${maxBytes} bytes`);
    this.name = 'UploadTooLargeError';
  }
}

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
  private readonly publicBaseUrl: string | null;
  private readonly forcePathStyle: boolean;

  constructor(private readonly config: ConfigService) {
    this.endpoint = this.config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000';
    // Public-facing base URL used to build URLs returned to API consumers.
    // Required because S3_ENDPOINT is typically the cluster-internal addon
    // host (e.g. Northflank's *.addon.code.run) which is NOT resolvable from
    // the public internet. When set, getObjectUrl returns
    //   ${S3_PUBLIC_BASE_URL}/${key}
    // and a public proxy endpoint (FilesController) streams the bytes from
    // the internal MinIO. Leave unset only in local dev with a directly
    // exposed MinIO.
    this.publicBaseUrl =
      this.config.get<string>('S3_PUBLIC_BASE_URL')?.replace(/\/+$/, '') ??
      null;
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

  /**
   * Stream an object into MinIO without buffering the whole body in memory.
   * Uses lib-storage's multipart Upload so arbitrarily large bodies (e.g.
   * reference videos) flow through in 5MB parts. A size-counting Transform
   * aborts the upload as soon as the cumulative bytes exceed `maxBytes`, so
   * a malicious client can't exhaust memory or disk by lying about length.
   *
   * Rejects with UploadTooLargeError on overflow; the partial multipart
   * upload is aborted by lib-storage automatically when the Body stream
   * errors.
   */
  async uploadStream(input: {
    key: string;
    body: Readable;
    contentType: string;
    maxBytes: number;
  }): Promise<UploadResult> {
    await this.ensureBucket().catch(() => undefined);
    let total = 0;
    const guard = new Transform({
      transform(chunk: Buffer, _enc, cb): void {
        total += chunk.length;
        if (total > input.maxBytes) {
          cb(new UploadTooLargeError(input.maxBytes));
          return;
        }
        cb(null, chunk);
      },
    });
    // Propagate source errors (client abort, socket reset) into the guard so
    // the Upload below rejects instead of hanging.
    input.body.on('error', (err) => guard.destroy(err));
    const piped = input.body.pipe(guard);

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: input.key,
        Body: piped,
        ContentType: input.contentType,
      },
      queueSize: 4,
      partSize: 5 * 1024 * 1024,
    });
    await upload.done();
    return {
      bucket: this.bucket,
      key: input.key,
      size: total,
      url: this.getObjectUrl(input.key),
    };
  }

  getObjectUrl(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }
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

  /**
   * Fetch an object's body + metadata so a public controller can stream it
   * to the caller. The S3 client itself talks to the internal addon over
   * cluster networking; we just re-emit the bytes through the public API.
   */
  async getObject(key: string): Promise<GetObjectCommandOutput> {
    return this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  // Delete up to 1000 objects in one S3 round-trip. S3 hard limit is 1000
  // per DeleteObjects request — the caller batches if it has more.
  async deleteMany(keys: string[]): Promise<{ deleted: number; failed: number }> {
    if (keys.length === 0) return { deleted: 0, failed: 0 };
    if (keys.length > 1000) {
      throw new RangeError(
        `deleteMany accepts up to 1000 keys per call, got ${keys.length}`,
      );
    }
    const res = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    const failed = res.Errors?.length ?? 0;
    return { deleted: keys.length - failed, failed };
  }

  // Yield batches of object keys + LastModified under a prefix. Lazy so the
  // caller can stop after the first batch that lands inside the TTL window.
  async *listObjectsByPrefix(
    prefix: string,
    pageSize = 1000,
  ): AsyncGenerator<Array<{ key: string; lastModified: Date; size: number }>> {
    let continuationToken: string | undefined = undefined;
    do {
      const res: ListObjectsV2CommandOutput = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          MaxKeys: pageSize,
          ContinuationToken: continuationToken,
        }),
      );
      const items = (res.Contents ?? [])
        .filter((o: S3Object) => typeof o.Key === 'string' && !!o.LastModified)
        .map((o: S3Object) => ({
          key: o.Key as string,
          lastModified: o.LastModified as Date,
          size: o.Size ?? 0,
        }));
      if (items.length > 0) yield items;
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
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
