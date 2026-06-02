import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { logEvent } from 'firebase/analytics';
import { analytics } from '../lib/firebase';

export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    if (analytics) {
      logEvent(analytics, 'page_view', {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }, [location]);

  return null;
}
