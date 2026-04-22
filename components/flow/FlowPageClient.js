'use client';

import dynamic from 'next/dynamic';

const FlowClient = dynamic(() => import('./FlowClient'), { ssr: false });

export default function FlowPageClient({ flows, flowsByCycle, donorIndustries }) {
  return <FlowClient flows={flows} flowsByCycle={flowsByCycle} donorIndustries={donorIndustries} />;
}
