import { type ArgumentMetadata, BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ErrorCode } from '@aiagg/shared';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      throw new BadRequestException({
        code: ErrorCode.INVALID_PARAMETERS,
        message: 'Invalid request parameters.',
        details: { issues },
      });
    }
    return parsed.data;
  }
}
