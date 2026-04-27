import { NextResponse } from 'next/server';
import { apiPost, ApiError } from '@/lib/api-client';

interface Body {
  subject?: unknown;
  message?: unknown;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  if (typeof body.subject !== 'string' || typeof body.message !== 'string') {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'subject and message required' } },
      { status: 400 },
    );
  }

  try {
    await apiPost('/internal/support', {
      subject: body.subject,
      message: body.message,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: { code: 'internal_error', message: String(err) } },
      { status: 500 },
    );
  }
}
