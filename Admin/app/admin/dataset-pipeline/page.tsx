'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DatasetPipelineRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin');
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 text-sm">Redirecting to Admin Dashboard...</p>
      </div>
    </div>
  );
}
