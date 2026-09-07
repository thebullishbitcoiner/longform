import { NextResponse } from 'next/server';
import { getProMonthlyPriceSats, getProYearlyPriceSats } from '@/server/billing/proPayment';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    monthlyPriceSats: getProMonthlyPriceSats(),
    yearlyPriceSats: getProYearlyPriceSats(),
  });
}
