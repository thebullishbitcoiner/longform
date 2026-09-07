import { NextResponse } from 'next/server';
import { getLegendPriceSats } from '@/server/billing/legendPayment';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ priceSats: getLegendPriceSats() });
}
