import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const email = (body.email || '').trim().toLowerCase();
    const context = (body.context || '').trim().slice(0, 200);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const db = getDb();

    const { error } = await db
      .from('email_signups')
      .upsert({ email, context, updated_at: new Date().toISOString() }, { onConflict: 'email' });

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ ok: true, note: 'table_not_created' });
      }
      console.error('subscribe error:', error);
      return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
