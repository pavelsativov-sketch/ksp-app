'use server'
import 'server-only';
import { NextResponse } from 'next/server';
import { runExecutor } from '@/lib/agents/computer/execute';

export async function POST(request: Request) {
  const secret = process.env.EXECUTOR_TEST_SECRET;
  const header = request.headers.get('x-exec-test-secret');
  if (!secret || header !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const command = body.command;
  const args = Array.isArray(body.args) ? body.args : [];

  const res = await runExecutor('test-user', String(command ?? ''), args as string[]);
  return NextResponse.json(res);
}
