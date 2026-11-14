import React, { useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { subscribeEmployeeToPush } from '../utils/pushUtils';

export default function PushSubscribeButton({ initiallySubscribed = false }) {
  const [subscribed, setSubscribed] = useState(initiallySubscribed);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  async function handleSubscribe() {
    setLoading(true);
    setError('');
    setFeedback('');
    try {
      await subscribeEmployeeToPush();
      setSubscribed(true);
      setFeedback('Shift reminders enabled for 10:30 AM & 6:00 PM IST.');
    } catch (err) {
      setError(err.message || 'Could not enable reminders.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
          subscribed
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        } disabled:opacity-60`}
      >
        {subscribed ? (
          <BellRing className="h-4 w-4 text-emerald-600" />
        ) : (
          <Bell className="h-4 w-4 text-slate-500" />
        )}
        {loading
          ? 'Enabling Reminders...'
          : subscribed
            ? 'Reminders Subscribed (Tap to Refresh)'
            : 'Subscribe to Reminders'}
      </button>
      {feedback && (
        <p className="mt-2 text-center text-xs font-medium text-emerald-700">
          {feedback}
        </p>
      )}
      {error && (
        <p className="mt-2 text-center text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

